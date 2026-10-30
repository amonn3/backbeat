import { createServer } from "node:http"
import { existsSync } from "node:fs"
import path from "node:path"
import { createAdapter } from "@socket.io/redis-adapter"
import express from "express"
import { customAlphabet, nanoid } from "nanoid"
import { createClient } from "redis"
import { Server, type Socket } from "socket.io"
import {
  COLUMNS,
  PLACEHOLDER_TITLE,
  canManagePlaylist,
  isPlaceholderTitle,
  parseYouTubeId,
  type Ack,
  type Board,
  type ClientToServerEvents,
  type ErrorCode,
  type CreateBoardRequest,
  type ServerToClientEvents,
} from "../shared/types.js"
import { fileStore, redisStore, type Store } from "./store.js"

const MAX_NAME = 40
const MAX_CARD_TEXT = 500
const MAX_TIMER_SEC = 60 * 60
export const SOCKET_PATH = "/api/socket.io"

const boardId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 8)

interface SocketData {
  boardId?: string
  participantId?: string
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

const app = express()
app.use(express.json())

const httpServer = createServer(app)
const io: AppServer = new Server(httpServer, { path: SOCKET_PATH })

// With Redis (production on Vercel) every instance shares boards and rooms;
// without it everything lives in this process, which is fine for local dev.
const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL
let store: Store
if (redisUrl) {
  const pub = createClient({ url: redisUrl })
  const sub = pub.duplicate()
  pub.on("error", (err) => console.error("[redis]", err.message))
  sub.on("error", (err) => console.error("[redis]", err.message))
  await Promise.all([pub.connect(), sub.connect()])
  io.adapter(createAdapter(pub, sub))
  store = redisStore(pub)
  console.log("[store] usando Redis")
} else {
  store = fileStore()
}

const OK: Ack = { ok: true }
const fail = (error: ErrorCode): Ack => ({ ok: false, error })
const isHost = (board: Board, id: string) => board.hostId === id

/**
 * Presence lives in the store, refreshed by client pings. Asking the other
 * instances (fetchSockets) is unreliable on Vercel: suspended instances keep
 * their Redis subscription but never answer, so every call would time out.
 */
async function withPresence(board: Board) {
  const online = await store.onlineParticipants(board.id)
  for (const p of Object.values(board.participants)) p.online = online.has(p.id)
  return { board, serverTime: Date.now() }
}

async function broadcast(board: Board) {
  io.to(board.id).emit("board:state", await withPresence(board))
}

/**
 * Runs a mutation against the socket's board: the socket must have joined,
 * finished retros are read-only unless allowed, and successful changes are
 * persisted atomically and broadcast to the room.
 */
async function withBoard(
  socket: AppSocket,
  handler: (board: Board, me: string) => Ack,
  opts: { allowWhenFinished?: boolean } = {},
): Promise<Ack> {
  const { boardId, participantId } = socket.data
  if (!boardId || !participantId) return fail("not_in_board")
  try {
    const res = await store.mutate(boardId, (board) => {
      if (board.finishedAt && !opts.allowWhenFinished) {
        return { commit: false, result: fail("board_finished") }
      }
      const result = handler(board, participantId)
      return { commit: result.ok, result }
    })
    if (!res) return fail("board_not_found")
    if (res.result.ok) await broadcast(res.board)
    return res.result
  } catch (err) {
    console.error("[board]", err)
    return fail(err instanceof Error && err.message === "too_many_changes" ? "too_many_changes" : "unexpected")
  }
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
  return res.ok ? ((await res.json()) as { title?: string }) : {}
}

/**
 * YouTube's oEmbed sometimes omits the title, so fall back to noembed and,
 * as a last resort, the og:title of the watch page.
 */
async function fetchTitle(videoId: string) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`
  const sources = [
    async () => (await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`)).title,
    async () => (await getJson(`https://noembed.com/embed?url=${encodeURIComponent(watch)}`)).title,
    async () => {
      const res = await fetch(watch, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "Mozilla/5.0" } })
      const html = res.ok ? await res.text() : ""
      const raw = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]
      return raw
        ?.replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
    },
  ]
  for (const source of sources) {
    try {
      // From datacenter IPs YouTube sometimes answers with the URL or a generic name.
      const title = (await source())?.trim()
      if (title && !isPlaceholderTitle(title) && title !== "YouTube") return title.slice(0, 200)
    } catch {
      // Try the next source.
    }
  }
  return null
}

app.post("/api/boards", async (req, res) => {
  const body = req.body as Partial<CreateBoardRequest>
  const hostName = String(body.hostName ?? "").trim().slice(0, MAX_NAME)
  const hostId = String(body.hostId ?? "").trim()
  if (!hostName || !hostId) {
    res.status(400).json({ error: "name_required" })
    return
  }
  const now = Date.now()
  // The client sends a title in the creator's language; this is only a fallback.
  const title = String(body.title ?? "").trim().slice(0, 80) || `Retro ${new Date(now).toISOString().slice(0, 10)}`
  const board: Board = {
    id: boardId(),
    title,
    hostId,
    createdAt: now,
    finishedAt: null,
    settings: { playlistOpen: Boolean(body.playlistOpen) },
    participants: { [hostId]: { id: hostId, name: hostName, online: false, joinedAt: now } },
    cards: [],
    playlist: [],
    currentTrack: 0,
    timer: { durationSec: 5 * 60, endsAt: null, remainingMs: 5 * 60 * 1000 },
  }
  await store.create(board)
  res.status(201).json({ id: board.id })
})

