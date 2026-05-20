'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import { useTheatre } from '@/lib/theatre-context'
import ProductionModal from '@/components/ProductionModal'

interface EventRow {
  id: string
  start_time: string
  end_time: string
  type: string | null
  room_id: string | null
  event_artists: { artist_id: string }[]
}

interface ProductionRow {
  id: string
  title: string
  director: string | null
  premiere_date: string | null
  start_date: string | null
  end_date: string | null
  theatre_id: string | null
  status: string | null
  comment: string | null
  theatreName: string | null
  actorCount: number
  rehearsalCount: number
  hasConflict: boolean
}

interface ArtistRecord {
  id: string
  name: string
  role: string | null
  teams?: { name: string } | null
}


const STATUS_STYLE: Record<string, { badge: string; bar: string }> = {
  'Koncepcja':   { badge: 'bg-slate-100 text-slate-600',  bar: 'bg-slate-300' },
  'W produkcji': { badge: 'bg-blue-100 text-blue-700',    bar: 'bg-blue-400'  },
  'Na afiszu':   { badge: 'bg-green-100 text-green-700',  bar: 'bg-green-400' },
  'Zawieszony':  { badge: 'bg-amber-100 text-amber-700',  bar: 'bg-amber-400' },
  'Zdjęty':      { badge: 'bg-red-100 text-red-500',      bar: 'bg-red-400'   },
}

const THEATRE_BAR: Record<string, string> = {
  'Teatr Polonia': 'bg-red-500',
  'Och-Teatr':     'bg-yellow-400',
}

function detectConflict(events: EventRow[]): boolean {
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j]
      const overlap =
        new Date(a.start_time) < new Date(b.end_time) &&
        new Date(b.start_time) < new Date(a.end_time)
      if (!overlap) continue
      // Artist conflict
      const aIds = a.event_artists.map(ea => ea.artist_id)
      const bIds = b.event_artists.map(ea => ea.artist_id)
      if (aIds.some(id => bIds.includes(id))) return true
      // Room conflict
      if (a.room_id && b.room_id && a.room_id === b.room_id) return true
    }
  }
  return false
}

function formatDate(iso: string | null) {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export default function ProductionsPage() {
  const { t } = useLanguage()
  const { selectedTheatreId } = useTheatre()

  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [theatres,    setTheatres]    = useState<{ id: string; name: string }[]>([])
  const [rooms,       setRooms]       = useState<{ id: string; theatre_id: string; name: string }[]>([])
  const [artists,     setArtists]     = useState<ArtistRecord[]>([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState<ProductionRow | null | undefined>(undefined)
  // undefined = closed, null = create, ProductionRow = edit

  useEffect(() => { fetchData() }, [selectedTheatreId])

  async function fetchData() {
    setLoading(true)

    let query = supabase
      .from('productions')
      .select(`
        id, title, director, premiere_date, start_date, end_date, theatre_id, status,
        theatres(name),
        artist_productions(artist_id),
        events(id, start_time, end_time, type, room_id, event_artists(artist_id))
      `)
      .order('title')

    if (selectedTheatreId) query = query.eq('theatre_id', selectedTheatreId)

    const [{ data: prodData }, { data: thData }, { data: artistData }, { data: roomData }] = await Promise.all([
      query,
      supabase.from('theatres').select('id, name').order('name'),
      supabase.from('artists').select('id, name, role, teams(name)').order('name'),
      supabase.from('rooms').select('id, theatre_id, name').order('name'),
    ])

    const rows: ProductionRow[] = (prodData ?? []).map((p: any) => {
      const th = Array.isArray(p.theatres) ? p.theatres[0] : p.theatres
      const events: EventRow[] = (p.events ?? []).map((e: any) => ({
        id:           e.id,
        start_time:   e.start_time,
        end_time:     e.end_time,
        type:         e.type,
        room_id:      e.room_id ?? null,
        event_artists: e.event_artists ?? [],
      }))
      return {
        id:             p.id,
        title:          p.title,
        director:       p.director,
        premiere_date:  p.premiere_date,
        start_date:     p.start_date,
        end_date:       p.end_date,
        theatre_id:     p.theatre_id,
        status:         p.status,
        comment:        p.comment ?? null,
        theatreName:    th?.name ?? null,
        actorCount:     (p.artist_productions ?? []).length,
        rehearsalCount: events.length,
        hasConflict:    detectConflict(events),
      }
    })

    setProductions(rows)
    setTheatres(thData ?? [])
    setArtists((artistData ?? []).map((a: any) => ({
      id:    a.id,
      name:  a.name,
      role:  a.role,
      teams: Array.isArray(a.teams) ? (a.teams[0] ?? null) : (a.teams ?? null),
    })))
    setRooms(roomData ?? [])
    setLoading(false)
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t.productions.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{productions.length} produkcji</p>
        </div>
        <button
          onClick={() => setModal(null)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          + Nowa produkcja
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">{t.productions.loading}</p>
      ) : productions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">🎭</p>
          <p className="text-lg font-medium">{t.productions.empty}</p>
          <p className="text-sm mt-1">{t.productions.emptyHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {productions.map(p => {
            const status  = p.status ?? 'Koncepcja'
            const style   = STATUS_STYLE[status] ?? STATUS_STYLE['Koncepcja']
            const barColor = p.theatreName ? (THEATRE_BAR[p.theatreName] ?? 'bg-gray-300') : 'bg-gray-300'
            const premiere = formatDate(p.premiere_date)

            return (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col hover:shadow-md transition-shadow"
              >
                {/* Theatre colour bar */}
                <div className={`h-1 w-full ${barColor}`} />

                <div className="p-5 flex flex-col flex-1 gap-3">
                  {/* Top row: theatre + status */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-gray-400 truncate">
                      {p.theatreName ?? '—'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${style.badge}`}>
                      {status}
                    </span>
                  </div>

                  {/* Title */}
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 leading-tight">{p.title}</h3>
                    {p.director && (
                      <p className="text-sm text-gray-500 mt-0.5">reż. {p.director}</p>
                    )}
                  </div>

                  {/* Premiere */}
                  {premiere && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-gray-400 text-xs">Premiera</span>
                      <span className="font-semibold text-gray-800">{premiere}</span>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 pt-1 border-t border-gray-50">
                    <div className="flex flex-col items-center">
                      <span className="text-xl font-bold text-gray-900">{p.actorCount}</span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Aktorów</span>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="flex flex-col items-center">
                      <span className="text-xl font-bold text-gray-900">{p.rehearsalCount}</span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Wydarzeń</span>
                    </div>
                    <div className="flex-1" />
                    {p.hasConflict && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-red-50 rounded-lg">
                        <span className="text-sm">⚠️</span>
                        <span className="text-[11px] font-semibold text-red-600">Konflikt</span>
                      </div>
                    )}
                  </div>

                  {/* Edit button */}
                  <button
                    onClick={() => setModal(p)}
                    className="mt-auto w-full py-2 text-xs font-medium text-gray-500 border border-gray-100 rounded-xl hover:bg-gray-50 hover:text-gray-800 transition-colors"
                  >
                    Edytuj
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal !== undefined && (
        <ProductionModal
          production={modal}
          theatres={theatres}
          rooms={rooms}
          artists={artists}
          onClose={() => setModal(undefined)}
          onSaved={() => { setModal(undefined); fetchData() }}
        />
      )}
    </div>
  )
}
