'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface Org {
  id: string
  name: string
  slug: string
  planningHorizonMonths: number
  logoUrl: string | null
}

interface OrgContextType {
  org: Org | null
  loading: boolean
  /** Horyzont planowania w miesiącach (ile miesięcy do przodu planuje teatr). */
  planningHorizon: number
}

const OrgContext = createContext<OrgContextType | null>(null)

const DEFAULT_HORIZON = 6  // do czasu wczytania sesji zakładamy szerszy horyzont

export function OrgProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/session')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setOrg(j?.org ?? null) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const planningHorizon = org?.planningHorizonMonths ?? DEFAULT_HORIZON

  return (
    <OrgContext.Provider value={{ org, loading, planningHorizon }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
