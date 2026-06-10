'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProposalEvent {
  date: string
  production_title: string
  room_name: string | null
  start_time: string
  end_time: string
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

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_PL: Record<string, string> = {
  '01': 'Styczeń',  '02': 'Luty',       '03': 'Marzec',     '04': 'Kwiecień',
  '05': 'Maj',      '06': 'Czerwiec',   '07': 'Lipiec',     '08': 'Sierpień',
  '09': 'Wrzesień', '10': 'Październik','11': 'Listopad',   '12': 'Grudzień',
}
const DAY_PL = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

// Warm palette cycling for production titles
const PROD_PALETTE = [
  '#7a1f1f', '#1f4d7a', '#1f6b3e', '#6b4a1a', '#4a1a6b', '#6b1a4a',
  '#8B3A1A', '#1A5C5C', '#3A5C1A', '#5C1A3A',
]

function prodColor(title: string, allTitles: string[]): string {
  const idx = allTitles.indexOf(title)
  return PROD_PALETTE[idx % PROD_PALETTE.length]
}

// ── Room normalisation ────────────────────────────────────────────────────────
// Ensures there are always two rooms: "Duża scena" and "Mała scena".
// If no "Mała scena" events exist, every other show (sorted by date+time) is
// reassigned to "Mała scena" and the remaining ones to "Duża scena".

function normalizeRooms(events: ProposalEvent[]): ProposalEvent[] {
  const hasSmall = events.some(e => {
    const r = (e.room_name ?? '').toLowerCase()
    return r.includes('mała') || r.includes('mala') || r.includes('small') || r.includes('kameralna')
  })
  if (hasSmall) return events

  // Sort chronologically so the split is deterministic
  const sorted = [...events].sort((a, b) =>
    `${a.date}${a.start_time ?? ''}`.localeCompare(`${b.date}${b.start_time ?? ''}`)
  )
  return sorted.map((e, i) => ({
    ...e,
    room_name: i % 2 === 0 ? 'Duża scena' : 'Mała scena',
  }))
}

// ── Vertical month table ───────────────────────────────────────────────────────

function MonthTable({ month, events }: { month: string; events: ProposalEvent[] }) {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()

  // Apply room normalisation
  const normEvents = normalizeRooms(events)

  // Unique rooms → columns (sorted)
  const rooms = [...new Set(
    normEvents.map(e => e.room_name?.trim() || 'Scena')
  )].sort()

  // Unique titles for color mapping
  const allTitles = [...new Set(normEvents.map(e => e.production_title))]

  // Build lookup: dateStr → room → events[]
  const byDateRoom: Record<string, Record<string, ProposalEvent[]>> = {}
  for (const e of normEvents) {
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

  return (
    <div className="overflow-x-auto">
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
                <span className="block text-xs font-bold uppercase tracking-[0.12em]"
                      style={{ color: '#e4ddd4' }}>
                  {room}
                </span>
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
                  const roomEvents = (byDateRoom[dateStr]?.[room] ?? [])
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
                            {/* Time badge */}
                            <div className="flex items-center gap-2 mb-1.5">
                              <span
                                className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded"
                                style={{ background: '#f2ede6', color: '#7a7068' }}
                              >
                                {e.start_time?.slice(0, 5) || '—'}
                              </span>
                              {e.end_time && (
                                <span className="text-[11px]" style={{ color: '#cec5b8' }}>
                                  → {e.end_time.slice(0, 5)}
                                </span>
                              )}
                            </div>
                            {/* Production title */}
                            <div
                              className="text-sm font-semibold leading-snug"
                              style={{
                                fontFamily: 'var(--font-playfair), Georgia, serif',
                                color: prodColor(e.production_title, allTitles),
                              }}
                            >
                              {e.production_title}
                            </div>
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
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RepertuarPage() {
  const [proposals,   setProposals]   = useState<Proposal[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [activeMonth, setActiveMonth] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const r    = await fetch('/api/planning/generate?status=approved')
        const json = await r.json()
        if (json.error) throw new Error(json.error)
        const props: Proposal[] = json.proposals ?? []
        setProposals(props)
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

  // Stats for active month
  const activeEvents = active
    ? [...(active.proposal_data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    : []
  const activeByProd = active?.stats?.by_production ?? {}
  const weekendShows = activeEvents.filter(e => {
    const d = new Date(e.date + 'T12:00:00').getDay()
    return d === 0 || d === 6
  }).length

  return (
    <div>

      {/* ── Page header ── */}
      <div
        className="flex items-center justify-between gap-4 px-8 py-5 -mx-8 -mt-8"
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
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Zatwierdzone miesiące</p>
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
          className="-mx-8 px-8"
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
                  className="relative shrink-0 px-6 py-4 whitespace-nowrap transition-all"
                  style={{
                    color:        isActive ? '#1a1410' : '#a89e92',
                    background:   'transparent',
                    border:       'none',
                    borderBottom: isActive ? '2px solid #1a1410' : '2px solid transparent',
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
          className="-mx-8 px-8 py-3 flex items-center gap-6 flex-wrap"
          style={{ background: '#faf8f5', borderBottom: '1px solid #e4ddd4' }}
        >
          <StatBit icon="🎭" value={activeEvents.length} label="spektakli" />
          <StatBit icon="📅" value={weekendShows}        label="w weekendy" />
          <StatBit icon="🎬" value={Object.keys(activeByProd).length} label="tytułów" />
          <div className="flex gap-2 flex-wrap">
            {Object.entries(activeByProd)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .map(([title, n]) => (
                <span
                  key={title}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                  style={{ background: '#e8e0d6', color: '#5a524a' }}
                >
                  <b>{n as number}×</b>{' '}
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
        <div className="-mx-8">
          <MonthTable month={active.month} events={activeEvents} />
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