app.get("/api/boards/:id", async (req, res) => {
  const board = await store.get(req.params.id)
  if (!board) {
    res.status(404).json({ error: "board_not_found" })
    return
  }
  res.json({ id: board.id, title: board.title })
})

// `npm start` serves the built frontend too; on Vercel the CDN does that.
const dist = path.resolve(import.meta.dirname, "../dist")
if (!process.env.VERCEL && existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")))
}

io.on("connection", (socket: AppSocket) => {
  socket.on("board:join", async ({ boardId, participantId, name }, ack) => {
    const cleanName = String(name ?? "").trim().slice(0, MAX_NAME)
    if (!cleanName || !participantId) return ack({ ok: false, error: "name_required" })
    try {
      const res = await store.mutate(boardId, (board) => {
        const existing = board.participants[participantId]
        board.participants[participantId] = {
          id: participantId,
          name: cleanName,
          online: true,
          joinedAt: existing?.joinedAt ?? Date.now(),
        }
        return { commit: existing?.name !== cleanName, result: null }
      })
      if (!res) return ack({ ok: false, error: "board_not_found" })
      socket.data = { boardId, participantId }
      await socket.join(boardId)
      await store.touchPresence(boardId, socket.id, participantId)
      ack({ ok: true, snapshot: await withPresence(res.board) })
      await broadcast(res.board)
    } catch (err) {
      console.error("[join]", err)
      ack({ ok: false, error: "join_failed" })
    }
  })

  socket.on("presence:ping", async () => {
    const { boardId, participantId } = socket.data
    if (boardId && participantId) await store.touchPresence(boardId, socket.id, participantId).catch(() => {})
  })

  socket.on("disconnect", async () => {
    const { boardId, participantId } = socket.data
    if (!boardId || !participantId) return
    try {
      await store.removePresence(boardId, socket.id, participantId)
      const board = await store.get(boardId)
      if (board) await broadcast(board)
    } catch (err) {
      console.error("[disconnect]", err)
    }
  })

  socket.on("card:add", async ({ column, text }, ack) =>
    ack(
      await withBoard(socket, (board, me) => {
        const clean = String(text ?? "").trim().slice(0, MAX_CARD_TEXT)
        if (!clean) return fail("card_title_required")
        if (!COLUMNS.some((c) => c.id === column)) return fail("invalid_column")
        const now = Date.now()
        board.cards.push({
          id: nanoid(10),
          column,
          createdAt: now,
          items: [
            {
              id: nanoid(10),
              text: clean,
              authorId: me,
              authorName: board.participants[me]?.name ?? "—",
              createdAt: now,
            },
          ],
        })
        return OK
      }),
    ),
  )

  socket.on("card:delete", async ({ cardId }, ack) =>
    ack(
      await withBoard(socket, (board, me) => {
        const card = board.cards.find((c) => c.id === cardId)
        if (!card) return fail("card_not_found")
        const isAuthor = card.items.every((i) => i.authorId === me)
        if (!isAuthor && !isHost(board, me)) return fail("delete_forbidden")
        board.cards = board.cards.filter((c) => c.id !== cardId)
        return OK
      }),
    ),
  )

  socket.on("card:merge", async ({ sourceId, targetId }, ack) =>
    ack(
      await withBoard(socket, (board) => {
        if (sourceId === targetId) return fail("merge_same_card")
        const source = board.cards.find((c) => c.id === sourceId)
        const target = board.cards.find((c) => c.id === targetId)
        if (!source || !target) return fail("card_not_found")
        if (source.column !== target.column) return fail("merge_same_column")
        target.items.push(...source.items)
        board.cards = board.cards.filter((c) => c.id !== sourceId)
        return OK
      }),
    ),
  )

  socket.on("card:split", async ({ cardId }, ack) =>
    ack(
      await withBoard(socket, (board) => {
        const index = board.cards.findIndex((c) => c.id === cardId)
        const card = board.cards[index]
        if (!card || card.items.length < 2) return fail("not_grouped")
        const [first, ...rest] = card.items
        card.items = [first]
        const split = rest.map((item) => ({
          id: nanoid(10),
          column: card.column,
          createdAt: item.createdAt,
          items: [item],
        }))
        board.cards.splice(index + 1, 0, ...split)
        return OK
      }),
    ),
  )

  socket.on("column:clear", async ({ column }, ack) =>
    ack(
      await withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("clear_host_only")
        board.cards = board.cards.filter((c) => c.column !== column)
        return OK
      }),
    ),
  )

  socket.on("track:add", async ({ url }, ack) => {
    const videoId = parseYouTubeId(String(url ?? ""))
    if (!videoId) return ack(fail("invalid_youtube"))
    // Check permission before the network call, then again inside withBoard.
    const pre = socket.data.boardId ? await store.get(socket.data.boardId) : undefined
    if (pre && socket.data.participantId && !canManagePlaylist(pre, socket.data.participantId)) {
      return ack(fail("playlist_host_only"))
    }
    const title = (await fetchTitle(videoId)) ?? PLACEHOLDER_TITLE
    ack(
      await withBoard(
        socket,
        (board, me) => {
          if (!canManagePlaylist(board, me)) return fail("playlist_host_only")
          board.playlist.push({
            id: nanoid(10),
            videoId,
            title,
            addedBy: board.participants[me]?.name ?? "—",
          })
          return OK
        },
        { allowWhenFinished: true },
      ),
    )
  })

  // The player in the browser always knows the real title; it fills in tracks
  // the server could not name. Only placeholders can be renamed.
  socket.on("track:title", async ({ trackId, title }) => {
    const clean = String(title ?? "").trim().slice(0, 200)
    if (!clean || isPlaceholderTitle(clean)) return
    await withBoard(
      socket,
      (board) => {
        const track = board.playlist.find((t) => t.id === trackId)
        if (!track || !isPlaceholderTitle(track.title)) return fail("noop")
        track.title = clean
        return OK
      },
      { allowWhenFinished: true },
    )
  })

  socket.on("track:remove", async ({ trackId }, ack) =>
    ack(
      await withBoard(
        socket,
        (board, me) => {
          if (!canManagePlaylist(board, me)) return fail("playlist_host_only")
          const index = board.playlist.findIndex((t) => t.id === trackId)
          if (index === -1) return fail("track_not_found")
          board.playlist.splice(index, 1)
          if (index < board.currentTrack) board.currentTrack--
          board.currentTrack = Math.min(board.currentTrack, Math.max(board.playlist.length - 1, 0))
          return OK
        },
        { allowWhenFinished: true },
      ),
    ),
  )

  socket.on("track:play", async ({ index }, ack) =>
    ack(
      await withBoard(
        socket,
        (board, me) => {
          if (!canManagePlaylist(board, me)) return fail("playlist_host_only")
          if (!Number.isInteger(index) || index < 0 || index >= board.playlist.length) {
            return fail("track_not_found")
          }
          board.currentTrack = index
          return OK
        },
        { allowWhenFinished: true },
      ),
    ),
  )

  // Every client reports the end of a track; only the first report for the
  // current index advances, so the queue moves exactly once.
  socket.on("track:ended", async ({ index }) => {
    await withBoard(
      socket,
      (board) => {
        if (index !== board.currentTrack || index >= board.playlist.length - 1) return fail("noop")
        board.currentTrack++
        return OK
      },
      { allowWhenFinished: true },
    )
  })

  socket.on("timer:start", async ({ durationSec }, ack) =>
    ack(
      await withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("timer_host_only")
        const sec = Math.round(Number(durationSec))
        if (!Number.isFinite(sec) || sec < 1 || sec > MAX_TIMER_SEC) return fail("timer_range")
        board.timer = { durationSec: sec, endsAt: Date.now() + sec * 1000, remainingMs: sec * 1000 }
        return OK
      }),
    ),
  )

  socket.on("timer:pause", async (ack) =>
    ack(
      await withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("timer_host_only")
        if (!board.timer.endsAt) return fail("timer_not_running")
        board.timer.remainingMs = Math.max(board.timer.endsAt - Date.now(), 0)
        board.timer.endsAt = null
        return OK
      }),
    ),
  )

  socket.on("timer:resume", async (ack) =>
    ack(
      await withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("timer_host_only")
        if (board.timer.endsAt || board.timer.remainingMs <= 0) return fail("timer_nothing_to_resume")
        board.timer.endsAt = Date.now() + board.timer.remainingMs
        return OK
      }),
    ),
  )

  socket.on("timer:reset", async (ack) =>
    ack(
      await withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("timer_host_only")
        board.timer = { ...board.timer, endsAt: null, remainingMs: board.timer.durationSec * 1000 }
        return OK
      }),
    ),
  )

  socket.on("settings:update", async (patch, ack) =>
    ack(
      await withBoard(
        socket,
        (board, me) => {
          if (!isHost(board, me)) return fail("settings_host_only")
          if (typeof patch.playlistOpen === "boolean") board.settings.playlistOpen = patch.playlistOpen
          return OK
        },
        { allowWhenFinished: true },
      ),
    ),
  )

  socket.on("board:finish", async (ack) =>
    ack(
      await withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("finish_host_only")
        board.finishedAt = Date.now()
        if (board.timer.endsAt) {
          board.timer.remainingMs = Math.max(board.timer.endsAt - Date.now(), 0)
          board.timer.endsAt = null
        }
        return OK
      }),
    ),
  )

  socket.on("board:reopen", async (ack) =>
    ack(
      await withBoard(
        socket,
        (board, me) => {
          if (!isHost(board, me)) return fail("reopen_host_only")
          board.finishedAt = null
          return OK
        },
        { allowWhenFinished: true },
      ),
    ),
  )
})

export { httpServer }
