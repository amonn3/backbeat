import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { Board } from "../shared/types.ts"

const DATA_DIR = path.resolve(import.meta.dirname, "../data")
const DATA_FILE = path.join(DATA_DIR, "boards.json")

const boards = new Map<string, Board>()
let saveTimer: NodeJS.Timeout | null = null

export function loadBoards() {
  if (!existsSync(DATA_FILE)) return
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Board[]
    for (const board of raw) {
      // Nobody is connected right after a restart.
      for (const p of Object.values(board.participants)) p.online = false
      boards.set(board.id, board)
    }
    console.log(`[store] ${boards.size} board(s) carregado(s)`)
  } catch (err) {
    console.error("[store] falha ao ler boards.json", err)
  }
}

export function getBoard(id: string) {
  return boards.get(id)
}

export function putBoard(board: Board) {
  boards.set(board.id, board)
  scheduleSave()
}

/** Debounced write so a burst of card events produces a single disk write. */
export function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(DATA_FILE, JSON.stringify([...boards.values()], null, 2))
  }, 500)
}
