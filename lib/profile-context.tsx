'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type ProfileMode = 'coordinator' | 'actor'

interface ProfileCtx {
  mode: ProfileMode
  actorId: string | null
  actorName: string | null
  loggedIn: boolean
  setMode: (m: ProfileMode) => void
  setActor: (id: string, name: string) => void
  clearActor: () => void
  login: () => void
  logout: () => void
}

const ProfileContext = createContext<ProfileCtx>({
  mode: 'coordinator',
  actorId: null,
  actorName: null,
  loggedIn: true,
  setMode: () => {},
  setActor: () => {},
  clearActor: () => {},
  login: () => {},
  logout: () => {},
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [mode,      setModeState]  = useState<ProfileMode>('coordinator')
  const [actorId,   setActorId]    = useState<string | null>(null)
  const [actorName, setActorName]  = useState<string | null>(null)
  const [loggedIn,  setLoggedIn]   = useState(true)
  const [hydrated,  setHydrated]   = useState(false)

  useEffect(() => {
    try {
      const m  = localStorage.getItem('profileMode') as ProfileMode | null
      const id = localStorage.getItem('profileActorId')
      const nm = localStorage.getItem('profileActorName')
      const li = localStorage.getItem('profileLoggedIn')
      if (m)  setModeState(m)
      if (id) setActorId(id)
      if (nm) setActorName(nm)
      if (li === 'false') setLoggedIn(false)
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

  function login() {
    setLoggedIn(true)
    try { localStorage.setItem('profileLoggedIn', 'true') } catch {}
  }

  function logout() {
    setLoggedIn(false)
    try { localStorage.setItem('profileLoggedIn', 'false') } catch {}
  }

  if (!hydrated) return null

  return (
    <ProfileContext.Provider value={{ mode, actorId, actorName, loggedIn, setMode, setActor, clearActor, login, logout }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
