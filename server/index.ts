import { createServer } from "node:http"
import { existsSync } from "node:fs"
import path from "node:path"
import express from "express"
import { customAlphabet, nanoid } from "nanoid"
import { Server, type Socket } from "socket.io"
import {
  COLUMNS,
  canManagePlaylist,
  parseYouTubeId,
  type Ack,
  type Board,
  type ClientToServerEvents,
  type CreateBoardRequest,
  type ServerToClientEvents,
} from "../shared/types.ts"
import { getBoard, loadBoards, putBoard, scheduleSave } from "./store.ts"

const PORT = Number(process.env.PORT ?? 3101)
const MAX_NAME = 40
const MAX_CARD_TEXT = 500
const MAX_TIMER_SEC = 60 * 60

const boardId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 8)

interface SocketData {
  boardId?: string
  participantId?: string
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

loadBoards()

const app = express()
app.use(express.json())

app.post("/api/boards", (req, res) => {
  const body = req.body as Partial<CreateBoardRequest>
  const hostName = String(body.hostName ?? "").trim().slice(0, MAX_NAME)
  const hostId = String(body.hostId ?? "").trim()
  if (!hostName || !hostId) {
    res.status(400).json({ error: "Informe seu nome para criar o board." })
    return
  }
  const now = Date.now()
  const title =
    String(body.title ?? "").trim().slice(0, 80) ||
    `Retro de ${new Date(now).toLocaleDateString("pt-BR")}`
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
  putBoard(board)
  res.status(201).json({ id: board.id })
})

app.get("/api/boards/:id", (req, res) => {
  const board = getBoard(req.params.id)
  if (!board) {
    res.status(404).json({ error: "Board não encontrado." })
    return
  }
  res.json({ id: board.id, title: board.title })
})

// In production the server also serves the built frontend.
const dist = path.resolve(import.meta.dirname, "../dist")
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")))
}

const httpServer = createServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
)

function broadcast(board: Board) {
  scheduleSave()
  io.to(board.id).emit("board:state", { board, serverTime: Date.now() })
}

function fail(error: string): Ack {
  return { ok: false, error }
}

/**
 * Wraps a handler with the common lookups: the socket must have joined a board,
 * and any successful mutation is broadcast to the room.
 */
function withBoard(
  socket: AppSocket,
  handler: (board: Board, me: string) => Ack,
  opts: { allowWhenFinished?: boolean } = {},
): Ack {
  const { boardId, participantId } = socket.data
  const board = boardId ? getBoard(boardId) : undefined
  if (!board || !participantId) return fail("Você não está em um board.")
  if (board.finishedAt && !opts.allowWhenFinished) return fail("Esta retro já foi encerrada.")
  const result = handler(board, participantId)
  if (result.ok) broadcast(board)
  return result
}

const isHost = (board: Board, id: string) => board.hostId === id
const OK: Ack = { ok: true }

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
      const title = (await source())?.trim()
      if (title) return title.slice(0, 200)
    } catch {
      // Try the next source.
    }
  }
  return null
}

function refreshPresence(board: Board) {
  const online = new Set<string>()
  for (const s of io.sockets.adapter.rooms.get(board.id) ?? []) {
    const pid = io.sockets.sockets.get(s)?.data.participantId
    if (pid) online.add(pid)
  }
  for (const p of Object.values(board.participants)) p.online = online.has(p.id)
}

