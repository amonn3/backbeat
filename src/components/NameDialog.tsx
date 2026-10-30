import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { useI18n } from "@/i18n"
import { getSavedName } from "@/lib/identity"

interface Props {
  open: boolean
  boardTitle?: string
  onSubmit: (name: string) => void
}

/** Blocking dialog: you can only enter a board after filling a non-empty name. */
export function NameDialog({ open, boardTitle, onSubmit }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState(getSavedName)
  const valid = name.trim().length > 0
  const intro = boardTitle ? t.nameDialog.withBoard(boardTitle) : null

  function submit(e: FormEvent) {
    e.preventDefault()
    if (valid) onSubmit(name.trim())
  }

  return (
    <Dialog open={open} disablePointerDismissal>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-lg leading-snug">{t.nameDialog.title}</DialogTitle>
              <LanguageSwitcher className="shrink-0" />
            </div>
            <DialogDescription>
              {intro ? (
                <>
                  {intro.before}
                  <span className="font-medium text-foreground">{intro.title}</span>
                  {intro.after}
                </>
              ) : (
                t.nameDialog.withoutBoard
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            maxLength={40}
            placeholder={t.nameDialog.placeholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10"
          />
          <DialogFooter>
            <Button type="submit" disabled={!valid} className="h-9 px-4">
              {t.nameDialog.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
