import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { toast } from "sonner"
import type {
  Ack,
  Board,
  BoardSettings,
  ClientToServerEvents,
  ColumnId,
  ErrorCode,
  ServerToClientEvents,
} from "@shared/types"
import { useI18n } from "@/i18n"
import { getParticipantId } from "@/lib/identity"

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type ConnectionStatus = "connecting" | "joined" | "error"

export function useBoard(boardId: string, name: string | null) {
  const [board, setBoard] = useState<Board | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [error, setError] = useState<ErrorCode | null>(null)
  /** serverTime - clientTime, so every browser renders the same countdown. */
  const [clockOffset, setClockOffset] = useState(0)
  const socketRef = useRef<AppSocket | null>(null)
  const { t } = useI18n()
  // Read through a ref so switching language doesn't recreate every action.
  const errorsRef = useRef(t.errors)
  useEffect(() => {
    errorsRef.current = t.errors
  }, [t])
  const participantId = getParticipantId()

  useEffect(() => {
    if (!name) return
    // WebSocket only: Vercel Functions do not support Socket.IO long-polling.
    const socket: AppSocket = io({ path: "/api/socket.io", transports: ["websocket"] })
    socketRef.current = socket

    const join = () => {
      socket.emit("board:join", { boardId, participantId, name }, (res) => {
        if (!res.ok) {
          setStatus("error")
          setError(res.error)
          return
        }
        setBoard(res.snapshot.board)
        setClockOffset(res.snapshot.serverTime - Date.now())
        setStatus("joined")
      })
    }

    socket.on("connect", join)
    // Keeps this tab counted as online; the server expires silent connections.
    const ping = setInterval(() => socket.connected && socket.emit("presence:ping"), 25_000)
    socket.on("disconnect", () => setStatus("connecting"))
    socket.on("board:state", (snapshot) => {
      setBoard(snapshot.board)
      setClockOffset(snapshot.serverTime - Date.now())
    })

    return () => {
      clearInterval(ping)
      socket.disconnect()
      socketRef.current = null
    }
  }, [boardId, name, participantId])

  useEffect(() => {
    const deadline = board?.timer.endsAt
    if (!deadline || board?.timer.completed) return
    const expire = () => socketRef.current?.emit("timer:expire", { endsAt: deadline })
    const timeout = setTimeout(expire, Math.max(0, deadline - Date.now() - clockOffset))
    return () => clearTimeout(timeout)
  }, [board?.timer.endsAt, board?.timer.completed, clockOffset])

  /** Emits an acked event and surfaces server-side rejections as toasts. */
  const call = useCallback((send: (socket: AppSocket, done: (res: Ack) => void) => void) => {
    const socket = socketRef.current
    if (!socket) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      send(socket, (res) => {
        if (!res.ok) toast.error(errorsRef.current[res.error] ?? errorsRef.current.unexpected)
        resolve(res.ok)
      })
    })
  }, [])

  const actions = useMemo(
    () => ({
      addCard: (column: ColumnId, text: string) => call((s, d) => s.emit("card:add", { column, text }, d)),
      moveCard: (cardId: string, column: ColumnId) => call((s, d) => s.emit("card:move", { cardId, column }, d)),
      deleteCard: (cardId: string) => call((s, d) => s.emit("card:delete", { cardId }, d)),
      mergeCards: (sourceId: string, targetId: string) =>
        call((s, d) => s.emit("card:merge", { sourceId, targetId }, d)),
      splitCard: (cardId: string) => call((s, d) => s.emit("card:split", { cardId }, d)),
      clearColumn: (column: ColumnId) => call((s, d) => s.emit("column:clear", { column }, d)),
      addTrack: (url: string) => call((s, d) => s.emit("track:add", { url }, d)),
      removeTrack: (trackId: string) => call((s, d) => s.emit("track:remove", { trackId }, d)),
      playTrack: (index: number) => call((s, d) => s.emit("track:play", { index }, d)),
      setPlayback: (playing: boolean) => call((s, d) => s.emit("playback:set", { playing }, d)),
      trackEnded: (index: number, updatedAt: number) => socketRef.current?.emit("track:ended", { index, updatedAt }),
      nameTrack: (trackId: string, title: string) => socketRef.current?.emit("track:title", { trackId, title }),
      startTimer: (durationSec: number) => call((s, d) => s.emit("timer:start", { durationSec }, d)),
      pauseTimer: () => call((s, d) => s.emit("timer:pause", d)),
      resumeTimer: () => call((s, d) => s.emit("timer:resume", d)),
      resetTimer: () => call((s, d) => s.emit("timer:reset", d)),
      updateSettings: (patch: Partial<BoardSettings>) => call((s, d) => s.emit("settings:update", patch, d)),
      finish: () => call((s, d) => s.emit("board:finish", d)),
      reopen: () => call((s, d) => s.emit("board:reopen", d)),
    }),
    [call],
  )

  return { board, status, error, clockOffset, participantId, actions }
}

export type BoardActions = ReturnType<typeof useBoard>["actions"]