io.on("connection", (socket: AppSocket) => {
  socket.on("board:join", ({ boardId, participantId, name }, ack) => {
    const board = getBoard(boardId)
    const cleanName = String(name ?? "").trim().slice(0, MAX_NAME)
    if (!board) return ack({ ok: false, error: "Board não encontrado." })
    if (!cleanName || !participantId) return ack({ ok: false, error: "Informe seu nome para entrar." })

    socket.data = { boardId, participantId }
    socket.join(boardId)
    const existing = board.participants[participantId]
    board.participants[participantId] = {
      id: participantId,
      name: cleanName,
      online: true,
      joinedAt: existing?.joinedAt ?? Date.now(),
    }
    refreshPresence(board)
    ack({ ok: true, snapshot: { board, serverTime: Date.now() } })
    broadcast(board)
  })

  socket.on("disconnect", () => {
    const board = socket.data.boardId ? getBoard(socket.data.boardId) : undefined
    if (!board) return
    refreshPresence(board)
    broadcast(board)
  })

  socket.on("card:add", ({ column, text }, ack) =>
    ack(
      withBoard(socket, (board, me) => {
        const clean = String(text ?? "").trim().slice(0, MAX_CARD_TEXT)
        if (!clean) return fail("O card precisa de um título.")
        if (!COLUMNS.some((c) => c.id === column)) return fail("Coluna inválida.")
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
              authorName: board.participants[me]?.name ?? "Anônimo",
              createdAt: now,
            },
          ],
        })
        return OK
      }),
    ),
  )

  socket.on("card:delete", ({ cardId }, ack) =>
    ack(
      withBoard(socket, (board, me) => {
        const card = board.cards.find((c) => c.id === cardId)
        if (!card) return fail("Card não encontrado.")
        const isAuthor = card.items.every((i) => i.authorId === me)
        if (!isAuthor && !isHost(board, me)) return fail("Só o autor ou o host podem remover este card.")
        board.cards = board.cards.filter((c) => c.id !== cardId)
        return OK
      }),
    ),
  )

  socket.on("card:merge", ({ sourceId, targetId }, ack) =>
    ack(
      withBoard(socket, (board) => {
        if (sourceId === targetId) return fail("Escolha outro card.")
        const source = board.cards.find((c) => c.id === sourceId)
        const target = board.cards.find((c) => c.id === targetId)
        if (!source || !target) return fail("Card não encontrado.")
        if (source.column !== target.column) return fail("Só dá para agrupar cards da mesma coluna.")
        target.items.push(...source.items)
        board.cards = board.cards.filter((c) => c.id !== sourceId)
        return OK
      }),
    ),
  )

  socket.on("card:split", ({ cardId }, ack) =>
    ack(
      withBoard(socket, (board) => {
        const index = board.cards.findIndex((c) => c.id === cardId)
        const card = board.cards[index]
        if (!card || card.items.length < 2) return fail("Este card não está agrupado.")
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

  socket.on("column:clear", ({ column }, ack) =>
    ack(
      withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("Só o host pode limpar colunas.")
        board.cards = board.cards.filter((c) => c.column !== column)
        return OK
      }),
    ),
  )

  socket.on("track:add", async ({ url }, ack) => {
    const videoId = parseYouTubeId(String(url ?? ""))
    if (!videoId) return ack(fail("Link do YouTube inválido."))
    // Check permission before the network call, then again inside withBoard.
    const pre = socket.data.boardId ? getBoard(socket.data.boardId) : undefined
    if (pre && socket.data.participantId && !canManagePlaylist(pre, socket.data.participantId)) {
      return ack(fail("Só o host pode mexer na playlist desta retro."))
    }
    const title = (await fetchTitle(videoId)) ?? "Vídeo do YouTube"
    ack(
      withBoard(
        socket,
        (board, me) => {
          if (!canManagePlaylist(board, me)) return fail("Só o host pode mexer na playlist desta retro.")
          board.playlist.push({
            id: nanoid(10),
            videoId,
            title,
            addedBy: board.participants[me]?.name ?? "Anônimo",
          })
          return OK
        },
        { allowWhenFinished: true },
      ),
    )
  })

  socket.on("track:remove", ({ trackId }, ack) =>
    ack(
      withBoard(
        socket,
        (board, me) => {
          if (!canManagePlaylist(board, me)) return fail("Só o host pode mexer na playlist desta retro.")
          const index = board.playlist.findIndex((t) => t.id === trackId)
          if (index === -1) return fail("Música não encontrada.")
          board.playlist.splice(index, 1)
          if (index < board.currentTrack) board.currentTrack--
          board.currentTrack = Math.min(board.currentTrack, Math.max(board.playlist.length - 1, 0))
          return OK
        },
        { allowWhenFinished: true },
      ),
    ),
  )

  socket.on("track:play", ({ index }, ack) =>
    ack(
      withBoard(
        socket,
        (board, me) => {
          if (!canManagePlaylist(board, me)) return fail("Só o host pode mexer na playlist desta retro.")
          if (!Number.isInteger(index) || index < 0 || index >= board.playlist.length) {
            return fail("Música não encontrada.")
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
  socket.on("track:ended", ({ index }) => {
    withBoard(
      socket,
      (board) => {
        if (index !== board.currentTrack || index >= board.playlist.length - 1) return fail("noop")
        board.currentTrack++
        return OK
      },
      { allowWhenFinished: true },
    )
  })

  socket.on("timer:start", ({ durationSec }, ack) =>
    ack(
      withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("Só o host controla o cronômetro.")
        const sec = Math.round(Number(durationSec))
        if (!Number.isFinite(sec) || sec < 1 || sec > MAX_TIMER_SEC) return fail("Escolha entre 1s e 60min.")
        board.timer = { durationSec: sec, endsAt: Date.now() + sec * 1000, remainingMs: sec * 1000 }
        return OK
      }),
    ),
  )

  socket.on("timer:pause", (ack) =>
    ack(
      withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("Só o host controla o cronômetro.")
        if (!board.timer.endsAt) return fail("O cronômetro não está rodando.")
        board.timer.remainingMs = Math.max(board.timer.endsAt - Date.now(), 0)
        board.timer.endsAt = null
        return OK
      }),
    ),
  )

  socket.on("timer:resume", (ack) =>
    ack(
      withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("Só o host controla o cronômetro.")
        if (board.timer.endsAt || board.timer.remainingMs <= 0) return fail("Nada para retomar.")
        board.timer.endsAt = Date.now() + board.timer.remainingMs
        return OK
      }),
    ),
  )

  socket.on("timer:reset", (ack) =>
    ack(
      withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("Só o host controla o cronômetro.")
        board.timer = { ...board.timer, endsAt: null, remainingMs: board.timer.durationSec * 1000 }
        return OK
      }),
    ),
  )

  socket.on("settings:update", (patch, ack) =>
    ack(
      withBoard(
        socket,
        (board, me) => {
          if (!isHost(board, me)) return fail("Só o host altera as configurações.")
          if (typeof patch.playlistOpen === "boolean") board.settings.playlistOpen = patch.playlistOpen
          return OK
        },
        { allowWhenFinished: true },
      ),
    ),
  )

  socket.on("board:finish", (ack) =>
    ack(
      withBoard(socket, (board, me) => {
        if (!isHost(board, me)) return fail("Só o host pode encerrar a retro.")
        board.finishedAt = Date.now()
        if (board.timer.endsAt) {
          board.timer.remainingMs = Math.max(board.timer.endsAt - Date.now(), 0)
          board.timer.endsAt = null
        }
        return OK
      }),
    ),
  )

  socket.on("board:reopen", (ack) =>
    ack(
      withBoard(
        socket,
        (board, me) => {
          if (!isHost(board, me)) return fail("Só o host pode reabrir a retro.")
          board.finishedAt = null
          return OK
        },
        { allowWhenFinished: true },
      ),
    ),
  )
})

httpServer.listen(PORT, () => {
  console.log(`[backbeat] servidor em http://localhost:${PORT}`)
})
