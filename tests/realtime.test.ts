import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"
import { io, type Socket } from "socket.io-client"
import { playbackPosition, type BoardSnapshot } from "../shared/types.ts"

// Run the real HTTP/Socket.IO server with isolated persistence and offline metadata.
const dataDir = await mkdtemp(path.join(tmpdir(), "backbeat-test-"))
process.env.BACKBEAT_DATA_DIR = dataDir
delete process.env.REDIS_URL
delete process.env.KV_URL
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  if (String(input).startsWith("https://")) return Response.json({ title: "Test soundtrack" })
  return originalFetch(input, init)
}
const { httpServer } = await import("../server/app.ts")
const sockets: Socket[] = []
let base: string

before(async () => {
  httpServer.listen(0, "127.0.0.1")
  await once(httpServer, "listening")
  const address = httpServer.address()
  assert.ok(address && typeof address !== "string")
  base = `http://127.0.0.1:${address.port}`
})

after(async () => {
  for (const socket of sockets) socket.disconnect()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  globalThis.fetch = originalFetch
  // The file store debounces persistence for 500 ms.
  await new Promise((resolve) => setTimeout(resolve, 600))
  await rm(dataDir, { recursive: true, force: true })
})

async function join(id: string, participantId: string) {
  const socket = io(base, { path: "/api/socket.io", transports: ["websocket"], forceNew: true })
  sockets.push(socket)
  await once(socket, "connect")
  let snapshot: BoardSnapshot
  socket.on("board:state", (value) => { snapshot = value })
  const result = await socket.timeout(3000).emitWithAck("board:join", { boardId: id, participantId, name: participantId })
  assert.equal(result.ok, true)
  snapshot = result.snapshot
  return { socket, state: () => snapshot }
}

async function setup(playlistOpen = false) {
  const response = await fetch(`${base}/api/boards`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostId: "host", hostName: "Host", playlistOpen }),
  })
  const { id } = await response.json() as { id: string }
  const host = await join(id, "host")
  const guest = await join(id, "guest")
  return { id, host, guest }
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Timed out waiting for shared state")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test("playlist permissions never grant guests transport controls", async () => {
  const { host, guest } = await setup()
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("track:add", { url: "dQw4w9WgXcQ" }), { ok: false, error: "playlist_host_only" })
  assert.deepEqual(await host.socket.timeout(3000).emitWithAck("settings:update", { playlistOpen: true }), { ok: true })
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("track:add", { url: "dQw4w9WgXcQ" }), { ok: true })
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("track:play", { index: 0 }), { ok: false, error: "playback_host_only" })
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("playback:set", { playing: true }), { ok: false, error: "playback_host_only" })
  const currentId = host.state().board.playlist[0].id
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("track:remove", { trackId: currentId }), { ok: false, error: "playback_host_only" })
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("track:add", { url: "9bZkp7q19f0" }), { ok: true })
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("track:remove", { trackId: host.state().board.playlist[1].id }), { ok: true })
})

test("play, pause, late joins and track endings share a server timeline", async () => {
  const { id, host, guest } = await setup(true)
  await host.socket.timeout(3000).emitWithAck("track:add", { url: "dQw4w9WgXcQ" })
  await host.socket.timeout(3000).emitWithAck("track:add", { url: "9bZkp7q19f0" })
  await host.socket.timeout(3000).emitWithAck("playback:set", { playing: true })
  await waitFor(() => guest.state().board.playback.playing)
  assert.deepEqual(guest.state().board.playback, host.state().board.playback)
  await new Promise((resolve) => setTimeout(resolve, 80))
  const late = await join(id, "late")
  assert.ok(playbackPosition(late.state().board.playback, late.state().serverTime) >= 0.07)
  await host.socket.timeout(3000).emitWithAck("playback:set", { playing: false })
  await waitFor(() => !guest.state().board.playback.playing)
  assert.ok(host.state().board.playback.positionSec >= 0.07)
  const position = host.state().board.playback.positionSec
  assert.equal(playbackPosition(host.state().board.playback, Date.now() + 5000), position)
  await host.socket.timeout(3000).emitWithAck("playback:set", { playing: true })
  const revision = host.state().board.playback.updatedAt
  guest.socket.emit("track:ended", { index: 0, updatedAt: revision })
  await guest.socket.timeout(3000).emitWithAck("track:play", { index: 0 })
  assert.equal(host.state().board.currentTrack, 0)
  host.socket.emit("track:ended", { index: 0, updatedAt: revision })
  await waitFor(() => host.state().board.currentTrack === 1)
  host.socket.emit("track:ended", { index: 0, updatedAt: revision })
  await host.socket.timeout(3000).emitWithAck("playback:set", { playing: false })
  assert.equal(host.state().board.currentTrack, 1)
})

