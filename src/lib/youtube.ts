/** Minimal typing for the bits of the YouTube IFrame API we use. */
export interface YTPlayer {
  loadVideoById(id: string): void
  cueVideoById(id: string): void
  stopVideo(): void
  destroy(): void
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId?: string
      width?: string
      height?: string
      playerVars?: Record<string, number | string>
      events?: { onStateChange?: (e: { data: number }) => void; onReady?: () => void }
    },
  ) => YTPlayer
  PlayerState: { ENDED: number }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let loading: Promise<YTNamespace> | null = null

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
