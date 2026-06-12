'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheatre } from '@/lib/theatre-context'
import { supabase } from '@/lib/supabase'
import ConflictResolutionModal from '@/components/ConflictResolutionModal'
import {
  detectProposalConflicts,
  conflictedTitles,
  conflictArtistIds,
  type ProposalConflict,
} from '@/lib/conflicts'
import { sortByLastName } from '@/lib/names'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProposalEvent {
  date: string
  production_title: string
  room_name: string | null
  start_time: string
  end_time: string
}

interface TaggedEvent extends ProposalEvent {
  _theatre: string
}

interface Proposal {
  id: string
  month: string
  label: string
  status: 'draft' | 'approved' | 'rejected'
  proposal_data: ProposalEvent[]
  reasoning: string
  stats: { total: number; by_production: Record<string, number> }
  approved_at: string | null
}

interface Theatre { id: string; name: string }

// Production info for the cast popup + conflict detection
interface ProdInfo {
  title:       string
  director:    string | null
  cast:        string[]        // actor names
  castIds:     string[]        // actor IDs (for conflict detection)
  poster_url:  string | null
  perf_count:  number          // total historical events
  is_favourite: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_PL: Record<string, string> = {
  '01': 'Styczeń',  '02': 'Luty',       '03': 'Marzec',     '04': 'Kwiecień',
  '05': 'Maj',      '06': 'Czerwiec',   '07': 'Lipiec',     '08': 'Sierpień',
  '09': 'Wrzesień', '10': 'Październik','11': 'Listopad',   '12': 'Grudzień',
}
const DAY_PL = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

// Accent colours per theatre name
const THEATRE_ACCENT: Record<string, string> = {
  'Teatr Polonia': '#c8102e',
  'Och-Teatr':     '#d4880a',
}
function theatreAccent(name: string | null) {
  if (!name) return '#1a1410'
  return THEATRE_ACCENT[name] ?? '#1a1410'
}


// ── Theatre + room tagging ────────────────────────────────────────────────────
// Assigns every event a _theatre and normalised room_name.
// Cycle: TP/Duża → TP/Mała → Och/Duża → Och/Mała (repeating).
// If room_name already encodes theatre info (contains "och" / "polonia") the
// existing data is respected instead.

const THEATRE_CYCLE = ['Teatr Polonia', 'Teatr Polonia', 'Och-Teatr',    'Och-Teatr']
const ROOM_CYCLE    = ['Duża scena',    'Mała scena',    'Duża scena',    'Mała scena']

function tagEvents(events: ProposalEvent[], allTheatreNames: string[]): TaggedEvent[] {
  // Sort chronologically for deterministic assignment
  const sorted = [...events].sort((a, b) =>
    `${a.date}${a.start_time ?? ''}`.localeCompare(`${b.date}${b.start_time ?? ''}`)
  )

  // Check if raw data already carries theatre hints in room_name
  const hasHints = sorted.some(e => {
    const r = (e.room_name ?? '').toLowerCase()
    return r.includes('och') || r.includes('polonia')
  })

  if (hasHints) {
    return sorted.map(e => {
      const r    = (e.room_name ?? '').toLowerCase()
      const th   = r.includes('och') ? 'Och-Teatr' : 'Teatr Polonia'
      const room = (r.includes('mała') || r.includes('mala')) ? 'Mała scena' : 'Duża scena'
      return { ...e, room_name: room, _theatre: th }
    })
  }

  // Use the known theatre names if available (from Supabase), fall back to defaults
  const tp  = allTheatreNames.find(n => n.toLowerCase().includes('polonia')) ?? 'Teatr Polonia'
  const och = allTheatreNames.find(n => n.toLowerCase().includes('och'))     ?? 'Och-Teatr'
  const tCycle = [tp, tp, och, och]

  return sorted.map((e, i) => ({
    ...e,
    room_name: ROOM_CYCLE[i % 4],
    _theatre:  tCycle[i % 4],
  }))
}

// ── Cast popup ────────────────────────────────────────────────────────────────

const PLACEHOLDER_POSTER = 'https://placehold.co/160x220/1a1410/e4ddd4?text=Plakat'

interface PopupState {
  info:              ProdInfo
  x:                 number
  y:                 number
  accentColor:       string
  conflictArtistIds: Set<string>
}

function CastPopup({ popup, onClose }: { popup: PopupState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  // Clamp so popup stays within viewport
  const vpW = typeof window !== 'undefined' ? window.innerWidth  : 1200
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 900
  const isMobile = vpW < 768
  const W   = isMobile ? Math.min(340, vpW - 32) : 340
  const H   = 220 // rough estimate
  const left = isMobile ? (vpW - W) / 2 : Math.min(popup.x, vpW - W - 16)
  const top  = isMobile
    ? Math.max(16, (vpH - H) / 2 - 40)
    : (popup.y + H > vpH ? popup.y - H - 12 : popup.y + 8)

  return (
    <>
    {/* Mobile: tap outside to close */}
    {isMobile && (
      <div className="fixed inset-0 z-[9998] bg-black/30" onClick={onClose} />
    )}
    <div
      ref={ref}
      onMouseLeave={isMobile ? undefined : onClose}
      className="fixed z-[9999] rounded-2xl shadow-2xl overflow-hidden"
      style={{
        left, top,
        width: W,
        background: '#fff',
        border: '1px solid #e4ddd4',
        pointerEvents: 'auto',
      }}
    >
      <div className="flex gap-3 p-4">
        {/* Text */}
        <div className="flex-1 min-w-0">
          <div
            className="font-bold text-sm leading-tight mb-2"
            style={{
              fontFamily: 'var(--font-playfair), Georgia, serif',
              color: '#1a1410',
              fontSize: '0.9rem',
            }}
          >
            {popup.info.title.toUpperCase()}
          </div>

          {popup.info.director && (
            <div className="text-xs mb-1.5" style={{ color: '#3e3830' }}>
              <span className="font-bold">Reżyseria</span>{' '}
              <span style={{ color: '#7a7068' }}>{popup.info.director}</span>
            </div>
          )}

          {popup.info.cast.length > 0 && (
            <div className="text-xs mb-2" style={{ color: '#3e3830' }}>
              <span className="font-bold">Występują:</span>{' '}
              <span>
                {popup.info.cast.slice(0, 6).map((name, ni) => {
                  const id = popup.info.castIds[ni]
                  const isConflict = id && popup.conflictArtistIds.has(id)
                  return (
                    <span key={ni}>
                      {ni > 0 && <span style={{ color: '#cec5b8' }}>, </span>}
                      <span
                        style={{
                          color:      isConflict ? '#c8102e' : '#7a7068',
                          fontWeight: isConflict ? 700 : 400,
                        }}
                        title={isConflict ? 'Konflikt obsady – ten aktor gra jednocześnie w innym spektaklu' : undefined}
                      >
                        {isConflict && '⚠ '}{name}
                      </span>
                    </span>
                  )
                })}
                {popup.info.cast.length > 6
                  ? <span style={{ color: '#a89e92' }}> i {popup.info.cast.length - 6} innych</span>
                  : null}
              </span>
            </div>
          )}

          {popup.info.perf_count > 0 && (
            <div className="text-xs mt-auto" style={{ color: '#a89e92' }}>
              Grany po raz:{' '}
              <span className="font-bold" style={{ color: '#3e3830' }}>{popup.info.perf_count}</span>
            </div>
          )}
        </div>

        {/* Poster */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={popup.info.poster_url || PLACEHOLDER_POSTER}
          alt={popup.info.title}
          className="rounded-lg object-cover shrink-0"
          style={{ width: 72, height: 100 }}
          onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_POSTER }}
        />
      </div>

      {/* Bottom accent bar */}
      <div className="h-0.5 w-full" style={{ background: popup.accentColor }} />
    </div>
    </>
  )
}

// ── Single show entry (shared by desktop table cell and mobile card) ──────────

const HOVER_CAPABLE = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

function EventBlock({ e, room, prodMap, propConflicts, conflictTitleSet, onConflictClick, onOpenPopup, onClosePopup }: {
  e:                TaggedEvent
  room:             string
  prodMap:          Map<string, ProdInfo>
  propConflicts:    ProposalConflict[]
  conflictTitleSet: Set<string>
  onConflictClick:  (params: {
    artistId: string; artistName: string; conflictDate: string;
    conflictStart?: string; conflictEnd?: string; productions: string[]
  }) => void
  onOpenPopup:  (ev: React.MouseEvent, title: string) => void
  onClosePopup: (title: string) => void
}) {
  const titleConflicts = propConflicts.filter(c =>
    c.productions.some(p => p.title === e.production_title)
  )
  const artistMap = new Map<string, string>()
  for (const c of titleConflicts) {
    c.artistIds.forEach((id, i) => {
      if (!artistMap.has(id)) artistMap.set(id, c.artistNames[i] ?? id)
    })
  }
  const hasConflict = conflictTitleSet.has(e.production_title)

  return (
    <div>
      {/* Time + room label */}
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1"
           style={{ color: '#a89e92' }}>
        {e.start_time?.slice(0, 5) || '—'} | {room.toUpperCase()}
      </div>

      {/* Production title + conflict badge */}
      <div className="flex items-start gap-1.5 mb-2 flex-wrap">
        <div
          className="text-sm font-bold leading-snug flex items-center gap-1"
          style={{
            fontFamily: 'var(--font-playfair), Georgia, serif',
            color: '#3a3a3a',
          }}
        >
          {prodMap.get(e.production_title)?.is_favourite && (
            <svg viewBox="0 0 24 24" width="13" height="13" style={{ flexShrink: 0, marginTop: '1px' }} fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          )}
          {e.production_title}
        </div>
        {artistMap.size > 0 && (
          <span
            className="shrink-0 mt-0.5 flex items-center flex-wrap gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-snug"
            style={{ background: '#fff0f0', color: '#c8102e', border: '1px solid #fecaca' }}
          >
            ⚠{' '}
            {[...artistMap.entries()].map(([id, name], ni) => {
              const conflict = titleConflicts.find(c => c.artistIds.includes(id))
              const productions = conflict?.productions.map(p => p.title) ?? []
              const conflictDate = conflict?.date ?? e.date
              const conflictStart = conflict?.productions[0]?.start_time
              const conflictEnd = e.end_time?.slice(0, 5)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onConflictClick({
                    artistId: id,
                    artistName: name,
                    conflictDate,
                    conflictStart,
                    conflictEnd,
                    productions,
                  })}
                  className="underline underline-offset-2 hover:opacity-70 transition-opacity cursor-pointer py-0.5"
                  style={{ color: '#c8102e' }}
                >
                  {ni > 0 && <span style={{ color: '#fca5a5', textDecoration: 'none', marginRight: '2px' }}>, </span>}
                  {name}
                </button>
              )
            })}
          </span>
        )}
      </div>

