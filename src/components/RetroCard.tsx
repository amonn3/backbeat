import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core"
import type { CSSProperties } from "react"
import { EyeOff, Layers, Lock, Trash2, Ungroup } from "lucide-react"
import type { Card, CardItem, ColumnId } from "@shared/types"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"

interface Props {
  card: Card
  canDelete: boolean
  locked: boolean
  accent: string
  me: string
  /** True until the host reveals the cards. */
  concealed: boolean
  /** Plays the reveal effect, staggered by `revealDelay` ms. */
  revealing?: boolean
  revealDelay?: number
  onDelete?: () => void
  onSplit?: () => void
  overlay?: boolean
}

export interface CardDragData {
  column: ColumnId
}

/** Placeholder lines with a stable, per-item width so hidden cards don't all look alike. */
function HiddenItem({ item }: { item: CardItem }) {
  const { t } = useI18n()
  const seed = [...item.id].reduce((n, ch) => n + ch.charCodeAt(0), 0)
  const widths = [72 + (seed % 25), 38 + ((seed * 7) % 40)]
  return (
    <div aria-label={t.card.hidden} className="select-none">
      <div className="space-y-2 py-1" aria-hidden>
        {widths.map((w, i) => (
          <div key={i} className="card-redacted-line h-3 rounded-full" style={{ width: `${w}%` }} />
        ))}
      </div>
      <p className="mt-2.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="size-3" /> {t.card.hidden}
      </p>
    </div>
  )
}

/** Body shared by the in-column card and the floating drag preview. */
function CardBody({ card, canDelete, locked, me, concealed, onDelete, onSplit }: Omit<Props, "accent" | "overlay">) {
  const { t } = useI18n()
  const grouped = card.items.length > 1
  return (
    <>
      {grouped && (
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Layers className="size-3" /> {t.card.grouped(card.items.length)}
          </span>
        </div>
      )}
      <div className={cn(grouped && "space-y-2.5 divide-y divide-border/60 [&>*:not(:first-child)]:pt-2.5")}>
        {card.items.map((item) =>
          item.hidden ? (
            <HiddenItem key={item.id} item={item} />
          ) : (
            <div key={item.id}>
              <p className="text-sm leading-relaxed font-medium break-words whitespace-pre-wrap">{item.text}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {item.authorName}
                {concealed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary/90">
                    <EyeOff className="size-2.5" />
                    {item.authorId === me ? t.card.onlyYou : t.card.hiddenForTeam}
                  </span>
                )}
              </p>
            </div>
          ),
        )}
      </div>
      {!locked && (canDelete || grouped) && (
        <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 transition group-hover/card:opacity-100 focus-within:opacity-100">
          {grouped && onSplit && (
            <button
              type="button"
              aria-label={t.card.split}
              title={t.card.split}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onSplit}
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Ungroup className="size-3.5" />
            </button>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              aria-label={t.card.remove}
              title={t.card.remove}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDelete}
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </>
  )
}

const cardClass =
  "group/card relative rounded-2xl border bg-secondary/60 p-3.5 pr-9 shadow-sm shadow-black/20 border-l-[3px]"

export function RetroCard(props: Props) {
  const { card, locked, accent, overlay, revealing, revealDelay = 0 } = props
  const { active } = useDndContext()
  const { t } = useI18n()
  const data: CardDragData = { column: card.column }
  const drag = useDraggable({ id: card.id, data, disabled: locked })
  const drop = useDroppable({ id: card.id, data, disabled: locked })

  if (overlay) {
    return (
      <div className={cn(cardClass, accent, "rotate-2 cursor-grabbing shadow-2xl shadow-black/50 ring-2 ring-primary/50")}>
        <CardBody {...props} />
      </div>
    )
  }

  const activeColumn = (active?.data.current as CardDragData | undefined)?.column
  const isMergeTarget = drop.isOver && active?.id !== card.id && activeColumn === card.column
  const isMoveTarget = drop.isOver && active?.id !== card.id && activeColumn !== card.column

  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      {...drag.attributes}
      {...drag.listeners}
      className={cn(
        cardClass,
        accent,
        "transition-[transform,box-shadow,opacity] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !locked && "cursor-grab hover:-translate-y-0.5 hover:bg-secondary",
        drag.isDragging && "opacity-30",
        isMergeTarget && "scale-[1.02] ring-2 ring-primary",
        isMoveTarget && "ring-2 ring-primary/50",
        revealing && "card-revealing",
      )}
      style={revealing ? ({ "--reveal-delay": `${revealDelay}ms` } as CSSProperties) : undefined}
    >
      <CardBody {...props} />
      {isMergeTarget && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-primary/15 text-xs font-semibold text-primary backdrop-blur-[1px]">
          {t.card.dropToMerge}
        </div>
      )}
    </div>
  )
}
