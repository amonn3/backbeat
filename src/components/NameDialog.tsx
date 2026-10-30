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
import { getSavedName } from "@/lib/identity"

interface Props {
  open: boolean
  boardTitle?: string
  onSubmit: (name: string) => void
}

/** Blocking dialog: you can only enter a board after filling a non-empty name. */
export function NameDialog({ open, boardTitle, onSubmit }: Props) {
  const [name, setName] = useState(getSavedName)
  const valid = name.trim().length > 0

  function submit(e: FormEvent) {
    e.preventDefault()
    if (valid) onSubmit(name.trim())
  }

  return (
    <Dialog open={open} disablePointerDismissal>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg">Você foi convidado para uma retro 🎧</DialogTitle>
            <DialogDescription>
              {boardTitle ? (
                <>
                  Para entrar em <span className="font-medium text-foreground">{boardTitle}</span>, diga como o
                  time deve te chamar.
                </>
              ) : (
                "Diga como o time deve te chamar."
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            maxLength={40}
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10"
          />
          <DialogFooter>
            <Button type="submit" disabled={!valid} className="h-9 px-4">
              Entrar no board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