      {/* OBSADA button — hover on desktop, tap on touch devices */}
      <button
        onClick={(ev) => onOpenPopup(ev, e.production_title)}
        onMouseEnter={(ev) => { if (HOVER_CAPABLE()) onOpenPopup(ev, e.production_title) }}
        onMouseLeave={() => {
          if (HOVER_CAPABLE()) {
            setTimeout(() => onClosePopup(e.production_title), 120)
          }
        }}
        className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded transition-colors"
        style={{
          border: hasConflict ? '1px solid #c8102e' : '1px solid #b0aba3',
          color:  hasConflict ? '#c8102e' : '#6b6660',
          background: 'transparent',
          letterSpacing: '0.1em',
        }}
      >
        obsada
      </button>
    </div>
  )
}

// ── Vertical month table ───────────────────────────────────────────────────────

function MonthTable({ month, events, accentColor, prodMap, propConflicts, onConflictClick }: {
  month:         string
  events:        TaggedEvent[]
  accentColor:   string
  prodMap:       Map<string, ProdInfo>
  propConflicts: ProposalConflict[]
  onConflictClick: (params: {
    artistId: string; artistName: string; conflictDate: string;
    conflictStart?: string; conflictEnd?: string; productions: string[]
  }) => void
}) {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()

  // Popup state (position fixed → no overflow clipping)
  const [popup, setPopup] = useState<PopupState | null>(null)

  // Pre-compute conflict title set for fast lookup
  const conflictTitleSet = conflictedTitles(propConflicts)

  // Unique rooms → columns (sorted)
  const rooms = [...new Set(
    events.map(e => e.room_name?.trim() || 'Scena')
  )].sort()

  // Unique titles for color mapping

  // Build lookup: dateStr → room → events[]
  const byDateRoom: Record<string, Record<string, TaggedEvent[]>> = {}
  for (const e of events) {
    const room = e.room_name?.trim() || 'Scena'
    byDateRoom[e.date] ??= {}
    byDateRoom[e.date][room] ??= []
    byDateRoom[e.date][room].push(e)
  }

  // Days that have at least one show
  const activeDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(day => !!byDateRoom[`${month}-${String(day).padStart(2, '0')}`])

  if (activeDays.length === 0) {
    return (
      <div className="py-16 text-center text-sm" style={{ color: '#a89e92' }}>
        Brak spektakli w tym miesiącu
      </div>
    )
  }

  function openPopup(e: React.MouseEvent, title: string) {
    const info = prodMap.get(title)
    if (!info) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopup({
      info,
      x:                 rect.left,
      y:                 rect.bottom + 6,
      accentColor,
      conflictArtistIds: conflictArtistIds(propConflicts, title),
    })
  }

  function closePopup(title: string) {
    setPopup(p => (p?.info.title === title ? null : p))
  }

  return (
    <>
      {popup && <CastPopup popup={popup} onClose={() => setPopup(null)} />}

      {/* ── Mobile: day cards ── */}
      <div className="md:hidden">
        {activeDays.map(day => {
          const dateStr = `${month}-${String(day).padStart(2, '0')}`
          const dow = new Date(dateStr + 'T12:00:00').getDay()
          const isWeekend = dow === 0 || dow === 6
          const dayEvents: Array<{ e: TaggedEvent; room: string }> = rooms
            .flatMap(room => (byDateRoom[dateStr]?.[room] ?? []).map(e => ({ e, room })))
            .sort((a, b) => (a.e.start_time || '').localeCompare(b.e.start_time || ''))

          return (
            <div key={day} className="border-b" style={{ borderColor: '#e4ddd4' }}>
              {/* Day header */}
              <div
                className="flex items-baseline gap-2 px-4 py-2"
                style={{ background: isWeekend ? '#f7efe7' : '#faf8f5' }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-playfair), Georgia, serif',
                    fontSize: '1.5rem', fontWeight: 700, lineHeight: 1,
                    color: isWeekend ? '#7a2e1a' : '#1a1410',
                  }}
                >
                  {day}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: isWeekend ? '#b84a28' : '#a89e92' }}
                >
                  {DAY_PL[dow]}
                </span>
              </div>

              {/* Shows */}
              <div className="px-4 py-3 space-y-3" style={{ background: '#fff' }}>
                {dayEvents.map(({ e, room }, ei) => (
                  <div
                    key={ei}
                    className={ei > 0 ? 'pt-3' : ''}
                    style={ei > 0 ? { borderTop: '1px dashed #e4ddd4' } : {}}
                  >
                    <EventBlock
                      e={e} room={room} prodMap={prodMap}
                      propConflicts={propConflicts} conflictTitleSet={conflictTitleSet}
                      onConflictClick={onConflictClick}
                      onOpenPopup={openPopup} onClosePopup={closePopup}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: table ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>

          {/* ── Column widths ── */}
          <colgroup>
            <col style={{ width: '110px' }} />
            {rooms.map(r => <col key={r} />)}
          </colgroup>

          {/* ── Header ── */}
          <thead>
            <tr>
              <th
                className="text-left px-6 py-4 text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ background: '#1a1410', color: '#7a7068', borderRight: '1px solid #2e2820' }}
              >
                Data
              </th>
              {rooms.map((room, ri) => (
                <th
                  key={room}
                  className="text-left px-6 py-4"
                  style={{
                    background: '#1a1410',
                    borderRight: ri < rooms.length - 1 ? '1px solid #2e2820' : undefined,
                  }}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-[0.18em]"
                        style={{ color: '#7a7068' }}>
                    {room}
                  </span>
                  <span
                    className="block mt-0.5 h-0.5 w-8 rounded"
                    style={{ background: accentColor, opacity: 0.6 }}
                  />
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Rows ── */}
          <tbody>
            {activeDays.map((day) => {
              const dateStr = `${month}-${String(day).padStart(2, '0')}`
              const dow = new Date(dateStr + 'T12:00:00').getDay()
              const isWeekend = dow === 0 || dow === 6

              return (
                <tr key={day} style={{ borderBottom: '2px solid #e4ddd4' }}>

                  {/* Date cell */}
                  <td
                    className="px-6 py-5 align-top"
                    style={{ background: '#faf8f5', borderRight: '1px solid #e4ddd4', verticalAlign: 'top' }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-playfair), Georgia, serif',
                        fontSize: '2.4rem', fontWeight: 700, lineHeight: 1,
                        color: isWeekend ? '#7a2e1a' : '#1a1410',
                      }}
                    >
                      {day}
                    </div>
                    <div
                      className="mt-1 text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: isWeekend ? '#b84a28' : '#a89e92' }}
                    >
                      {DAY_PL[dow]}
                    </div>
                  </td>

                  {/* Room cells */}
                  {rooms.map((room, ri) => {
                    const roomEvents: TaggedEvent[] = (byDateRoom[dateStr]?.[room] ?? [])
                      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

                    return (
                      <td
                        key={room}
                        className="px-6 py-5 align-top"
                        style={{
                          background: '#fff',
                          borderRight: ri < rooms.length - 1 ? '1px solid #e4ddd4' : undefined,
                          verticalAlign: 'top',
                        }}
                      >
                        {roomEvents.length === 0 ? (
                          <span style={{ color: '#e4ddd4', fontSize: '1.2rem' }}>—</span>
                        ) : (
                          roomEvents.map((e, ei) => (
                            <div
                              key={ei}
                              className={ei > 0 ? 'mt-4 pt-4' : ''}
                              style={ei > 0 ? { borderTop: '1px dashed #e4ddd4' } : {}}
                            >
                              <EventBlock
                                e={e} room={room} prodMap={prodMap}
                                propConflicts={propConflicts} conflictTitleSet={conflictTitleSet}
                                onConflictClick={onConflictClick}
                                onOpenPopup={openPopup} onClosePopup={closePopup}
                              />
                            </div>
                          ))
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RepertuarPage() {
  const { selectedTheatreId } = useTheatre()

  const [proposals,   setProposals]   = useState<Proposal[]>([])
  const [theatres,    setTheatres]    = useState<Theatre[]>([])
  const [prodMap,     setProdMap]     = useState<Map<string, ProdInfo>>(new Map())
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [activeMonth, setActiveMonth] = useState<string | null>(null)

  // Conflict resolution modal
  const [conflictModal, setConflictModal] = useState<{
    artistId:    string
    artistName:  string
    conflictDate: string
    conflictStart?: string
    conflictEnd?:   string
    productions: string[]
  } | null>(null)

  // Resolve selected theatre name from id
  const selectedTheatre = theatres.find(t => t.id === selectedTheatreId) ?? null
  const accent = theatreAccent(selectedTheatre?.name ?? null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [propRes, thRes, prodRes, evCountRes] = await Promise.all([
          fetch('/api/planning/generate?status=approved'),
          supabase.from('theatres').select('id, name').order('name'),
          // Fetch productions with cast (artist_productions join)
          supabase.from('productions').select(
            'id, title, director, poster_url, is_favourite, artist_productions(artists(id, name))'
          ),
          // Count past events per production for "Grany po raz"
          supabase.from('events').select('production_id').not('production_id', 'is', null),
        ])

        const json  = await propRes.json()
        if (json.error) throw new Error(json.error)

        const props: Proposal[] = json.proposals ?? []
        const ths: Theatre[]    = thRes.data ?? []

        // Build performance count map
        const perfCounts: Record<string, number> = {}
        for (const ev of evCountRes.data ?? []) {
          const pid = (ev as any).production_id as string
          perfCounts[pid] = (perfCounts[pid] ?? 0) + 1
        }

        // Build prodMap: title → ProdInfo (including castIds for conflict detection)
        const map = new Map<string, ProdInfo>()
        for (const p of prodRes.data ?? []) {
          const castEntries: Array<{ id: string; name: string }> = sortByLastName(
            (p.artist_productions ?? [])
              .map((ap: any) => {
                const a = Array.isArray(ap.artists) ? ap.artists[0] : ap.artists
                return a ? { id: a.id as string, name: a.name as string } : null
              })
              .filter(Boolean) as Array<{ id: string; name: string }>
          )

          map.set(p.title, {
            title:        p.title,
            director:     p.director ?? null,
            cast:         castEntries.map(c => c.name),
            castIds:      castEntries.map(c => c.id),
            poster_url:   (p as any).poster_url ?? null,
            perf_count:   perfCounts[p.id] ?? 0,
            is_favourite: (p as any).is_favourite ?? false,
          })
        }

        setProposals(props)
        setTheatres(ths)
        setProdMap(map)

        // Auto-select nearest upcoming (or first) month
        const now    = new Date().toISOString().slice(0, 7)
        const sorted = [...props].sort((a, b) => a.month.localeCompare(b.month))
        const target = sorted.find(p => p.month >= now) ?? sorted[0]
        setActiveMonth(target?.month ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Błąd ładowania')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Deduplicate – keep first proposal per month, sorted ascending
  const months: Proposal[] = Object.values(
    proposals.reduce<Record<string, Proposal>>((acc, p) => {
      if (!acc[p.month]) acc[p.month] = p
      return acc
    }, {})
  ).sort((a, b) => a.month.localeCompare(b.month))

  const active = months.find(p => p.month === activeMonth)

  // Tag all events with theatre + room, then optionally filter
  const theatreNames = theatres.map(t => t.name)
  const allTagged: TaggedEvent[] = active
    ? tagEvents(
        [...(active.proposal_data ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
        theatreNames,
      )
    : []

  const visibleEvents: TaggedEvent[] = selectedTheatre
    ? allTagged.filter(e => e._theatre === selectedTheatre.name)
    : allTagged

  // Build maps needed for conflict detection
  const productionCastMap = new Map<string, string[]>(
    [...prodMap.entries()].map(([title, info]) => [title, info.castIds])
  )
  const artistNamesMap = new Map<string, string>()
  for (const info of prodMap.values()) {
    info.castIds.forEach((id, i) => { if (info.cast[i]) artistNamesMap.set(id, info.cast[i]) })
  }

  // Detect conflicts across ALL tagged events for the month (not just filtered by theatre)
  const propConflicts = allTagged.length > 0
    ? detectProposalConflicts(allTagged, productionCastMap, artistNamesMap)
    : []

  // Stats derived from visible events
  const byProdVisible = visibleEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.production_title] = (acc[e.production_title] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      {/* Conflict resolution modal */}
      {conflictModal && (
        <ConflictResolutionModal
          artistId={conflictModal.artistId}
          artistName={conflictModal.artistName}
          conflictDate={conflictModal.conflictDate}
          conflictStart={conflictModal.conflictStart}
          conflictEnd={conflictModal.conflictEnd}
          productions={conflictModal.productions}
          onClose={() => setConflictModal(null)}
        />
      )}

      {/* ── Page header ── */}
      <div
        className="flex items-center justify-between gap-3 flex-wrap px-4 py-4 -mx-4 -mt-4 md:px-8 md:py-5 md:-mx-8 md:-mt-8"
        style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: '1.75rem', fontWeight: 700, color: '#1a1410',
              letterSpacing: '-0.015em', lineHeight: 1.2,
            }}
          >
            Repertuar
            {selectedTheatre && (
              <span
                className="ml-3 text-base font-normal"
                style={{ color: accent }}
              >
                — {selectedTheatre.name}
              </span>
            )}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>
            {selectedTheatre
              ? `Zatwierdzone miesiące · ${selectedTheatre.name}`
              : 'Zatwierdzone miesiące · wszystkie teatry'}
          </p>
        </div>
        <Link
          href="/planning"
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-colors shrink-0"
          style={{ background: '#fff', border: '1px solid #e4ddd4', color: '#7a7068' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="9" r="2" fill="currentColor" stroke="none"/>
          </svg>
          Planowanie
        </Link>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && (
        <div className="flex items-center justify-center h-48 text-sm" style={{ color: '#cec5b8' }}>
          Ładowanie…
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && months.length === 0 && (
        <div className="flex flex-col items-center justify-center h-56 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"
               className="mb-3" style={{ color: '#e4ddd4' }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <p className="text-sm font-semibold" style={{ color: '#a89e92' }}>Brak zatwierdzonych miesięcy</p>
          <p className="text-xs mt-1" style={{ color: '#b8b0a4' }}>
            Przejdź do{' '}
            <Link href="/planning" className="underline">Planowania</Link>
            , wygeneruj i zatwierdź repertuar
          </p>
        </div>
      )}

      {/* ── Month navigation tabs ── */}
      {!loading && months.length > 0 && (
        <div
          className="-mx-4 px-4 md:-mx-8 md:px-8"
          style={{ background: '#faf8f5', borderBottom: '1px solid #e4ddd4' }}
        >
          <div className="flex items-end overflow-x-auto gap-0" style={{ scrollbarWidth: 'none' }}>
            {months.map(p => {
              const [y, mo] = p.month.split('-')
              const name    = MONTH_PL[mo] ?? mo
              const isActive = p.month === activeMonth
              return (
                <button
                  key={p.month}
                  onClick={() => setActiveMonth(p.month)}
                  className="relative shrink-0 px-4 md:px-6 py-3.5 md:py-4 whitespace-nowrap transition-all"
                  style={{
                    color:        isActive ? '#1a1410' : '#a89e92',
                    background:   'transparent',
                    border:       'none',
                    borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
                    marginBottom: '-1px',
                    fontSize:     isActive ? '0.8rem' : '0.75rem',
                    fontWeight:   isActive ? 700 : 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {name}
                  <span
                    className="ml-1.5 text-[10px] font-normal"
                    style={{ color: isActive ? '#7a7068' : '#cec5b8' }}
                  >
                    {y}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Stats bar ── */}
      {!loading && active && (
        <div
          className="-mx-4 px-4 md:-mx-8 md:px-8 py-3 flex items-center gap-4 md:gap-6 flex-wrap"
          style={{ background: '#faf8f5', borderBottom: '1px solid #e4ddd4' }}
        >
          <StatBit icon="🎬" value={Object.keys(byProdVisible).length} label="tytułów" />
          <StatBit icon="🎭" value={visibleEvents.length} label="spektakli" />
          {propConflicts.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                 style={{ background: '#fff0f0', border: '1px solid #fecaca' }}>
              <span className="text-sm">⚠</span>
              <span className="text-sm font-bold" style={{ color: '#c8102e' }}>{propConflicts.length}</span>
              <span className="text-xs font-medium" style={{ color: '#c8102e' }}>
                {propConflicts.length === 1 ? 'konflikt obsady' : 'konflikty obsady'}
              </span>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(byProdVisible)
              .sort((a, b) => b[1] - a[1])
              .map(([title, n]) => (
                <span
                  key={title}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                  style={{ background: '#e8e0d6', color: '#5a524a' }}
                >
                  <b>{n}×</b>{' '}
                  {title.length > 24 ? title.slice(0, 23) + '…' : title}
                </span>
              ))}
          </div>
          {active.approved_at && (
            <span className="ml-auto text-[11px] shrink-0" style={{ color: '#cec5b8' }}>
              Zatwierdzono{' '}
              {new Date(active.approved_at).toLocaleDateString('pl-PL', {
                day: 'numeric', month: 'long',
              })}
            </span>
          )}
        </div>
      )}

      {/* ── Vertical table ── */}
      {!loading && active && (
        <div className="-mx-4 md:-mx-8">
          <MonthTable
            month={active.month}
            events={visibleEvents}
            accentColor={accent}
            prodMap={prodMap}
            propConflicts={propConflicts}
            onConflictClick={setConflictModal}
          />
        </div>
      )}

    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

function StatBit({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{icon}</span>
      <span className="text-sm font-bold" style={{ color: '#3e3830' }}>{value}</span>
      <span className="text-xs" style={{ color: '#a89e92' }}>{label}</span>
    </div>
  )
}
