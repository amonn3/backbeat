import { useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, TimerIcon } from "lucide-react"
import { toast } from "sonner"
import type { Board } from "@shared/types"
import type { BoardActions } from "@/hooks/useBoard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"

/** Quick picks in seconds; the minutes field still accepts any value up to 60. */
const PRESETS = [30, 60, 180, 300]

const presetLabel = (sec: number) => (sec < 60 ? `${sec}s` : `${sec / 60}min`)

interface Props {
  board: Board
  isHost: boolean
  clockOffset: number
  actions: BoardActions
}

function format(ms: number) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function beep() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.15, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.2)
    })
  } catch {
    // Audio is a nicety; ignore if the browser refuses it.
  }
}

export function RetroTimer({ board, isHost, clockOffset, actions }: Props) {
  const { timer } = board
  const { t } = useI18n()
  const [now, setNow] = useState(Date.now)
  const remaining = timer.endsAt
    ? Math.min(Math.max(timer.endsAt - (now + clockOffset), 0), timer.durationSec * 1000)
    : timer.remainingMs
  const [minutes, setMinutes] = useState(String(timer.durationSec / 60))
  const prevRef = useRef(remaining)

  const running = timer.endsAt !== null && remaining > 0
  const expired = timer.endsAt !== null && remaining === 0
  const paused = timer.endsAt === null && timer.remainingMs > 0 && timer.remainingMs < timer.durationSec * 1000
  const progress = timer.durationSec ? remaining / (timer.durationSec * 1000) : 0

  useEffect(() => {
    if (!timer.endsAt) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timer.endsAt])

  useEffect(() => {
    if (prevRef.current > 0 && remaining === 0 && timer.endsAt) {
      beep()
      toast(`⏰ ${t.timer.expiredToast}`, { description: t.timer.expiredToastDescription })
    }
    prevRef.current = remaining
  }, [remaining, timer.endsAt, t])

  const parsedMinutes = Number(minutes.replace(",", "."))
  const minutesValid = Number.isFinite(parsedMinutes) && parsedMinutes > 0 && parsedMinutes <= 60
  const selectedSec = minutesValid ? Math.round(parsedMinutes * 60) : null

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card/70 p-3 backdrop-blur md:flex-row md:items-center md:gap-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-9 place-items-center rounded-lg bg-secondary",
            running && "bg-primary/15 text-primary",
            expired && "bg-destructive/15 text-destructive",
          )}
        >
          <TimerIcon className="size-4" />
        </span>
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {expired ? t.timer.expired : running ? t.timer.running : paused ? t.timer.paused : t.timer.idle}
          </p>
          <p
            className={cn(
              "font-mono text-3xl leading-none font-semibold tabular-nums",
              expired && "animate-pulse text-destructive",
              running && remaining < 30_000 && "text-amber-400",
            )}
          >
            {format(remaining)}
          </p>
        </div>
      </div>

      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-300 ease-linear",
            running && remaining < 30_000 && "bg-amber-400",
          )}
          style={{ width: `${(timer.endsAt || paused ? progress : 1) * 100}%` }}
        />
      </div>

      {isHost ? (
        <div className="flex flex-wrap items-center gap-2">
          {!running && !paused && (
            <>
              <div className="flex gap-1">
                {PRESETS.map((sec) => (
                  <Button
                    key={sec}
                    size="sm"
                    variant={sec === selectedSec ? "secondary" : "ghost"}
                    onClick={() => setMinutes(String(sec / 60))}
                  >
                    {presetLabel(sec)}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input
                  aria-label={t.timer.minutes}
                  inputMode="decimal"
                  className="h-7 w-14 text-center"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  aria-invalid={!minutesValid}
                />
                <span className="text-xs text-muted-foreground">{t.timer.minutesShort}</span>
              </div>
              <Button
                size="sm"
                disabled={!minutesValid}
                onClick={() => selectedSec && actions.startTimer(selectedSec)}
              >
                <Play data-icon="inline-start" /> {t.timer.start}
              </Button>
            </>
          )}
          {running && (
            <Button size="sm" variant="secondary" onClick={() => actions.pauseTimer()}>
              <Pause data-icon="inline-start" /> {t.timer.pause}
            </Button>
          )}
          {paused && (
            <Button size="sm" onClick={() => actions.resumeTimer()}>
              <Play data-icon="inline-start" /> {t.timer.resume}
            </Button>
          )}
          {(running || paused || expired) && (
            <Button size="sm" variant="ghost" onClick={() => actions.resetTimer()}>
              <RotateCcw data-icon="inline-start" /> {t.timer.reset}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t.timer.hostControls}</p>
      )}
    </section>
  )
}
