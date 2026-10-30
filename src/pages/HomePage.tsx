import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Columns3, Music2, Timer } from "lucide-react"
import { toast } from "sonner"
import type { CreateBoardRequest, ErrorCode } from "@shared/types"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/i18n"
import { getParticipantId, getSavedName, markJoined, saveName } from "@/lib/identity"

const FEATURE_ICONS = [Columns3, Music2, Timer]

export default function HomePage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [name, setName] = useState(getSavedName)
  const [title, setTitle] = useState("")
  const [playlistOpen, setPlaylistOpen] = useState(true)
  const [joinCode, setJoinCode] = useState("")
  const [loading, setLoading] = useState(false)

  const nameValid = name.trim().length > 0

  async function createBoard(e: FormEvent) {
    e.preventDefault()
    if (!nameValid) return
    setLoading(true)
    try {
      const body: CreateBoardRequest = {
        title: title.trim() || t.home.defaultTitle(new Date().toLocaleDateString(t.locale)),
        hostName: name.trim(),
        hostId: getParticipantId(),
        playlistOpen,
      }
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data.error as ErrorCode | undefined) ?? "create_failed")
      saveName(name)
      markJoined(data.id)
      navigate(`/b/${data.id}`)
    } catch (err) {
      const code = (err instanceof Error ? err.message : "create_failed") as ErrorCode
      toast.error(t.errors[code] ?? t.errors.create_failed)
      setLoading(false)
    }
  }

  function joinBoard(e: FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().split("/b/").pop()?.split(/[?#/]/)[0]
    if (code) navigate(`/b/${code}`)
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <Logo className="text-lg" />
        <LanguageSwitcher />
      </header>

      <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            {t.home.badge}
          </span>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            {t.home.headline} <span className="text-primary">{t.home.headlineAccent}</span>.
          </h1>
          <p className="max-w-md text-base text-muted-foreground text-pretty">
            {t.home.pitch}
          </p>
          <ul className="space-y-2.5">
            {t.home.features.map((text, i) => {
              const Icon = FEATURE_ICONS[i]
              return (
                <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="grid size-7 place-items-center rounded-md bg-secondary text-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  {text}
                </li>
              )
            })}
          </ul>
        </section>

        <Card className="bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg">{t.home.createTitle}</CardTitle>
            <CardDescription>{t.home.createDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createBoard} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">{t.home.nameLabel}</Label>
                <Input
                  id="name"
                  autoFocus
                  maxLength={40}
                  placeholder={t.home.namePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">
                  {t.home.titleLabel} <span className="font-normal text-muted-foreground">{t.home.optional}</span>
                </Label>
                <Input
                  id="title"
                  maxLength={80}
                  placeholder={t.home.titlePlaceholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10"
                />
              </div>
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border bg-secondary/40 p-3">
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{t.home.playlistOpenTitle}</span>
                  <span className="block text-xs text-muted-foreground">{t.home.playlistOpenDescription}</span>
                </span>
                <Switch checked={playlistOpen} onCheckedChange={setPlaylistOpen} className="mt-0.5" />
              </label>
              <Button type="submit" size="lg" className="h-10 w-full" disabled={!nameValid || loading}>
                {loading ? t.home.creating : t.home.create}
                <ArrowRight data-icon="inline-end" />
              </Button>
              {!nameValid && (
                <p className="text-center text-xs text-muted-foreground">{t.home.nameRequiredHint}</p>
              )}
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              {t.home.orJoin}
              <Separator className="flex-1" />
            </div>

            <form onSubmit={joinBoard} className="flex gap-2">
              <Input
                placeholder={t.home.joinPlaceholder}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="h-9"
              />
              <Button type="submit" variant="secondary" className="h-9" disabled={!joinCode.trim()}>
                {t.home.join}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
