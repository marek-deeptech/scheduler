'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Dublerzy PER TYTUŁ — lista tytułów aktora, a do każdego osobna lista dublerów.
// Używany w profilu koordynatora (editable) i w profilu aktora (podgląd).

export interface ProdRef {
  id:           string
  title:        string
  theatreName?: string | null
}

export interface ActorRef {
  id:          string
  name:        string
  role?:       string | null
  avatar_url?: string | null
}

interface Props {
  actorId:     string
  productions: ProdRef[]
  allActors:   ActorRef[]
  editable?:   boolean
  onChange?:   () => void
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function MiniAvatar({ actor }: { actor: ActorRef }) {
  if (actor.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={actor.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
  }
  return (
    <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
          style={{ background: '#f2ede6', color: '#7a7068' }}>
      {initials(actor.name)}
    </span>
  )
}

export default function SubstitutesByTitle({ actorId, productions, allActors, editable = false, onChange }: Props) {
  const [byProd,    setByProd]    = useState<Record<string, string[]>>({})
  const [extra,     setExtra]     = useState<Map<string, ActorRef>>(new Map())
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [search,    setSearch]    = useState('')
  const [busy,      setBusy]      = useState(false)

  const actorById = useMemo(() => {
    const m = new Map<string, ActorRef>()
    for (const a of allActors) m.set(a.id, a)
    return m
  }, [allActors])

  // Tożsamość dublera bierzemy z listy rodzica, a gdy go tam brak (np. lista
  // koordynatora ogranicza się do zespołu Cast) — z doczytanych rekordów.
  const lookup = (id: string): ActorRef | undefined => actorById.get(id) ?? extra.get(id)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const { data, error: err } = await supabase
        .from('actor_production_substitutes')
        .select('production_id, substitute_id')
        .eq('actor_id', actorId)
      if (cancelled) return
      if (err) { setError(err.message); setLoading(false); return }
      const map: Record<string, string[]> = {}
      for (const r of (data ?? []) as any[]) {
        (map[r.production_id] ??= []).push(r.substitute_id)
      }
      setByProd(map)

      // Doczytaj tożsamość dublerów wprost (niezależnie od listy rodzica, która
      // u koordynatora ogranicza się do zespołu Cast).
      const allIds = [...new Set(Object.values(map).flat())]
      if (allIds.length > 0) {
        const { data: extraData } = await supabase
          .from('artists').select('id, name, role, avatar_url').in('id', allIds)
        if (!cancelled && extraData) {
          const m = new Map<string, ActorRef>()
          for (const a of extraData as any[]) m.set(a.id, { id: a.id, name: a.name, role: a.role, avatar_url: a.avatar_url })
          setExtra(m)
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [actorId])

  async function add(prodId: string, subId: string) {
    if (busy) return
    setBusy(true)
    setByProd(prev => ({ ...prev, [prodId]: [...(prev[prodId] ?? []), subId] }))
    setSearch('')
    setAddingFor(null)
    const { error: err } = await supabase.from('actor_production_substitutes')
      .insert({ actor_id: actorId, production_id: prodId, substitute_id: subId })
    if (err) {
      // wycofaj optymistyczną zmianę
      setByProd(prev => ({ ...prev, [prodId]: (prev[prodId] ?? []).filter(id => id !== subId) }))
      setError(err.message)
    } else {
      onChange?.()
    }
    setBusy(false)
  }

  async function remove(prodId: string, subId: string) {
    if (busy) return
    setBusy(true)
    const before = byProd[prodId] ?? []
    setByProd(prev => ({ ...prev, [prodId]: (prev[prodId] ?? []).filter(id => id !== subId) }))
    const { error: err } = await supabase.from('actor_production_substitutes')
      .delete()
      .eq('actor_id', actorId)
      .eq('production_id', prodId)
      .eq('substitute_id', subId)
    if (err) {
      setByProd(prev => ({ ...prev, [prodId]: before }))
      setError(err.message)
    } else {
      onChange?.()
    }
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#e4ddd4', borderTopColor: '#c8102e' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-3 rounded-xl text-xs" style={{ background: '#fff5f5', color: '#c8102e', border: '1px solid #fecaca' }}>
        Nie udało się wczytać dublerów: {error}
        <div className="mt-1 text-[11px]" style={{ color: '#9a6a6a' }}>
          Jeśli to pierwsze użycie — uruchom <code>supabase-migration-substitutes-per-title.sql</code>.
        </div>
      </div>
    )
  }

  if (productions.length === 0) {
    return <p className="text-xs italic px-1" style={{ color: '#a89e92' }}>Aktor nie jest przypisany do żadnego tytułu.</p>
  }

  return (
    <div className="space-y-3">
      {productions.map(prod => {
        const subIds = byProd[prod.id] ?? []
        const subs = subIds.map(id => lookup(id)).filter(Boolean) as ActorRef[]
        const isAdding = addingFor === prod.id
        const candidates = allActors
          .filter(a => a.id !== actorId && !subIds.includes(a.id) && a.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 30)

        return (
          <div key={prod.id} className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
            {/* Tytuł */}
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#1a1410' }}>{prod.title}</p>
                {prod.theatreName && <p className="text-[10px]" style={{ color: '#a89e92' }}>{prod.theatreName}</p>}
              </div>
              <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: subs.length ? '#f0fdf4' : '#faf8f5', color: subs.length ? '#15803d' : '#a89e92', border: `1px solid ${subs.length ? '#bbf7d0' : '#e4ddd4'}` }}>
                {subs.length} {subs.length === 1 ? 'dubler' : 'dublerów'}
              </span>
            </div>

            {/* Lista dublerów */}
            {subs.length === 0 ? (
              <p className="text-xs italic" style={{ color: '#a89e92' }}>Brak dublerów dla tego tytułu</p>
            ) : (
              <div className="flex flex-col gap-1">
                {subs.map(s => (
                  <div key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg" style={{ background: '#faf8f5', border: '1px solid #ede8e0' }}>
                    <MiniAvatar actor={s} />
                    <span className="text-xs font-medium flex-1 min-w-0 truncate" style={{ color: '#1a1410' }}>{s.name}</span>
                    {s.role && <span className="text-[10px] shrink-0" style={{ color: '#a89e92' }}>{s.role}</span>}
                    {editable && (
                      <button type="button" onClick={() => remove(prod.id, s.id)} disabled={busy}
                        className="w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors disabled:opacity-40"
                        style={{ background: '#fff', color: '#a89e92', border: '1px solid #e4ddd4' }}
                        title="Usuń dublera">✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Dodawanie (tylko koordynator) */}
            {editable && (
              <div className="mt-2">
                {!isAdding ? (
                  <button type="button" onClick={() => { setAddingFor(prod.id); setSearch('') }}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ color: '#c8102e', border: '1px dashed #f0c4c4' }}>
                    + Dodaj dublera
                  </button>
                ) : (
                  <div className="rounded-lg p-2" style={{ background: '#faf8f5', border: '1px solid #ede8e0' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj aktora…"
                        className="flex-1 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
                        style={{ border: '1px solid #e4ddd4' }} />
                      <button type="button" onClick={() => { setAddingFor(null); setSearch('') }}
                        className="text-[11px] px-2 py-1.5 rounded-lg" style={{ color: '#a89e92' }}>Anuluj</button>
                    </div>
                    <div className="flex flex-col gap-0.5 max-h-44 overflow-y-auto">
                      {candidates.length === 0 ? (
                        <p className="text-[11px] italic px-1 py-1" style={{ color: '#a89e92' }}>Brak pasujących aktorów</p>
                      ) : candidates.map(a => (
                        <button key={a.id} type="button" disabled={busy} onClick={() => add(prod.id, a.id)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white disabled:opacity-50">
                          <MiniAvatar actor={a} />
                          <span className="text-xs flex-1 min-w-0 truncate" style={{ color: '#1a1410' }}>{a.name}</span>
                          {a.role && <span className="text-[10px] shrink-0" style={{ color: '#a89e92' }}>{a.role}</span>}
                          <span className="text-[11px] font-bold shrink-0" style={{ color: '#c8102e' }}>+</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
