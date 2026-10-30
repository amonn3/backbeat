import { useEffect, useMemo, useState, type ReactNode } from "react"
import { I18nContext, type I18n, type Lang } from "./context"
import { en } from "./en"
import { pt, type Dict } from "./pt"

const DICTS: Record<Lang, Dict> = { pt, en }
const STORAGE_KEY = "backbeat:lang"

/** Saved choice first, then the browser language; English for anything that isn't Portuguese. */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "pt" || saved === "en") return saved
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en"
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = DICTS[lang].locale
  }, [lang])

  const value = useMemo<I18n>(
    () => ({
      lang,
      t: DICTS[lang],
      setLang: (next) => {
        setLangState(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Not persisted; the choice still applies to this tab.
        }
      },
    }),
    [lang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
