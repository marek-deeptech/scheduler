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
const DOW = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd']

function monthLabel(month: string) {
  const [y, m] = month.split('-')
  return { name: MONTH_PL[m] ?? m, year: y }
}

// ── Full calendar ─────────────────────────────────────────────────────────────

function MonthCalendar({ month, events }: { month: string; events: ProposalEvent[] }) {
  const [y, m]      = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const firstDow    = new Date(y, m - 1, 1).getDay()
  const startPad    = firstDow === 0 ? 6 : firstDow - 1

  // Build lookup: date → events
  const byDate: Record<string, ProposalEvent[]> = {}
  for (const e of events) {
    byDate[e.date] ??= []
    byDate[e.date].push(e)
  }

  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {DOW.map(d => (
          <div key={d} className="text-[9px] font-bold uppercase tracking-widest text-center pb-1.5"
            style={{ color: d === 'Sb' || d === 'Nd' ? '#a89e92' : '#cec5b8' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px" style={{ background: '#e4ddd4' }}>
        {cells.map((day, i) => {
          if (day === null) return (
            <div key={i} className="min-h-[72px]" style={{ background: '#fff' }} />
          )

          const dateStr   = `${month}-${String(day).padStart(2, '0')}`
          const dow       = new Date(dateStr + 'T12:00:00').getDay()
          const isWeekend = dow === 0 || dow === 6
          const dayEvents = byDate[dateStr] ?? []
          const hasShow   = dayEvents.length > 0

          // Unique production titles
          const titles = [...new Set(dayEvents.map(e => e.production_title))]

          return (
            <div
              key={i}
              className="min-h-[72px] p-1.5 flex flex-col gap-1 select-none"
              style={{
                background: '#fff',
              }}
            >
              {/* Day number */}
              <span className="text-[11px] font-bold leading-none" style={{
                color: hasShow
                  ? (isWeekend ? '#1a1410' : '#3e3830')
                  : (isWeekend ? '#cec5b8' : '#e4ddd4')
              }}>
                {day}
              </span>

              {/* Show pills */}
              {titles.map((title, ti) => (
                <span
                  key={ti}
                  title={title}
                  className="block text-[9px] font-semibold leading-tight px-1 py-0.5 rounded truncate"
                  style={{
                    background: isWeekend ? '#1a1410' : '#e8e0d6',
                    color:      isWeekend ? '#f5ede0' : '#5a524a',
                  }}
                >
                  {title.length > 18 ? title.slice(0, 17) + '…' : title}
                </span>
              ))}

              {/* Room count if >1 show */}
              {dayEvents.length > 1 && (
                <span className="text-[8px] leading-none mt-auto" style={{ color: '#a89e92' }}>
                  {dayEvents.length} sale
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RepertuarPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const r    = await fetch('/api/planning/generate?status=approved')
        const json = await r.json()
        if (json.error) throw new Error(json.error)
        setProposals(json.proposals ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Błąd ładowania')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const months: Proposal[] = Object.values(
    (proposals as Proposal[]).reduce<Record<string, Proposal>>((acc, p) => {
      if (!acc[p.month]) acc[p.month] = p
      return acc
    }, {})
  ).sort((a, b) => a.month.localeCompare(b.month))

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-8 py-5 -mx-8 -mt-8 mb-2"
        style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>Repertuar</h1>
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

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-48 text-sm" style={{ color: '#cec5b8' }}>Ładowanie…</div>
      )}

      {/* Empty */}
      {!loading && !error && months.length === 0 && (
        <div className="flex flex-col items-center justify-center h-56 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="mb-3" style={{ color: '#e4ddd4' }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <p className="text-sm font-semibold" style={{ color: '#a89e92' }}>Brak zatwierdzonych miesięcy</p>
          <p className="text-xs mt-1" style={{ color: '#b8b0a4' }}>
            Przejdź do <Link href="/planning" className="underline">Planowania</Link>, wygeneruj i zatwierdź repertuar
          </p>
        </div>
      )}

      {/* Month cards — full width, stacked */}
      {!loading && months.map(p => {
        const events  = [...(p.proposal_data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
        const byProd  = p.stats?.by_production ?? {}
        const { name, year } = monthLabel(p.month)

        // Count weekend shows vs weekday shows
        const weekendShows = events.filter(e => {
          const d = new Date(e.date + 'T12:00:00').getDay()
          return d === 0 || d === 6
        }).length
        const uniqueProds = Object.keys(byProd).length

        return (
          <div key={p.id} className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e4ddd4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

            {/* Card header */}
            <div className="px-6 py-5 flex items-start justify-between gap-6 flex-wrap" style={{ borderBottom: '1px solid #e4ddd4' }}>

              {/* Month title */}
              <div className="flex items-baseline gap-3">
                <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em', color: '#1a1410' }}>
                  {name}
                </h2>
                <span className="text-lg font-light" style={{ color: '#cec5b8' }}>{year}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ml-1"
                  style={{ background: '#e8f5e9', color: '#2e7d32' }}>
                  ✓ Zatwierdzony
                </span>
              </div>

              {/* Actions */}
              <Link
                href={`/planning/${p.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors shrink-0"
                style={{ background: '#f2ede6', color: '#5a524a', border: '1px solid #e4ddd4' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                Harmonogram
              </Link>
            </div>

            {/* Stats row */}
            <div className="px-6 py-3 flex items-center gap-6 flex-wrap" style={{ borderBottom: '1px solid #f2ede6', background: '#faf8f5' }}>
              <Stat icon="🎭" value={events.length} label="spektakli" />
              <Stat icon="📅" value={weekendShows} label="w weekendy" />
              <Stat icon="🎬" value={uniqueProds} label={uniqueProds === 1 ? 'produkcja' : 'produkcje'} />
              <div className="flex gap-2 flex-wrap ml-2">
                {Object.entries(byProd).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([title, n]) => (
                  <span key={title} className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                    style={{ background: '#e8e0d6', color: '#5a524a' }}>
                    <span className="font-bold">{n as number}×</span> {title.length > 22 ? title.slice(0, 21) + '…' : title}
                  </span>
                ))}
              </div>
              {p.approved_at && (
                <span className="ml-auto text-[11px] shrink-0" style={{ color: '#cec5b8' }}>
                  Zatwierdzono {new Date(p.approved_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}
                </span>
              )}
            </div>

            {/* Calendar */}
            <div className="p-6">
              <MonthCalendar month={p.month} events={events} />
            </div>

          </div>
        )
      })}

    </div>
  )
}

function Stat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{icon}</span>
      <span className="text-sm font-bold" style={{ color: '#3e3830' }}>{value}</span>
      <span className="text-xs" style={{ color: '#a89e92' }}>{label}</span>
    </div>
  )
}
