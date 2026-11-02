export type ColumnId = "good" | "improve" | "bad"

/** Column order on the board. Titles are translated on the client. */
export const COLUMNS: ColumnId[] = ["good", "improve", "bad"]

/** Server errors travel as codes so each client shows them in its own language. */
export type ErrorCode =
  | "name_required"
  | "not_in_board"
  | "board_not_found"
  | "board_finished"
  | "join_failed"
  | "card_title_required"
  | "invalid_column"
  | "card_not_found"
  | "delete_forbidden"
  | "merge_same_card"
  | "merge_same_column"
  | "not_grouped"
  | "clear_host_only"
  | "invalid_youtube"
  | "playlist_host_only"
  | "track_not_found"
  | "timer_host_only"
  | "timer_range"
  | "timer_not_running"
  | "timer_nothing_to_resume"
  | "settings_host_only"
  | "finish_host_only"
  | "reopen_host_only"
  | "too_many_changes"
  | "create_failed"
  | "unexpected"
  | "noop"

export interface CardItem {
  id: string
  text: string
  authorId: string
  authorName: string
  createdAt: number
}

/** A card holds one item, or several once cards are merged together. */
export interface Card {
  id: string
  column: ColumnId
  items: CardItem[]
  createdAt: number
}

export interface Track {
  id: string
  videoId: string
  title: string
  addedBy: string
}

export interface Participant {
  id: string
  name: string
  online: boolean
  joinedAt: number
}

export interface TimerState {
  durationSec: number
  /** Epoch ms when the countdown hits zero; null while stopped or paused. */
  endsAt: number | null
  /** Remaining ms while paused or stopped. */
  remainingMs: number
}

export interface BoardSettings {
  /** When true every participant can manage the playlist, not only the host. */
  playlistOpen: boolean
}

export interface Board {
  id: string
  title: string
  hostId: string
  createdAt: number
  finishedAt: number | null
  settings: BoardSettings
  participants: Record<string, Participant>
  cards: Card[]
  playlist: Track[]
  currentTrack: number
  timer: TimerState
}

export interface BoardSnapshot {
  board: Board
  serverTime: number
}

export interface CreateBoardRequest {
  title: string
  hostId: string
  hostName: string
  playlistOpen: boolean
}

export type Ack = { ok: true } | { ok: false; error: ErrorCode }

export interface ClientToServerEvents {
  "board:join": (
    payload: { boardId: string; participantId: string; name: string },
    ack: (res: { ok: true; snapshot: BoardSnapshot } | { ok: false; error: ErrorCode }) => void,
  ) => void
  "card:add": (payload: { column: ColumnId; text: string }, ack: (res: Ack) => void) => void
  "card:move": (payload: { cardId: string; column: ColumnId }, ack: (res: Ack) => void) => void
  "card:delete": (payload: { cardId: string }, ack: (res: Ack) => void) => void
  "card:merge": (payload: { sourceId: string; targetId: string }, ack: (res: Ack) => void) => void
  "card:split": (payload: { cardId: string }, ack: (res: Ack) => void) => void
  "column:clear": (payload: { column: ColumnId }, ack: (res: Ack) => void) => void
  "track:add": (payload: { url: string }, ack: (res: Ack) => void) => void
  "track:remove": (payload: { trackId: string }, ack: (res: Ack) => void) => void
  "track:play": (payload: { index: number }, ack: (res: Ack) => void) => void
  "track:ended": (payload: { index: number }) => void
  "presence:ping": () => void
  "track:title": (payload: { trackId: string; title: string }) => void
  "timer:start": (payload: { durationSec: number }, ack: (res: Ack) => void) => void
  "timer:pause": (ack: (res: Ack) => void) => void
  "timer:resume": (ack: (res: Ack) => void) => void
  "timer:reset": (ack: (res: Ack) => void) => void
  "settings:update": (payload: Partial<BoardSettings>, ack: (res: Ack) => void) => void
  "board:finish": (ack: (res: Ack) => void) => void
  "board:reopen": (ack: (res: Ack) => void) => void
}

export interface ServerToClientEvents {
  "board:state": (snapshot: BoardSnapshot) => void
}

export function canManagePlaylist(board: Board, participantId: string) {
  return board.hostId === participantId || board.settings.playlistOpen
}

export const PLACEHOLDER_TITLE = "Vídeo do YouTube"

/** True for titles we could not resolve server-side (placeholder or a bare URL). */
export function isPlaceholderTitle(title: string) {
  return title === PLACEHOLDER_TITLE || /^https?:\/\//i.test(title.trim())
}

export function parseYouTubeId(input: string): string | null {
  const value = input.trim()
  if (/^[\w-]{11}$/.test(value)) return value
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "")
    if (host === "youtu.be") return validId(url.pathname.slice(1))
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = url.searchParams.get("v")
      if (v) return validId(v)
      const match = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/)
      if (match) return match[2]
    }
  } catch {
    return null
  }
  return null
}

function validId(id: string) {
  const clean = id.split(/[/?&#]/)[0]
  return /^[\w-]{11}$/.test(clean) ? clean : null
}
