'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import ArtistModal from '@/components/ArtistModal'
import { IconMail, IconPhone, IconTheatre, IconSun, IconHeart } from '@/lib/icons'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArtistRow {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  avatar_url: string | null
  productionCount: number
}

interface ProductionRef {
  id: string
  title: string
  theatreName: string | null
  status: string | null
}

interface EventRef {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  room: string | null
  productionTitle: string | null
}

interface AvailRef {
  id: string
  type: string
  start_time: string
  end_time: string
  note: string | null
}

interface ArtistDetail {
  productions: ProductionRef[]
  upcomingEvents: EventRef[]
  pastEvents: EventRef[]
  vacations: AvailRef[]
  sicknesses: AvailRef[]
}

interface ProductionForModal { id: string; title: string; theatres?: { name: string } | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
  'Aktywny':             { badge: 'bg-green-100 text-green-700',  dot: 'bg-green-400'  },
  'Na urlopie':          { badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400'  },
  'Choroba':             { badge: 'bg-red-100 text-red-600',      dot: 'bg-red-400'    },
  'Nieaktywny':          { badge: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-300'   },
  'Kontrakt zakończony': { badge: 'bg-gray-100 text-gray-400',    dot: 'bg-gray-200'   },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtDayShort(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 'md' }: { url: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className={`${sz} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${sz} rounded-full bg-gray-200 flex items-center justify-center font-semibold text-gray-600 shrink-0`}>
      {initials(name)}
    </div>
  )
}

// ─── Artist card ──────────────────────────────────────────────────────────────

function ArtistCard({ artist, isSelected, onClick }: {
  artist: ArtistRow
  isSelected: boolean
  onClick: () => void
}) {
  const style = STATUS_STYLE[artist.status ?? 'Aktywny'] ?? STATUS_STYLE['Aktywny']
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      <Avatar url={artist.avatar_url} name={artist.name} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{artist.name}</p>
        <p className="text-xs text-gray-400 truncate">{artist.role ?? '—'}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
          {artist.status ?? 'Aktywny'}
        </span>
        {artist.productionCount > 0 && (
          <span className="text-[10px] text-gray-400">{artist.productionCount} prod.</span>
        )}
      </div>
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function ProfilePanel({ artist, detail, loading, onEdit, onClose }: {
  artist: ArtistRow
  detail: ArtistDetail | null
  loading: boolean
  onEdit: () => void
  onClose: () => void
}) {
  const style = STATUS_STYLE[artist.status ?? 'Aktywny'] ?? STATUS_STYLE['Aktywny']
  const now = new Date()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-5 border-b border-gray-100 shrink-0">
        <div className="flex items-start justify-between mb-4">
          <Avatar url={artist.avatar_url} name={artist.name} size="lg" />
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none">
            ×
          </button>
        </div>

        <h2 className="text-base font-bold text-gray-900">{artist.name}</h2>
        {artist.role && <p className="text-xs text-gray-500 mt-0.5">{artist.role}</p>}

        <div className="flex items-center gap-2 mt-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${style.badge}`}>
            {artist.status ?? 'Aktywny'}
          </span>
        </div>

        {/* Contact */}
        <div className="mt-3 space-y-1">
          {artist.email && (
            <a href={`mailto:${artist.email}`}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800 transition-colors group">
              <IconMail size={12} className="text-gray-300 group-hover:text-gray-500" />
              {artist.email}
            </a>
          )}
          {artist.phone && (
            <a href={`tel:${artist.phone}`}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800 transition-colors group">
              <IconPhone size={12} className="text-gray-300 group-hover:text-gray-500" />
              {artist.phone}
            </a>
          )}
        </div>

        <button onClick={onEdit}
          className="mt-4 w-full py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          Edytuj profil
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">Ładowanie…</div>
      ) : detail ? (
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">

          {/* Productions */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Produkcje ({detail.productions.length})
            </p>
            {detail.productions.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Brak przypisanych produkcji</p>
            ) : (
              <div className="space-y-1.5">
                {detail.productions.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{p.title}</p>
                      {p.theatreName && <p className="text-[10px] text-gray-400">{p.theatreName}</p>}
                    </div>
                    {p.status && (
                      <span className="text-[10px] text-gray-400 shrink-0 ml-2">{p.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming events */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Nadchodzące ({detail.upcomingEvents.length})
            </p>
            {detail.upcomingEvents.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Brak zaplanowanych wydarzeń</p>
            ) : (
              <div className="space-y-1.5">
                {detail.upcomingEvents.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-xl bg-gray-50">
                    <div className="shrink-0 text-center w-8 mt-0.5">
                      <p className="text-[10px] text-gray-400 leading-none">
                        {new Date(ev.start_time).toLocaleDateString('pl-PL', { weekday: 'short' })}
                      </p>
                      <p className="text-sm font-bold text-gray-700 leading-tight">
                        {new Date(ev.start_time).getDate()}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 truncate">{ev.type ?? ev.title}</p>
                      <p className="text-[10px] text-gray-400">
                        {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                        {ev.room ? ` · ${ev.room}` : ''}
                      </p>
                      {ev.productionTitle && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 truncate">
                          <IconTheatre size={10} className="text-gray-400 shrink-0" /><span>{ev.productionTitle}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Availability */}
          {(detail.vacations.length > 0 || detail.sicknesses.length > 0) && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Dostępność</p>
              <div className="space-y-1.5">
                {detail.vacations.map(v => {
                  const isActive = v.start_time <= now.toISOString() && v.end_time >= now.toISOString()
                  return (
                    <div key={v.id} className={`flex items-start gap-2 py-1.5 px-2.5 rounded-xl ${isActive ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50'}`}>
                      <IconSun size={16} className="text-gray-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                          {fmtDate(v.start_time)} – {fmtDate(v.end_time)}
                        </p>
                        {v.note && <p className="text-[10px] text-gray-400">{v.note}</p>}
                      </div>
                      {isActive && <span className="text-[10px] font-semibold text-amber-600 shrink-0 ml-auto">aktywny</span>}
                    </div>
                  )
                })}
                {detail.sicknesses.map(s => {
                  const isActive = s.start_time <= now.toISOString() && s.end_time >= now.toISOString()
                  return (
                    <div key={s.id} className={`flex items-start gap-2 py-1.5 px-2.5 rounded-xl ${isActive ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                      <IconHeart size={16} className="text-gray-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                          {fmtDate(s.start_time)} – {fmtDate(s.end_time)}
                        </p>
                        {s.note && <p className="text-[10px] text-gray-400">{s.note}</p>}
                      </div>
                      {isActive && <span className="text-[10px] font-semibold text-red-500 shrink-0 ml-auto">aktywny</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Past events */}
          {detail.pastEvents.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Historia ({detail.pastEvents.length})
              </p>
              <div className="space-y-1">
                {detail.pastEvents.map(ev => (
                  <div key={ev.id} className="flex items-center gap-2.5 py-1 px-2 opacity-50">
                    <span className="text-[10px] text-gray-400 w-14 shrink-0">{fmtDate(ev.start_time).slice(0, 5)}</span>
                    <span className="text-xs text-gray-600 truncate">{ev.type ?? ev.title}</span>
                    {ev.productionTitle && (
                      <span className="text-[10px] text-gray-400 ml-auto shrink-0 truncate max-w-[80px]">{ev.productionTitle}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : null}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ArtistsPage() {
  const [artists,      setArtists]      = useState<ArtistRow[]>([])
  const [productions,  setProductions]  = useState<ProductionForModal[]>([])
  const [loading,      setLoading]      = useState(true)

  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [detail,       setDetail]       = useState<ArtistDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [modal,        setModal]        = useState<ArtistRow | null | undefined>(undefined)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { fetchArtists() }, [])

  async function fetchArtists() {
    setLoading(true)
    const [{ data: aData }, { data: pData }] = await Promise.all([
      supabase.from('artists')
        .select('id, name, email, phone, role, status, avatar_url, teams!inner(name), artist_productions(production_id)')
        .eq('teams.name', 'Cast')
        .order('name'),
      supabase.from('productions').select('id, title, theatres(name)').order('title'),
    ])

    setArtists(((aData ?? []) as any[]).map(a => ({
      id:              a.id,
      name:            a.name,
      email:           a.email ?? '',
      phone:           a.phone ?? null,
      role:            a.role ?? null,
      status:          a.status ?? 'Aktywny',
      avatar_url:      a.avatar_url ?? null,
      productionCount: (a.artist_productions ?? []).length,
    })))
    setProductions(((pData ?? []) as any[]).map(p => ({
      id: p.id, title: p.title,
      theatres: Array.isArray(p.theatres) ? (p.theatres[0] ?? null) : (p.theatres ?? null),
    })))
    setLoading(false)
  }

  async function fetchDetail(artistId: string) {
    setDetailLoading(true)
    const now = new Date().toISOString()

    const [{ data: apData }, { data: avData }, { data: eaData }] = await Promise.all([
      supabase.from('artist_productions')
        .select('productions(id, title, status, theatres(name))')
        .eq('artist_id', artistId),
      supabase.from('availabilities')
        .select('id, type, start_time, end_time, note')
        .eq('artist_id', artistId)
        .in('type', ['Urlop', 'Choroba'])
        .order('start_time'),
      supabase.from('event_artists')
        .select('event_id')
        .eq('artist_id', artistId),
    ])

    const eventIds = (eaData ?? []).map((r: any) => r.event_id)

    let upcomingEvents: EventRef[] = []
    let pastEvents: EventRef[] = []

    if (eventIds.length > 0) {
      const [{ data: upData }, { data: pastData }] = await Promise.all([
        supabase.from('events')
          .select('id, title, type, start_time, end_time, rooms(name), productions(title)')
          .in('id', eventIds)
          .gte('start_time', now)
          .order('start_time')
          .limit(20),
        supabase.from('events')
          .select('id, title, type, start_time, end_time, productions(title)')
          .in('id', eventIds)
          .lt('start_time', now)
          .order('start_time', { ascending: false })
          .limit(15),
      ])

      upcomingEvents = ((upData ?? []) as any[]).map(e => {
        const rm   = Array.isArray(e.rooms)       ? e.rooms[0]       : e.rooms
        const prod = Array.isArray(e.productions)  ? e.productions[0] : e.productions
        return { id: e.id, title: e.title, type: e.type, start_time: e.start_time, end_time: e.end_time, room: rm?.name ?? null, productionTitle: prod?.title ?? null }
      })
      pastEvents = ((pastData ?? []) as any[]).map(e => {
        const prod = Array.isArray(e.productions) ? e.productions[0] : e.productions
        return { id: e.id, title: e.title, type: e.type, start_time: e.start_time, end_time: e.end_time, room: null, productionTitle: prod?.title ?? null }
      })
    }

    const prods: ProductionRef[] = ((apData ?? []) as any[]).map(ap => {
      const p = Array.isArray(ap.productions) ? ap.productions[0] : ap.productions
      const th = p ? (Array.isArray(p.theatres) ? p.theatres[0] : p.theatres) : null
      return p ? { id: p.id, title: p.title, status: p.status, theatreName: th?.name ?? null } : null
    }).filter(Boolean) as ProductionRef[]

    const avRaw = ((avData ?? []) as any[])
    setDetail({
      productions:    prods,
      upcomingEvents,
      pastEvents,
      vacations:  avRaw.filter(r => r.type === 'Urlop'),
      sicknesses: avRaw.filter(r => r.type === 'Choroba'),
    })
    setDetailLoading(false)
  }

  function selectArtist(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return }
    setSelectedId(id)
    setDetail(null)
    fetchDetail(id)
  }

  // Filters
  const filtered = useMemo(() => {
    let list = artists
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a => a.name.toLowerCase().includes(q) || (a.role ?? '').toLowerCase().includes(q))
    }
    return list
  }, [artists, statusFilter, search])

  const selectedArtist = artists.find(a => a.id === selectedId) ?? null

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: artists.length }
    for (const a of artists) c[a.status ?? 'Aktywny'] = (c[a.status ?? 'Aktywny'] ?? 0) + 1
    return c
  }, [artists])

  const statusOptions = ['Aktywny', 'Na urlopie', 'Choroba', 'Nieaktywny', 'Kontrakt zakończony']

  return (
    <>
      {modal !== undefined && (
        <ArtistModal
          artist={modal}
          productions={productions}
          onClose={() => setModal(undefined)}
          onSaved={() => {
            setModal(undefined)
            fetchArtists()
            if (selectedId) fetchDetail(selectedId)
          }}
        />
      )}

      <div className="flex gap-0 -m-8 h-[calc(100vh-0px)] overflow-hidden">

        {/* ── Left: list ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-white shrink-0">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Artyści</h2>
              <p className="text-xs text-gray-400 mt-0.5">{artists.length} osób</p>
            </div>
            <button
              onClick={() => setModal(null)}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              + Nowa osoba
            </button>
          </div>

          {/* Search + filter */}
          <div className="px-8 py-3 border-b border-gray-100 bg-white shrink-0 flex items-center gap-3 flex-wrap">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj po nazwie lub roli…"
              className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <div className="flex gap-1 flex-wrap">
              {[{ key: 'all', label: 'Wszyscy' }, ...statusOptions.map(s => ({ key: s, label: s }))].map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === f.key
                      ? f.key === 'all'
                        ? 'bg-gray-900 text-white'
                        : (STATUS_STYLE[f.key]?.badge ?? 'bg-gray-100 text-gray-700')
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                  {statusCounts[f.key] != null && (
                    <span className="ml-1 opacity-60">{statusCounts[f.key]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-8 py-4">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Ładowanie…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="flex justify-center mb-3"><IconTheatre size={48} className="text-gray-300 mx-auto" /></div>
                <p className="text-sm font-medium">Brak artystów</p>
                {search && <p className="text-xs mt-1">Spróbuj innego wyszukiwania</p>}
              </div>
            ) : (
              <div className={`grid gap-2 ${selectedArtist ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                {filtered.map(a => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    isSelected={selectedId === a.id}
                    onClick={() => selectArtist(a.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: profile panel ─────────────────────────────────────────── */}
        <div className={`shrink-0 border-l border-gray-200 bg-white transition-all duration-200 overflow-hidden ${selectedArtist ? 'w-80' : 'w-0'}`}>
          {selectedArtist && (
            <ProfilePanel
              artist={selectedArtist}
              detail={detail}
              loading={detailLoading}
              onEdit={() => setModal(selectedArtist)}
              onClose={() => { setSelectedId(null); setDetail(null) }}
            />
          )}
        </div>

      </div>
    </>
  )
}
