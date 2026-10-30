import type { ColumnId } from "@shared/types"

export const COLUMN_STYLES: Record<ColumnId, { dot: string; border: string; glow: string }> = {
  good: { dot: "bg-emerald-400", border: "border-l-emerald-400/80", glow: "from-emerald-400/10" },
  improve: { dot: "bg-amber-400", border: "border-l-amber-400/80", glow: "from-amber-400/10" },
  bad: { dot: "bg-rose-400", border: "border-l-rose-400/80", glow: "from-rose-400/10" },
}
