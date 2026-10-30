import { useMemo } from "react"
import { Download } from "lucide-react"
import type { Board } from "@shared/types"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { useI18n } from "@/i18n"
import { buildReport, downloadReport } from "@/lib/report"

interface Props {
  board: Board
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReportDialog({ board, open, onOpenChange }: Props) {
  const { t } = useI18n()
  const markdown = useMemo(() => (open ? buildReport(board, t) : ""), [board, open, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.report.dialogTitle}</DialogTitle>
          <DialogDescription>{t.report.dialogDescription}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[55vh] rounded-lg border bg-background/60">
          <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {markdown}
          </pre>
        </ScrollArea>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t.report.close}</DialogClose>
          <Button onClick={() => downloadReport(board, t)}>
            <Download data-icon="inline-start" /> {t.report.download}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
