'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile-context'
import SubstitutesByTitle, { type ProdRef, type ActorRef } from '@/components/SubstitutesByTitle'

export default function ActorSubstitutesPage() {
  const router = useRouter()
  const { actorId, actorName } = useProfile()

  const [productions, setProductions] = useState<ProdRef[]>([])
  const [allActors,   setAllActors]   = useState<ActorRef[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!actorId) router.push('/dashboard')
  }, [actorId, router])

  useEffect(() => {
    if (!actorId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('artist_productions')
        .select('productions(id, title, theatres(name))')
        .eq('artist_id', actorId),
      supabase.from('artists')
        .select('id, name, role, avatar_url'),
    ]).then(([{ data: apData }, { data: artData }]) => {
      if (cancelled) return
      const prods: ProdRef[] = ((apData ?? []) as any[]).map(ap => {
        const p = Array.isArray(ap.productions) ? ap.productions[0] : ap.productions
        const th = p ? (Array.isArray(p.theatres) ? p.theatres[0] : p.theatres) : null
        return p ? { id: p.id, title: p.title, theatreName: th?.name ?? null } : null
      }).filter(Boolean) as ProdRef[]
      prods.sort((a, b) => a.title.localeCompare(b.title, 'pl'))
      setProductions(prods)
      setAllActors(((artData ?? []) as any[]).map(a => ({ id: a.id, name: a.name, role: a.role, avatar_url: a.avatar_url })))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [actorId])

  if (!actorId) return null

  return (
    <div className="flex flex-col h-full -m-4 md:-m-8">
      {/* Header */}
      <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4 border-b border-gray-100 bg-white shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Moi dublerzy</h1>
        <p className="text-xs text-gray-500 mt-0.5">{actorName}</p>
      </div>

      {/* Treść */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5" style={{ background: '#faf8f5' }}>
        <div className="max-w-2xl">
          <p className="text-[11px] mb-4" style={{ color: '#a89e92' }}>
            Dla każdego z Twoich tytułów koordynator wskazuje osobnych dublerów, którzy mogą Cię zastąpić w razie potrzeby.
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#e4ddd4', borderTopColor: '#c8102e' }} />
            </div>
          ) : (
            <SubstitutesByTitle
              actorId={actorId}
              productions={productions}
              allActors={allActors}
              editable={false}
            />
          )}
        </div>
      </div>
    </div>
  )
}
