'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface TheatreContextType {
  selectedTheatreId: string | null
  setSelectedTheatreId: (id: string | null) => void
}

const TheatreContext = createContext<TheatreContextType | null>(null)

export function TheatreProvider({ children }: { children: ReactNode }) {
  const [selectedTheatreId, setSelectedTheatreId] = useState<string | null>(null)

  return (
    <TheatreContext.Provider value={{ selectedTheatreId, setSelectedTheatreId }}>
      {children}
    </TheatreContext.Provider>
  )
}

export function useTheatre() {
  const ctx = useContext(TheatreContext)
  if (!ctx) throw new Error('useTheatre must be used within TheatreProvider')
  return ctx
}
