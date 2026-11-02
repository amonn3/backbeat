import { useEffect, useRef, useState, type FormEvent } from "react"
import { ChevronDown, ChevronUp, Lock, Music2, Pause, Play, Plus, SkipBack, SkipForward, Trash2, Volume1, Volume2, VolumeX } from "lucide-react"
import { canManagePlaylist, isPlaceholderTitle, playbackPosition, parseYouTubeId, type Board, type Track } from "@shared/types"
import type { BoardActions } from "@/hooks/useBoard"
import { useI18n } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { loadVolume, loadYouTubeApi, saveVolume, type YTPlayer } from "@/lib/youtube"
import { cn } from "@/lib/utils"

interface Props {
  board: Board
  me: string
  clockOffset: number
  actions: BoardActions
}

export function MiniPlayer({ board, me, actions, clockOffset }: Props) {
  const { t } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const loadedRef = useRef<string | null>(null)
  const stateRef = useRef({ board, me, clockOffset })
  const syncRef = useRef<() => void>(() => {})
  const [blocked, setBlocked] = useState(false)
  const indexRef = useRef(board.currentTrack)
  const trackRef = useRef<Track | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [url, setUrl] = useState("")
  const [adding, setAdding] = useState(false)
  const [collapseOverride, setCollapseOverride] = useState<{ revision: number; value: boolean } | null>(null)
  const collapsed = collapseOverride?.revision === board.playback.updatedAt ? collapseOverride.value : board.playback.collapsed
  useEffect(() => {
    const deadline = board.timer.endsAt
    if (!deadline || board.timer.completed) return
    const timeout = setTimeout(() => {
      playerRef.current?.pauseVideo()
      setCollapseOverride({ revision: stateRef.current.board.playback.updatedAt, value: true })
    }, Math.max(0, deadline - Date.now() - clockOffset))
    return () => clearTimeout(timeout)
  }, [board.timer.endsAt, board.timer.completed, clockOffset])
  // Our own volume control: the YouTube embed hides its slider at mini-player sizes.
  const [audio, setAudio] = useState(loadVolume)

  const canManage = canManagePlaylist(board, me)
  const isHost = board.hostId === me
  const current = board.playlist[board.currentTrack]
  const videoId = current?.videoId ?? null
  const trackLabel = (track: Track) => (isPlaceholderTitle(track.title) ? t.player.untitled : track.title)

  useEffect(() => {
    stateRef.current = { board, me, clockOffset }
    indexRef.current = board.currentTrack
    trackRef.current = current
  }, [board, me, clockOffset, current])

  // Create the player once; the API replaces the inner div with the iframe.
  useEffect(() => {
    let cancelled = false
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return
      const el = document.createElement("div")
      hostRef.current.appendChild(el)
      playerRef.current = new YT.Player(el, {
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, playsinline: 1, controls: 0, disablekb: 1 },
        events: {
          onReady: () => setReady(true),
          onAutoplayBlocked: () => setBlocked(true),
          onStateChange: (e) => {
            const shared = stateRef.current
            if (e.data === YT.PlayerState.ENDED && shared.board.hostId === shared.me &&
                loadedRef.current === `${indexRef.current}:${trackRef.current?.id}`) {
              actions.trackEnded(indexRef.current, shared.board.playback.updatedAt)
            }
            if (e.data === YT.PlayerState.PLAYING) setBlocked(false)
            const track = trackRef.current
            if ((e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.CUED) && track) {
              const data = playerRef.current?.getVideoData()
              if (data?.title && data.video_id === track.videoId && isPlaceholderTitle(track.title)) {
                actions.nameTrack(track.id, data.title)
              }
            }
          },
        },
      })
    })
    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [actions])

  // The server clock anchors playback, including late joins and reconnects.
  // Periodic correction also recovers from buffering and local iframe changes.
  useEffect(() => {
    const player = playerRef.current
    if (!ready || !player) return
    const sync = () => {
      const { board: latest, clockOffset: offset } = stateRef.current
      const track = latest.playlist[latest.currentTrack]
      if (!track) {
        if (loadedRef.current !== null) player.stopVideo()
        loadedRef.current = null
        return
      }
      const serverNow = Date.now() + offset
      const expired = Boolean(latest.timer.endsAt && !latest.timer.completed && serverNow >= latest.timer.endsAt)
      const playing = latest.playback.playing && !expired
      const position = playbackPosition(latest.playback, expired ? latest.timer.endsAt! : serverNow)
      const key = `${latest.currentTrack}:${track.id}`
      if (loadedRef.current !== key) {
        loadedRef.current = key
        if (playing) player.loadVideoById(track.videoId, position)
        else player.cueVideoById(track.videoId, position)
        return
      }
      if (Math.abs(player.getCurrentTime() - position) > 1) player.seekTo(position, true)
      const state = player.getPlayerState()
      if (playing) {
        if (state !== 1 && state !== 3) player.playVideo()
      } else if (state !== 2 && state !== 5) player.pauseVideo()
    }
    syncRef.current = sync
    sync()
    const interval = setInterval(sync, 1000)
    return () => clearInterval(interval)
  }, [ready, board.playback, board.currentTrack, board.timer, current, clockOffset])

  useEffect(() => {
    const player = playerRef.current
    if (!ready || !player) return
    player.setVolume(audio.volume)
    if (audio.muted || audio.volume === 0) player.mute()
    else player.unMute()
    saveVolume(audio)
  }, [ready, audio])

  function changeVolume(value: number | readonly number[]) {
    const volume = Array.isArray(value) ? value[0] : (value as number)
    setAudio({ volume, muted: volume === 0 })
  }

  function toggleMute() {
    setAudio((a) => (a.muted || a.volume === 0 ? { volume: a.volume || 50, muted: false } : { ...a, muted: true }))
  }

  const silent = audio.muted || audio.volume === 0
  const VolumeIcon = silent ? VolumeX : audio.volume < 50 ? Volume1 : Volume2

  async function addTrack(e: FormEvent) {
    e.preventDefault()
    if (!parseYouTubeId(url)) return
    setAdding(true)
    if (await actions.addTrack(url)) setUrl("")
    setAdding(false)
  }

  const urlValid = parseYouTubeId(url) !== null

  return (
    <section className="rounded-2xl border bg-card/70 p-3 backdrop-blur">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-sm" aria-expanded={!collapsed}
        aria-controls="soundtrack-content" onClick={() => setCollapseOverride({ revision: board.playback.updatedAt, value: !collapsed })}>
        <span className="flex min-w-0 items-center gap-2"><Music2 className="size-4 shrink-0" /><span className="truncate">{current ? trackLabel(current) : t.player.nothingQueued}</span></span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{collapsed ? t.player.expand : t.player.collapse}{collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}</span>
      </button>
      <div id="soundtrack-content" className={cn("mt-3 flex flex-col gap-3 sm:flex-row", collapsed && "hidden")}>

      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-black sm:w-72">
        <div ref={hostRef} className={cn("pointer-events-none absolute inset-0 [&>iframe]:size-full", !videoId && "invisible")} />
        {!videoId && (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/25 via-background to-background text-center">
            <div className="space-y-1 px-4">
              <Music2 className="mx-auto size-6 text-primary" />
              <p className="text-xs text-muted-foreground">{t.player.empty}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{t.player.nowPlaying}</p>
            <p className="truncate text-sm font-medium">{current ? trackLabel(current) : t.player.nothingQueued}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={silent ? t.player.unmute : t.player.mute}
              title={silent ? t.player.unmute : t.player.mute}
              onClick={toggleMute}
            >
              <VolumeIcon />
            </Button>
            {/* The slider fills its parent, so the wrapper sets the width. */}
            <div className="mr-2 w-20 sm:w-24">
              <Slider
                aria-label={t.player.volume}
                min={0}
                max={100}
                step={1}
                value={[silent ? 0 : audio.volume]}
                onValueChange={changeVolume}
              />
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={board.playback.playing ? t.player.pause : t.player.play}
              disabled={!isHost || !current}
              onClick={() => actions.setPlayback(!board.playback.playing)}
            >
              {board.playback.playing ? <Pause /> : <Play />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t.player.previous}
              disabled={!isHost || board.currentTrack <= 0}
              onClick={() => actions.playTrack(board.currentTrack - 1)}
            >
              <SkipBack />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t.player.next}
              disabled={!isHost || board.currentTrack >= board.playlist.length - 1}
              onClick={() => actions.playTrack(board.currentTrack + 1)}
            >
              <SkipForward />
            </Button>
          </div>
        </div>

        {blocked && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t.player.autoplayBlocked}</span>
            <Button size="xs" variant="outline" onClick={() => {
              playerRef.current?.unMute()
              syncRef.current()
            }}>{t.player.enableAudio}</Button>
          </div>
        )}
        <ScrollArea className="h-24 rounded-lg border bg-background/40">
          {board.playlist.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{t.player.queueEmpty}</p>
          ) : (
            <ol className="p-1">
              {board.playlist.map((track, i) => (
                <li
                  key={track.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                    i === board.currentTrack ? "bg-primary/15 text-foreground" : "text-muted-foreground",
                  )}
                >
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => actions.playTrack(i)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left enabled:hover:text-foreground"
                  >
                    <span className="w-4 shrink-0 text-right tabular-nums opacity-60">
                      {i === board.currentTrack ? "▶" : i + 1}
                    </span>
                    <span className="truncate">{trackLabel(track)}</span>
                    <span className="ml-auto shrink-0 opacity-60">{track.addedBy}</span>
                  </button>
                  {canManage && (isHost || i !== board.currentTrack) && (
                    <button
                      type="button"
                      aria-label={t.player.remove(trackLabel(track))}
                      onClick={() => actions.removeTrack(track.id)}
                      className="shrink-0 opacity-0 transition group-hover:opacity-70 hover:text-destructive hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>

        {canManage ? (
          <form onSubmit={addTrack} className="flex gap-2">
            <Input
              placeholder={t.player.urlPlaceholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={url.length > 0 && !urlValid}
            />
            <Button type="submit" size="icon" disabled={!urlValid || adding} aria-label={t.player.add}>
              <Plus />
            </Button>
          </form>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3" /> {t.player.hostOnly}
          </p>
        )}

        {isHost && (
          <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-muted-foreground">
            {t.player.openToAll}
            <Switch
              size="sm"
              checked={board.settings.playlistOpen}
              onCheckedChange={(checked) => actions.updateSettings({ playlistOpen: checked })}
            />
          </label>
        )}
      </div>
      </div>
    </section>
  )
}
