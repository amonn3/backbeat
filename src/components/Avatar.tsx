import { cn } from "@/lib/utils"

const HUES = [290, 250, 200, 160, 120, 80, 40, 10, 330]

function hueFor(name: string) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return HUES[Math.abs(hash) % HUES.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

export function Avatar({
  name,
  online = true,
  className,
}: {
  name: string
  online?: boolean
  className?: string
}) {
  const hue = hueFor(name)
  return (
    <span
      title={name}
      className={cn(
        "relative grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold ring-2 ring-background",
        !online && "opacity-40",
        className,
      )}
      style={{ background: `oklch(0.42 0.12 ${hue})`, color: `oklch(0.95 0.04 ${hue})` }}
    >
      {initials(name)}
    </span>
  )
}
