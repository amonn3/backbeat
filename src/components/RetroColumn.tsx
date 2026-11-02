import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Eraser, Plus } from "lucide-react"
import type { Card, ColumnId } from "@shared/types"
import type { BoardActions } from "@/hooks/useBoard"
import { RetroCard } from "@/components/RetroCard"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useI18n } from "@/i18n"
import { COLUMN_STYLES } from "@/lib/columns"
import { cn } from "@/lib/utils"

interface Props {
  id: ColumnId
  title: string
  cards: Card[]
  me: string
  isHost: boolean
  locked: boolean
  actions: BoardActions
}

export function RetroColumn({ id, title, cards, me, isHost, locked, actions }: Props) {
  const { t } = useI18n()
  const [composing, setComposing] = useState(false)
  const [text, setText] = useState("")
  const [confirmClear, setConfirmClear] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!composing) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !composerRef.current?.contains(event.target)) setComposing(false)
    }
    document.addEventListener("pointerdown", closeOutside)
    return () => document.removeEventListener("pointerdown", closeOutside)
  }, [composing])
  const style = COLUMN_STYLES[id]
  const itemCount = cards.reduce((n, c) => n + c.items.length, 0)

  async function submit() {
    if (!text.trim()) return
    if (await actions.addCard(id, text)) {
      setText("")
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    } else if (e.key === "Escape") {
      setComposing(false)
      setText("")
    }
  }

  return (
    <section
      className={cn(
        "flex min-h-80 flex-col rounded-2xl border bg-gradient-to-b to-card/40 to-40% p-3 md:min-h-0",
        style.glow,
      )}
    >
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", style.dot)} />
        <h2 className="flex-1 truncate text-sm font-semibold">{title}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
          {itemCount}
        </span>
        {isHost && !locked && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t.column.clearAria(title)}
            title={t.column.clear}
            disabled={cards.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            <Eraser />
          </Button>
        )}
        {!locked && (
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label={t.column.addAria(title)}
            title={t.column.add}
            onClick={() => setComposing(true)}
          >
            <Plus />
          </Button>
        )}
      </header>

      {composing && !locked && (
        <div ref={composerRef} className={cn("mb-2.5 rounded-2xl border border-l-[3px] bg-secondary/60 p-2", style.border)}>
          <textarea
            autoFocus
            rows={3}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t.column.placeholder}
            className="w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="pl-1.5 text-[11px] text-muted-foreground">{t.column.hint}</span>
            <div className="flex gap-1">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setComposing(false)
                  setText("")
                }}
              >
                {t.column.cancel}
              </Button>
              <Button size="xs" disabled={!text.trim()} onClick={submit}>
                {t.column.submit}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Only the card list scrolls, so a long column never stretches the page. */}
      <div className="scroll-thin -mx-1 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1 py-1">
        {cards.map((card) => (
          <RetroCard
            key={card.id}
            card={card}
            accent={style.border}
            locked={locked}
            canDelete={isHost || card.items.every((i) => i.authorId === me)}
            onDelete={() => actions.deleteCard(card.id)}
            onSplit={() => actions.splitCard(card.id)}
          />
        ))}

        {cards.length === 0 && !composing && (
          <button
            type="button"
            disabled={locked}
            onClick={() => setComposing(true)}
            className="grid flex-1 place-items-center rounded-2xl border border-dashed text-xs text-muted-foreground transition enabled:hover:border-primary/40 enabled:hover:text-foreground"
          >
            {locked ? t.column.empty : t.column.emptyCta}
          </button>
        )}
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.column.clearTitle(title)}</DialogTitle>
            <DialogDescription>{t.column.clearDescription(cards.length)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t.column.cancel}</DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                if (await actions.clearColumn(id)) setConfirmClear(false)
              }}
            >
              {t.column.clear}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
