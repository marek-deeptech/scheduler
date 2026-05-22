'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type ProfileMode = 'coordinator' | 'actor'

interface ProfileCtx {
  mode: ProfileMode
  actorId: string | null
  actorName: string | null
  setMode: (m: ProfileMode) => void
  setActor: (id: string, name: string) => void
  clearActor: () => void
}

const ProfileContext = createContext<ProfileCtx>({
  mode: 'coordinator',
  actorId: null,
  actorName: null,
  setMode: () => {},
  setActor: () => {},
  clearActor: () => {},
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [mode,      setModeState]  = useState<ProfileMode>('coordinator')
  const [actorId,   setActorId]    = useState<string | null>(null)
  const [actorName, setActorName]  = useState<string | null>(null)
  const [hydrated,  setHydrated]   = useState(false)

  useEffect(() => {
    try {
      const m  = localStorage.getItem('profileMode') as ProfileMode | null
      const id = localStorage.getItem('profileActorId')
      const nm = localStorage.getItem('profileActorName')
      if (m)  setModeState(m)
      if (id) setActorId(id)
      if (nm) setActorName(nm)
    } catch {}
    setHydrated(true)
  }, [])

  function setMode(m: ProfileMode) {
    setModeState(m)
    try { localStorage.setItem('profileMode', m) } catch {}
  }

  function setActor(id: string, name: string) {
    setActorId(id)
    setActorName(name)
    try {
      localStorage.setItem('profileActorId', id)
      localStorage.setItem('profileActorName', name)
    } catch {}
  }

  function clearActor() {
    setActorId(null)
    setActorName(null)
    try {
      localStorage.removeItem('profileActorId')
      localStorage.removeItem('profileActorName')
    } catch {}
  }

  if (!hydrated) return null

  return (
    <ProfileContext.Provider value={{ mode, actorId, actorName, setMode, setActor, clearActor }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
