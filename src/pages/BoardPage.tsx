import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { Crown, FileText, Flag, Link2, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { COLUMNS } from "@shared/types"
import { Avatar } from "@/components/Avatar"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Logo } from "@/components/Logo"
import { MiniPlayer } from "@/components/MiniPlayer"
import { NameDialog } from "@/components/NameDialog"
import { RetroCard, type CardDragData } from "@/components/RetroCard"
import { RetroColumn } from "@/components/RetroColumn"
import { ReportDialog } from "@/components/ReportDialog"
import { RetroTimer } from "@/components/RetroTimer"
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
import { useBoard } from "@/hooks/useBoard"
import { useI18n } from "@/i18n"
import { COLUMN_STYLES } from "@/lib/columns"
import { getSavedName, hasJoined, markJoined, saveName } from "@/lib/identity"

export default function BoardPage() {
  const { boardId = "" } = useParams()
  const { t } = useI18n()
  const [name, setName] = useState<string | null>(() =>
    hasJoined(boardId) && getSavedName() ? getSavedName() : null,
  )
  const { board, status, error, clockOffset, participantId, actions } = useBoard(boardId, name)
  const [dragId, setDragId] = useState<string | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [preview, setPreview] = useState<{ title?: string; missing?: boolean }>({})

  // Lets the name dialog show which retro you were invited to, and catches bad links early.
  useEffect(() => {
    fetch(`/api/boards/${encodeURIComponent(boardId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { title: string }) => setPreview({ title: data.title }))
      .catch(() => setPreview({ missing: true }))
  }, [boardId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  if (preview.missing || status === "error") {
    return (
      <main className="grid min-h-svh place-items-center px-4 text-center">
        <div className="space-y-4">
          <Logo className="justify-center" />
          <p className="text-lg font-medium">{error ? t.errors[error] : t.board.notFound}</p>
          <Button render={<Link to="/" />} nativeButton={false}>
            {t.board.createNew}
          </Button>
        </div>
      </main>
    )
  }

  if (!name) {
    return (
      <div className="min-h-svh">
        <header className="flex items-center justify-between px-6 py-5">
          <Logo />
          <LanguageSwitcher />
        </header>
        <NameDialog
          open
          boardTitle={preview.title}
          onSubmit={(value) => {
            saveName(value)
            markJoined(boardId)
            setName(value)
          }}
        />
      </div>
    )
  }

  if (!board) {
    return (
      <main className="grid min-h-svh place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </main>
    )
  }

  const isHost = board.hostId === participantId
  const locked = board.finishedAt !== null
  const participants = Object.values(board.participants).sort(
    (a, b) => Number(b.online) - Number(a.online) || a.joinedAt - b.joinedAt,
  )
  const onlineCount = participants.filter((p) => p.online).length
  const dragCard = dragId ? board.cards.find((c) => c.id === dragId) : undefined

  function onDragStart(e: DragStartEvent) {
    setDragId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setDragId(null)
    const { active, over } = e
    if (!over || over.id === active.id) return
    const from = (active.data.current as CardDragData).column
    const to = (over.data.current as CardDragData).column
    if (from !== to) {
      actions.moveCard(String(active.id), to)
      return
    }
    if (!String(over.id).startsWith("column:")) actions.mergeCards(String(active.id), String(over.id))
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t.board.linkCopied)
    } catch {
      toast.info(window.location.href)
    }
  }

  return (
    // On desktop the page is exactly one screen tall and each column scrolls on its own;
    // on mobile the columns stack and the page scrolls as usual.
    <div className="mx-auto flex min-h-svh max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 md:h-svh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link to="/">
          <Logo />
        </Link>
        <span className="hidden h-5 w-px bg-border sm:block" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{board.title}</h1>
          <p className="text-xs text-muted-foreground">
            {t.board.presence(onlineCount, participants.length)}
            {status === "connecting" && ` · ${t.board.reconnecting}`}
          </p>
        </div>

        <div className="flex -space-x-2">
          {participants.slice(0, 8).map((p) => (
            <span key={p.id} className="relative">
              <Avatar name={p.name} online={p.online} />
              {p.id === board.hostId && (
                <Crown className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 fill-amber-400 text-amber-400" />
              )}
            </span>
          ))}
          {participants.length > 8 && (
            <span className="grid size-7 place-items-center rounded-full bg-secondary text-[10px] ring-2 ring-background">
              +{participants.length - 8}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          <Button variant="outline" onClick={copyLink}>
            <Link2 data-icon="inline-start" /> {t.board.share}
          </Button>
          {locked ? (
            <>
              <Button onClick={() => setReportOpen(true)}>
                <FileText data-icon="inline-start" /> {t.board.report}
              </Button>
              {isHost && (
                <Button variant="ghost" onClick={() => actions.reopen()}>
                  <RotateCcw data-icon="inline-start" /> {t.board.reopen}
                </Button>
              )}
            </>
          ) : (
            isHost && (
              <Button onClick={() => setConfirmFinish(true)}>
                <Flag data-icon="inline-start" /> {t.board.finish}
              </Button>
            )
          )}
        </div>
      </header>

      {locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <span>🎬 {t.board.finishedBanner}</span>
          <Button size="sm" onClick={() => setReportOpen(true)}>
            <FileText data-icon="inline-start" /> {t.board.generateReport}
          </Button>
        </div>
      )}

      <MiniPlayer board={board} me={participantId} actions={actions} clockOffset={clockOffset} />
      <RetroTimer board={board} isHost={isHost} clockOffset={clockOffset} actions={actions} />

      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)
          return hits.sort((a, b) => Number(String(a.id).startsWith("column:")) - Number(String(b.id).startsWith("column:")))
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        <main className="grid flex-1 gap-4 md:min-h-72 md:grid-cols-3">
          {COLUMNS.map((id) => (
            <RetroColumn
              key={id}
              id={id}
              title={t.columns[id]}
              cards={board.cards.filter((c) => c.column === id)}
              me={participantId}
              isHost={isHost}
              locked={locked}
              actions={actions}
            />
          ))}
        </main>
        <DragOverlay dropAnimation={null}>
          {dragCard && (
            <RetroCard
              card={dragCard}
              accent={COLUMN_STYLES[dragCard.column].border}
              locked
              canDelete={false}
              overlay
            />
          )}
        </DragOverlay>
      </DndContext>

      <p className="text-center text-xs text-muted-foreground">{t.board.dragTip}</p>

      <Dialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.board.finishTitle}</DialogTitle>
            <DialogDescription>{t.board.finishDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t.board.cancel}</DialogClose>
            <Button
              onClick={async () => {
                if (await actions.finish()) {
                  setConfirmFinish(false)
                  setReportOpen(true)
                }
              }}
            >
              {t.board.finishConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportDialog board={board} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  )
}
