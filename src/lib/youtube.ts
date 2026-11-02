/** Minimal typing for the bits of the YouTube IFrame API we use. */
export interface YTPlayer {
  loadVideoById(id: string, startSeconds?: number): void
  cueVideoById(id: string, startSeconds?: number): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getPlayerState(): number
  stopVideo(): void
  destroy(): void
  getVideoData(): { title?: string; video_id?: string }
  setVolume(volume: number): void
  mute(): void
  unMute(): void
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId?: string
      width?: string
      height?: string
      playerVars?: Record<string, number | string>
      events?: { onStateChange?: (e: { data: number }) => void; onReady?: () => void; onAutoplayBlocked?: () => void }
    },
  ) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; CUED: number }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let loading: Promise<YTNamespace> | null = null

const VOLUME_KEY = "backbeat:volume"

/** Each listener keeps their own volume; it is never shared with the room. */
export function loadVolume(): { volume: number; muted: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? "null")
    if (typeof saved?.volume === "number") return { volume: saved.volume, muted: Boolean(saved.muted) }
  } catch {
    // Unreadable or blocked storage: use the default.
  }
  return { volume: 70, muted: false }
}

export function saveVolume(value: { volume: number; muted: boolean }) {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(value))
  } catch {
    // Not persisted; the volume still applies to this tab.
  }
}

export function loadYouTubeApi() {
  loading ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT)
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!)
    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(script)
  })
  return loading
}
