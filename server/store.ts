import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { Board } from "../shared/types.js"

/** The few commands the store needs, so any connected redis client fits. */
export interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, opts: { EX: number }): Promise<unknown>
  eval(script: string, opts: { keys: string[]; arguments: string[] }): Promise<unknown>
}

/**
 * Mutations return a result; `commit: true` persists the board. The mutate
 * helper retries the whole function when another instance wrote first.
 */
export type Mutation<T> = (board: Board) => { commit: boolean; result: T }

export interface Store {
  get(id: string): Promise<Board | undefined>
  create(board: Board): Promise<void>
  mutate<T>(id: string, fn: Mutation<T>): Promise<{ board: Board; result: T } | undefined>
}

const BOARD_TTL_SEC = 60 * 60 * 24 * 30
const key = (id: string) => `backbeat:board:${id}`

// Writes only if the stored JSON is still the one we read (compare-and-set).
const CAS_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
  return 1
end
return 0
`

export function redisStore(client: RedisClient): Store {
  return {
    async get(id) {
      const raw = await client.get(key(id))
      return raw ? (JSON.parse(raw) as Board) : undefined
    },
    async create(board) {
      await client.set(key(board.id), JSON.stringify(board), { EX: BOARD_TTL_SEC })
    },
    async mutate(id, fn) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const raw = await client.get(key(id))
        if (!raw) return undefined
        const board = JSON.parse(raw) as Board
        const { commit, result } = fn(board)
        if (!commit) return { board, result }
        const written = await client.eval(CAS_SCRIPT, {
          keys: [key(id)],
          arguments: [raw, JSON.stringify(board), String(BOARD_TTL_SEC)],
        })
        if (written === 1) return { board, result }
      }
      throw new Error("Muitas alterações simultâneas, tente de novo.")
    },
  }
}

/** Single-process store for local development, persisted to data/boards.json. */
export function fileStore(): Store {
  const dataDir = path.resolve(import.meta.dirname, "../data")
  const dataFile = path.join(dataDir, "boards.json")
  const boards = new Map<string, Board>()
  let saveTimer: NodeJS.Timeout | null = null

  if (existsSync(dataFile)) {
    try {
      for (const board of JSON.parse(readFileSync(dataFile, "utf8")) as Board[]) boards.set(board.id, board)
      console.log(`[store] ${boards.size} board(s) carregado(s)`)
    } catch (err) {
      console.error("[store] falha ao ler boards.json", err)
    }
  }

  // Debounced write so a burst of card events produces a single disk write.
  function scheduleSave() {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      mkdirSync(dataDir, { recursive: true })
      writeFileSync(dataFile, JSON.stringify([...boards.values()], null, 2))
    }, 500)
  }

  return {
    async get(id) {
      return boards.get(id)
    },
    async create(board) {
      boards.set(board.id, board)
      scheduleSave()
    },
    async mutate(id, fn) {
      const board = boards.get(id)
      if (!board) return undefined
      const { commit, result } = fn(board)
      if (commit) scheduleSave()
      return { board, result }
    },
  }
}
