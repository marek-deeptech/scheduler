'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import { useTheatre } from '@/lib/theatre-context'
import ProductionModal from '@/components/ProductionModal'
import { IconWarning, IconTheatre } from '@/lib/icons'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CastMember  { id: string; name: string; role: string | null; avatar_url: string | null }
interface EventRow    {
  id: string; title: string; type: string | null
  start_time: string; end_time: string
  room: string | null; artist_count: number
}

interface ProductionRow {
  id: string
  title: string
  director: string | null
  premiere_date: string | null
  start_date: string | null
  end_date: string | null
  theatre_id: string | null
  theatreName: string | null
  status: string
  comment: string | null
  is_favourite: boolean
  cast: CastMember[]
  events: EventRow[]
  hasConflict: boolean
}

interface ArtistRecord { id: string; name: string; role: string | null; teams?: { name: string } | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['Bieżące', 'Planowane', 'Archiwalne']

const STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
  'Bieżące':   { badge: 'bg-green-100 text-green-700',  dot: 'bg-green-400'  },
  'Planowane': { badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400'  },
  'Archiwalne':{ badge: 'bg-slate-100 text-slate-500',  dot: 'bg-slate-300'  },
}

const THEATRE_BAR: Record<string, string> = {
  'Teatr Polonia': 'bg-red-500',
  'Och-Teatr':     'bg-yellow-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtDayShort(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}
function detectConflict(evs: any[]): boolean {
  for (let i = 0; i < evs.length; i++) {
    for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i], b = evs[j]
      if (!(new Date(a.start_time) < new Date(b.end_time) && new Date(b.start_time) < new Date(a.end_time))) continue
      const aIds = (a.event_artists ?? []).map((ea: any) => ea.artist_id)
      const bIds = (b.event_artists ?? []).map((ea: any) => ea.artist_id)
      if (aIds.some((id: string) => bIds.includes(id))) return true
      if (a.room_id && b.room_id && a.room_id === b.room_id) return true
    }
  }
  return false
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ member, size = 'sm' }: { member: CastMember; size?: 'sm' | 'md' }) {
  const sz = size === 'md' ? 'w-9 h-9 text-xs' : 'w-7 h-7 text-[10px]'
  return member.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={member.avatar_url} alt={member.name} title={member.name}
      className={`${sz} rounded-full object-cover border-2 border-white shrink-0`} />
  ) : (
    <div title={member.name}
      className={`${sz} rounded-full border-2 border-white flex items-center justify-center font-semibold shrink-0`}
      style={{ background: '#e8e0d6', color: '#5a524a' }}>
      {initials(member.name)}
    </div>
  )
}

// ─── Production card ──────────────────────────────────────────────────────────

