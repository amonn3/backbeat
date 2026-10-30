import { Languages } from "lucide-react"
import { LANGS, useI18n } from "@/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div
      role="group"
      aria-label={t.language.label}
      className={cn("inline-flex items-center gap-0.5 rounded-lg border bg-secondary/40 p-0.5", className)}
    >
      <Languages className="mx-1 size-3.5 text-muted-foreground" aria-hidden />
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          title={t.language[code]}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-medium uppercase transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
            lang === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