test("cards and groups move between columns and stay locked after finishing", async () => {
  const { host, guest } = await setup()
  await guest.socket.timeout(3000).emitWithAck("card:add", { column: "good", text: "First" })
  await guest.socket.timeout(3000).emitWithAck("card:add", { column: "good", text: "Second" })
  const [first, second] = guest.state().board.cards
  await guest.socket.timeout(3000).emitWithAck("card:merge", { sourceId: first.id, targetId: second.id })
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("card:move", { cardId: second.id, column: "bad" }), { ok: true })
  await waitFor(() => host.state().board.cards[0].column === "bad")
  assert.equal(host.state().board.cards[0].items.length, 2)
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("card:move", { cardId: second.id, column: "invalid" }), { ok: false, error: "invalid_column" })
  await host.socket.timeout(3000).emitWithAck("board:finish")
  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("card:move", { cardId: second.id, column: "good" }), { ok: false, error: "board_finished" })
})

test("timer expiration pauses and collapses once, rejects early reports, and survives late joins", async () => {
  const { id, host, guest } = await setup()
  await host.socket.timeout(3000).emitWithAck("track:add", { url: "dQw4w9WgXcQ" })
  await host.socket.timeout(3000).emitWithAck("playback:set", { playing: true })
  await host.socket.timeout(3000).emitWithAck("timer:start", { durationSec: 1 })
  const deadline = host.state().board.timer.endsAt!
  guest.socket.emit("timer:expire", { endsAt: deadline })
  await host.socket.timeout(3000).emitWithAck("settings:update", {})
  assert.equal(host.state().board.playback.playing, true)
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()) + 20))
  guest.socket.emit("timer:expire", { endsAt: deadline })
  await waitFor(() => host.state().board.timer.completed === true)
  await waitFor(() => guest.state().board.playback.collapsed)
  assert.equal(host.state().board.playback.playing, false)
  const late = await join(id, "late")
  assert.equal(late.state().board.playback.collapsed, true)
  assert.equal(late.state().board.playback.playing, false)
  await host.socket.timeout(3000).emitWithAck("playback:set", { playing: true })
  guest.socket.emit("timer:expire", { endsAt: deadline })
  await host.socket.timeout(3000).emitWithAck("settings:update", {})
  assert.equal(host.state().board.playback.playing, true)
  await host.socket.timeout(3000).emitWithAck("timer:start", { durationSec: 1 })
  await new Promise((resolve) => setTimeout(resolve, 1050))
  // A late join also settles the deadline when no client reports zero.
  const later = await join(id, "later")
  assert.equal(later.state().board.playback.playing, false)
  assert.equal(later.state().board.playback.collapsed, true)
})

test("cards stay hidden from other guests until the host reveals them", async () => {
  const { id, host, guest } = await setup()
  const other = await join(id, "other")
  await guest.socket.timeout(3000).emitWithAck("card:add", { column: "good", text: "Guest secret" })
  await other.socket.timeout(3000).emitWithAck("card:add", { column: "good", text: "Other secret" })
  await waitFor(() => host.state().board.cards.length === 2 && guest.state().board.cards.length === 2)

  // The host sees everything; each guest sees only their own text.
  assert.deepEqual(host.state().board.cards.map((c) => c.items[0].text), ["Guest secret", "Other secret"])
  const [mine, theirs] = guest.state().board.cards
  assert.equal(mine.items[0].text, "Guest secret")
  assert.equal(mine.items[0].hidden, undefined)
  assert.deepEqual(theirs.items[0], { id: theirs.items[0].id, text: "", authorId: "", authorName: "", createdAt: theirs.items[0].createdAt, hidden: true })
  assert.ok(!JSON.stringify(guest.state()).includes("Other secret"))

  // Merged cards keep hiding the items the viewer did not write.
  await guest.socket.timeout(3000).emitWithAck("card:merge", { sourceId: theirs.id, targetId: mine.id })
  await waitFor(() => guest.state().board.cards.length === 1)
  assert.deepEqual(guest.state().board.cards[0].items.map((i) => i.text), ["Guest secret", ""])

  // A late joiner gets the filtered snapshot in the join ack too.
  const late = await join(id, "late")
  assert.ok(!JSON.stringify(late.state()).includes("secret"))

  assert.deepEqual(await guest.socket.timeout(3000).emitWithAck("cards:reveal"), { ok: false, error: "reveal_host_only" })
  assert.deepEqual(await host.socket.timeout(3000).emitWithAck("cards:reveal"), { ok: true })
  await waitFor(() => other.state().board.cardsRevealed === true)
  assert.deepEqual(other.state().board.cards[0].items.map((i) => i.text), ["Guest secret", "Other secret"])
  assert.equal(other.state().board.cards[0].items[0].authorName, "guest")
  assert.deepEqual(await host.socket.timeout(3000).emitWithAck("cards:reveal"), { ok: false, error: "already_revealed" })
})

test("finishing a retro reveals hidden cards for the report", async () => {
  const { host, guest } = await setup()
  await host.socket.timeout(3000).emitWithAck("card:add", { column: "bad", text: "Host only" })
  await waitFor(() => guest.state().board.cards.length === 1)
  assert.equal(guest.state().board.cards[0].items[0].hidden, true)
  await host.socket.timeout(3000).emitWithAck("board:finish")
  await waitFor(() => guest.state().board.finishedAt !== null)
  assert.equal(guest.state().board.cards[0].items[0].text, "Host only")
})
