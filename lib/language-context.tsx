'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { Locale, translations } from './i18n'

type LanguageContextType = {
  locale: Locale
  t: typeof translations['en']
  toggle: () => void
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('pl')
  const toggle = () => setLocale((l) => (l === 'en' ? 'pl' : 'en'))

  return (
    <LanguageContext.Provider value={{ locale, t: translations[locale], toggle }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