function ProductionCard({ prod, isSelected, onClick, onEdit }: {
  prod: ProductionRow
  isSelected: boolean
  onClick: () => void
  onEdit: () => void
}) {
  const now      = new Date()
  const upcoming = prod.events.filter(e => new Date(e.start_time) >= now).slice(0, 1)[0]
  const style    = STATUS_STYLE[prod.status] ?? STATUS_STYLE['Bieżące']
  const barColor = prod.theatreName ? (THEATRE_BAR[prod.theatreName] ?? 'bg-gray-300') : 'bg-gray-300'
  const castPreview = prod.cast.slice(0, 5)
  const extraCast   = Math.max(0, prod.cast.length - 5)

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all ${
        isSelected ? 'shadow-lg ring-1 ring-[#c8102e]' : 'border-[#e4ddd4] hover:shadow-md hover:border-[#cec5b8]'
      }`}
      style={isSelected ? { borderColor: '#c8102e' } : undefined}
    >
      <div className={`h-1 w-full ${barColor}`} />

      <div className="p-5 flex flex-col flex-1 gap-3">

        {/* Theatre + status */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-gray-500 truncate">{prod.theatreName ?? '—'}</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${style.badge}`}>
            {prod.status}
          </span>
        </div>

        {/* Title + director */}
        <div>
          <div className="flex items-start gap-2">
            <h3 className="text-lg font-bold leading-tight flex-1" style={{ color: '#1a1410' }}>{prod.title}</h3>
            {prod.is_favourite && (
              <span title="Favourite" className="shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                </svg>
              </span>
            )}
          </div>
          {prod.director && <p className="text-xs text-gray-500 mt-0.5">reż. {prod.director}</p>}
        </div>

        {/* Premiere */}
        {prod.premiere_date && (
          <p className="text-xs text-gray-500">
            <span className="text-gray-500">Premiera </span>
            <span className="font-semibold text-gray-700">{fmtDate(prod.premiere_date)}</span>
          </p>
        )}

        {/* Cast avatar stack */}
        {prod.cast.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {castPreview.map(m => <Avatar key={m.id} member={m} />)}
            </div>
            {extraCast > 0 && (
              <span className="text-[11px] text-gray-500 ml-1">+{extraCast}</span>
            )}
            <span className="text-[11px] text-gray-500 ml-auto">{prod.cast.length} os.</span>
          </div>
        )}

        {/* Next event */}
        {upcoming && (
          <div className="flex items-center gap-1.5 py-1.5 px-2.5 bg-gray-50 rounded-xl">
            <span className="text-gray-500 text-[10px] shrink-0">Następne</span>
            <span className="text-xs font-medium text-gray-700 truncate">
              {upcoming.type ?? upcoming.title}
            </span>
            <span className="text-[10px] text-gray-500 shrink-0 ml-auto">{fmtDayShort(upcoming.start_time)}</span>
          </div>
        )}

        {/* Footer stats */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-50 mt-auto">
          <span className="text-xs text-gray-500">{prod.events.length} wydarzeń</span>
          {prod.hasConflict && (
            <span className="text-[11px] font-semibold text-red-500 flex items-center gap-1">
              <IconWarning size={12} className="text-red-500" /> Konflikt
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            className="ml-auto text-[11px] font-medium text-gray-500 hover:text-gray-700 border border-gray-100 hover:border-gray-300 rounded-lg px-2.5 py-1 transition-colors"
          >
            Edytuj
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ prod, onEdit, onClose, onStatusChange }: {
  prod: ProductionRow
  onEdit: () => void
  onClose: () => void
  onStatusChange: (status: string) => Promise<void>
}) {
  const now = new Date()
  const upcoming = prod.events.filter(e => new Date(e.start_time) >= now)
  const past     = prod.events.filter(e => new Date(e.start_time) < now)
  const style    = STATUS_STYLE[prod.status] ?? STATUS_STYLE['Bieżące']
  const [changingStatus, setChangingStatus] = useState(false)
  const [msgOpen,    setMsgOpen]    = useState(false)
  const [msgSubject, setMsgSubject] = useState('')
  const [msgBody,    setMsgBody]    = useState('')
  const [msgSending, setMsgSending] = useState(false)
  const [msgSent,    setMsgSent]    = useState(false)

  // Reset compose form when production changes
  useEffect(() => {
    setMsgOpen(false)
    setMsgSent(false)
    setMsgSubject('')
    setMsgBody('')
  }, [prod.id])

  async function handleSendMessage() {
    if (!msgSubject || !msgBody) return
    setMsgSending(true)
    await fetch('/api/notify/production-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productionId: prod.id,
        productionTitle: prod.title,
        subject: msgSubject,
        body: msgBody,
      }),
    })
    setMsgSending(false)
    setMsgSent(true)
    setMsgSubject('')
    setMsgBody('')
    setTimeout(() => { setMsgSent(false); setMsgOpen(false) }, 3000)
  }

  async function handleStatus(s: string) {
    setChangingStatus(true)
    await onStatusChange(s)
    setChangingStatus(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-base font-bold text-gray-900 leading-tight">{prod.title}</h2>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0 text-lg leading-none">
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {prod.theatreName ?? ''}
          {prod.director ? ` · reż. ${prod.director}` : ''}
        </p>

        {/* Status selector */}
        <div className="flex flex-wrap gap-1 mt-3">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              disabled={changingStatus}
              onClick={() => handleStatus(s)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                prod.status === s
                  ? (STATUS_STYLE[s]?.badge ?? 'bg-gray-100 text-gray-600')
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Dates */}
        <div className="flex flex-wrap gap-3 mt-3 text-xs">
          {prod.premiere_date && (
            <span className="text-gray-500">
              <span className="text-gray-500">Premiera </span>
              <span className="font-semibold">{fmtDate(prod.premiere_date)}</span>
            </span>
          )}
          {prod.start_date && (
            <span className="text-gray-500">
              <span className="text-gray-500">Od </span>
              <span className="font-semibold">{fmtDate(prod.start_date)}</span>
            </span>
          )}
          {prod.end_date && (
            <span className="text-gray-500">
              <span className="text-gray-500">Do </span>
              <span className="font-semibold">{fmtDate(prod.end_date)}</span>
            </span>
          )}
        </div>

        <button
          onClick={onEdit}
          className="mt-3 w-full py-2 text-xs font-medium text-gray-600 border border-[#e4ddd4] rounded-xl hover:bg-gray-50 transition-colors"
        >
          Edytuj szczegóły
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">

        {/* Cast */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#b8b0a4' }}>
            Obsada ({prod.cast.length})
          </p>
          {prod.cast.length === 0 ? (
            <p className="text-xs text-gray-500 italic">Brak przypisanych osób</p>
          ) : (
            <div className="space-y-2">
              {prod.cast.map(m => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <Avatar member={m} size="md" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{m.name}</p>
                    {m.role && <p className="text-[11px] text-gray-500 truncate">{m.role}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!msgOpen ? (
            <button
              onClick={() => setMsgOpen(true)}
              className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mt-4"
            >
              ✉ Wyślij wiadomość do obsady
            </button>
          ) : (
            <div className="mt-4 border-t border-gray-100 pt-4 space-y-2">
              <input
                placeholder="Temat"
                value={msgSubject}
                onChange={e => setMsgSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
              />
              <textarea
                placeholder="Wiadomość..."
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none"
              />
              <div className="flex justify-between items-center">
                <button onClick={() => setMsgOpen(false)} className="text-xs text-gray-500">Anuluj</button>
                <button
                  onClick={handleSendMessage}
                  disabled={msgSending || !msgSubject || !msgBody}
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: '#1a1410', color: '#fff' }}
                >
                  {msgSending ? 'Wysyłanie…' : 'Wyślij'}
                </button>
              </div>
              {msgSent && <p className="text-xs text-green-600">Wysłano do całej obsady ✓</p>}
            </div>
          )}
        </div>

        {/* Upcoming events */}
        {upcoming.length > 0 && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#b8b0a4' }}>
              Zaplanowane ({upcoming.length})
            </p>
            <div className="space-y-1.5">
              {upcoming.map(ev => (
                <div key={ev.id} className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-xl bg-gray-50">
                  <div className="shrink-0 text-center w-8 mt-0.5">
                    <p className="text-[10px] text-gray-500 leading-none">
                      {new Date(ev.start_time).toLocaleDateString('pl-PL', { weekday: 'short' })}
                    </p>
                    <p className="text-sm font-bold text-gray-700 leading-tight">
                      {new Date(ev.start_time).getDate()}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800 truncate">{ev.type ?? ev.title}</p>
                    <p className="text-[10px] text-gray-500">
                      {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                      {ev.room ? ` · ${ev.room}` : ''}
                    </p>
                  </div>
                  {ev.artist_count > 0 && (
                    <span className="text-[10px] text-gray-500 shrink-0 mt-1">{ev.artist_count} os.</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past events */}
        {past.length > 0 && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#b8b0a4' }}>
              Odbyte ({past.length})
            </p>
            <div className="space-y-1">
              {past.slice().reverse().map(ev => (
                <div key={ev.id} className="flex items-center gap-2.5 py-1 px-2 opacity-50">
                  <span className="text-[10px] text-gray-500 w-12 shrink-0">
                    {fmtDate(ev.start_time)?.slice(0, 5)}
                  </span>
                  <span className="text-xs text-gray-600 truncate">{ev.type ?? ev.title}</span>
                  <span className="text-[10px] text-gray-500 ml-auto shrink-0">
                    {fmtTime(ev.start_time)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {prod.comment && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#b8b0a4' }}>Notatki</p>
            <p className="text-xs text-gray-600 leading-relaxed">{prod.comment}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductionsPage() {
  const { t } = useLanguage()
  const { selectedTheatreId } = useTheatre()

  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [theatres,    setTheatres]    = useState<{ id: string; name: string }[]>([])
  const [rooms,       setRooms]       = useState<{ id: string; theatre_id: string; name: string }[]>([])
  const [artists,     setArtists]     = useState<ArtistRecord[]>([])
  const [loading,     setLoading]     = useState(true)

  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [modal,       setModal]       = useState<ProductionRow | null | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => { fetchData() }, [selectedTheatreId])

  async function fetchData() {
    setLoading(true)

    let query = supabase.from('productions').select(`
      id, title, director, premiere_date, start_date, end_date, theatre_id, status, comment, is_favourite,
      theatres(name),
      artist_productions(artists(id, name, role, avatar_url)),
      events(id, title, type, start_time, end_time, room_id, rooms(name), event_artists(artist_id))
    `).order('title')

    if (selectedTheatreId) query = query.eq('theatre_id', selectedTheatreId)

    const [{ data: prodData }, { data: thData }, { data: artistData }, { data: roomData }] = await Promise.all([
      query,
      supabase.from('theatres').select('id, name').order('name'),
      supabase.from('artists').select('id, name, role, teams!inner(name)').eq('teams.name', 'Cast').order('name'),
      supabase.from('rooms').select('id, theatre_id, name').order('name'),
    ])

    // Only show Cast team members in production casts
    const castIdSet = new Set((artistData ?? []).map((a: any) => a.id))

    const rows: ProductionRow[] = (prodData ?? []).map((p: any) => {
      const th     = Array.isArray(p.theatres) ? p.theatres[0] : p.theatres
      const rawEvs = p.events ?? []
      const cast: CastMember[] = (p.artist_productions ?? [])
        .map((ap: any) => {
          const a = Array.isArray(ap.artists) ? ap.artists[0] : ap.artists
          return a ? { id: a.id, name: a.name, role: a.role ?? null, avatar_url: a.avatar_url ?? null } : null
        })
        .filter((a: any) => a && castIdSet.has(a.id))
        .sort((a: CastMember, b: CastMember) => a.name.localeCompare(b.name))
      const events: EventRow[] = rawEvs
        .map((e: any) => {
          const rm = Array.isArray(e.rooms) ? e.rooms[0] : e.rooms
          return {
            id:           e.id,
            title:        e.title,
            type:         e.type ?? null,
            start_time:   e.start_time,
            end_time:     e.end_time,
            room:         rm?.name ?? null,
            artist_count: (e.event_artists ?? []).length,
          }
        })
        .sort((a: EventRow, b: EventRow) => a.start_time.localeCompare(b.start_time))

      return {
        id:            p.id,
        title:         p.title,
        director:      p.director ?? null,
        premiere_date: p.premiere_date ?? null,
        start_date:    p.start_date ?? null,
        end_date:      p.end_date ?? null,
        theatre_id:    p.theatre_id ?? null,
        theatreName:   th?.name ?? null,
        status:        p.status ?? 'Bieżące',
        comment:       p.comment ?? null,
        is_favourite:  p.is_favourite ?? false,
        cast,
        events,
        hasConflict:   detectConflict(rawEvs),
      }
    })

    setProductions(rows)
    setTheatres(thData ?? [])
    setArtists((artistData ?? []).map((a: any) => ({
      id: a.id, name: a.name, role: a.role,
      teams: Array.isArray(a.teams) ? (a.teams[0] ?? null) : (a.teams ?? null),
    })))
    setRooms(roomData ?? [])
    setLoading(false)
  }

  async function handleStatusChange(id: string, status: string) {
    await supabase.from('productions').update({ status }).eq('id', id)
    setProductions(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  // Filtered + selected
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return productions
    return productions.filter(p => p.status === statusFilter)
  }, [productions, statusFilter])

  const selectedProd = productions.find(p => p.id === selectedId) ?? null

  // Status counts for filter pills
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: productions.length }
    for (const p of productions) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [productions])

  return (
    <>
      {/* Edit modal */}
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

      <div className="flex gap-0 -m-8 h-[calc(100vh-0px)] overflow-hidden">

        {/* ── Left: list ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-8 py-5 shrink-0 bg-white" style={{ borderBottom: '1px solid #e4ddd4' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>{t.productions.title}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>{productions.length} tytułów</p>
            </div>
            <button
              onClick={() => setModal(null)}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ background: '#c8102e', color: '#fff' }}
              onMouseOver={e => (e.currentTarget.style.background = '#9e0c24')}
              onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
            >
              + Nowa produkcja
            </button>
          </div>

          {/* Status filter */}
          <div className="px-8 py-3 shrink-0 flex items-center gap-1.5 overflow-x-auto" style={{ borderBottom: '1px solid #e4ddd4', background: '#faf8f5' }}>
            {[{ key: 'all', label: 'Wszystkie' }, ...STATUS_OPTIONS.map(s => ({ key: s, label: s }))].map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === f.key
                    ? f.key === 'all'
                      ? ''
                      : (STATUS_STYLE[f.key]?.badge ?? 'bg-gray-100 text-gray-700')
                    : 'hover:text-gray-700 hover:bg-gray-100'
                }`}
                style={
                  statusFilter === f.key && f.key === 'all'
                    ? { background: '#1a1410', color: '#fff' }
                    : statusFilter !== f.key
                    ? { color: '#7a7068' }
                    : undefined
                }
              >
                {f.label}
                {counts[f.key] != null && (
                  <span className="ml-1.5 opacity-60">{counts[f.key]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Ładowanie…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <div className="flex justify-center mb-4"><IconTheatre size={48} className="text-gray-500 mx-auto" /></div>
                <p className="text-lg font-medium">
                  {statusFilter === 'all' ? t.productions.empty : `Brak produkcji: ${statusFilter}`}
                </p>
                {statusFilter === 'all' && <p className="text-sm mt-1">{t.productions.emptyHint}</p>}
              </div>
            ) : (
              <div className={`grid gap-4 ${selectedProd ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                {filtered.map(p => (
                  <ProductionCard
                    key={p.id}
                    prod={p}
                    isSelected={selectedId === p.id}
                    onClick={() => setSelectedId(prev => prev === p.id ? null : p.id)}
                    onEdit={() => setModal(p)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: detail panel ──────────────────────────────────────────── */}
        <div className={`shrink-0 border-l border-gray-200 bg-white transition-all duration-200 overflow-hidden ${selectedProd ? 'w-80' : 'w-0'}`}>
          {selectedProd && (
            <DetailPanel
              prod={selectedProd}
              onEdit={() => setModal(selectedProd)}
              onClose={() => setSelectedId(null)}
              onStatusChange={s => handleStatusChange(selectedProd.id, s)}
            />
          )}
        </div>

      </div>
    </>
  )
}
