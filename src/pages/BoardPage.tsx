import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { Crown, FileText, Flag, Link2, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { COLUMNS } from "@shared/types"
import { Avatar } from "@/components/Avatar"
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
import { COLUMN_STYLES } from "@/lib/columns"
import { getSavedName, hasJoined, markJoined, saveName } from "@/lib/identity"

export default function BoardPage() {
  const { boardId = "" } = useParams()
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
          <p className="text-lg font-medium">{error ?? "Board não encontrado."}</p>
          <Button render={<Link to="/" />} nativeButton={false}>
            Criar um novo board
          </Button>
        </div>
      </main>
    )
  }

  if (!name) {
    return (
      <div className="min-h-svh">
        <header className="px-6 py-5">
          <Logo />
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
      toast.info("Só dá para agrupar cards da mesma coluna.")
      return
    }
    actions.mergeCards(String(active.id), String(over.id))
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Link copiado! Mande para o time.")
    } catch {
      toast.info(window.location.href)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link to="/">
          <Logo />
        </Link>
        <span className="hidden h-5 w-px bg-border sm:block" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{board.title}</h1>
          <p className="text-xs text-muted-foreground">
            {onlineCount} online · {participants.length} participante(s)
            {status === "connecting" && " · reconectando…"}
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

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={copyLink}>
            <Link2 data-icon="inline-start" /> Compartilhar
          </Button>
          {locked ? (
            <>
              <Button onClick={() => setReportOpen(true)}>
                <FileText data-icon="inline-start" /> Relatório
              </Button>
              {isHost && (
                <Button variant="ghost" onClick={() => actions.reopen()}>
                  <RotateCcw data-icon="inline-start" /> Reabrir
                </Button>
              )}
            </>
          ) : (
            isHost && (
              <Button onClick={() => setConfirmFinish(true)}>
                <Flag data-icon="inline-start" /> Encerrar retro
              </Button>
            )
          )}
        </div>
      </header>

      {locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <span>
            🎬 Esta retro foi encerrada. Os cards estão bloqueados, mas o relatório está pronto.
          </span>
          <Button size="sm" onClick={() => setReportOpen(true)}>
            <FileText data-icon="inline-start" /> Gerar relatório .md
          </Button>
        </div>
      )}

      <MiniPlayer board={board} me={participantId} actions={actions} />
      <RetroTimer board={board} isHost={isHost} clockOffset={clockOffset} actions={actions} />

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        <main className="grid flex-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <RetroColumn
              key={col.id}
              {...col}
              cards={board.cards.filter((c) => c.column === col.id)}
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

      <p className="pb-2 text-center text-xs text-muted-foreground">
        Dica: arraste um card sobre outro da mesma coluna para agrupar assuntos relacionados.
      </p>

      <Dialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar a retro?</DialogTitle>
            <DialogDescription>
              Os cards ficam bloqueados para todos e o relatório em Markdown fica disponível para download. Você
              pode reabrir depois, se precisar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button
              onClick={async () => {
                if (await actions.finish()) {
                  setConfirmFinish(false)
                  setReportOpen(true)
                }
              }}
            >
              Encerrar e gerar relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportDialog board={board} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  )
}
