import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core"
import { Layers, Trash2, Ungroup } from "lucide-react"
import type { Card, ColumnId } from "@shared/types"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"

interface Props {
  card: Card
  canDelete: boolean
  locked: boolean
  accent: string
  onDelete?: () => void
  onSplit?: () => void
  overlay?: boolean
}

export interface CardDragData {
  column: ColumnId
}

/** Body shared by the in-column card and the floating drag preview. */
function CardBody({ card, canDelete, locked, onDelete, onSplit }: Omit<Props, "accent" | "overlay">) {
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
        {card.items.map((item) => (
          <div key={item.id}>
            <p className="text-sm leading-relaxed font-medium break-words whitespace-pre-wrap">{item.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">{item.authorName}</p>
          </div>
        ))}
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
  const { card, locked, accent, overlay } = props
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
  const isInvalidTarget = drop.isOver && active?.id !== card.id && activeColumn !== card.column

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
        isInvalidTarget && "ring-2 ring-destructive/50",
      )}
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
