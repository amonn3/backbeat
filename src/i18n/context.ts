import { createContext, useContext } from "react"
import type { Dict } from "./pt"

export type Lang = "pt" | "en"

export const LANGS: Lang[] = ["pt", "en"]

export interface I18n {
  lang: Lang
  t: Dict
  setLang: (lang: Lang) => void
}

export const I18nContext = createContext<I18n | null>(null)

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider")
  return ctx
}
