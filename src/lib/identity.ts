const ID_KEY = "backbeat:participant-id"
const NAME_KEY = "backbeat:name"

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode: identity lives only for this tab.
  }
}

let memoryId: string | null = null

/** Stable id per browser, so reloading the page keeps you the same participant. */
export function getParticipantId() {
  const stored = read(ID_KEY)
  if (stored) return stored
  memoryId ??= crypto.randomUUID()
  write(ID_KEY, memoryId)
  return memoryId
}

export function getSavedName() {
  return read(NAME_KEY) ?? ""
}

export function saveName(name: string) {
  write(NAME_KEY, name.trim())
}

const joinedKey = (boardId: string) => `backbeat:joined:${boardId}`

/** Whether this browser already confirmed a name for the given board. */
export function hasJoined(boardId: string) {
  return read(joinedKey(boardId)) === "1"
}

export function markJoined(boardId: string) {
  write(joinedKey(boardId), "1")
}
