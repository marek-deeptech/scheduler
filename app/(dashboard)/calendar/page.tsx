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

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_PL: Record<string, string> = {
  '01': 'Styczeń',  '02': 'Luty',      '03': 'Marzec',    '04': 'Kwiecień',
  '05': 'Maj',      '06': 'Czerwiec',  '07': 'Lipiec',    '08': 'Sierpień',
  '09': 'Wrzesień', '10': 'Październik','11': 'Listopad',  '12': 'Grudzień',
}

function monthLabel(month: string) {
  const [y, m] = month.split('-')
  return `${MONTH_PL[m] ?? m} ${y}`
}

// ── Mini calendar ─────────────────────────────────────────────────────────────

function MiniCalendar({ month, events }: { month: string; events: ProposalEvent[] }) {
  const [y, m]      = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const firstDow    = new Date(y, m - 1, 1).getDay()          // 0=Sun
  const startPad    = firstDow === 0 ? 6 : firstDow - 1       // shift to Mon-start

  const prodByDate: Record<string, string[]> = {}
  for (const e of events) {
    prodByDate[e.date] ??= []
    if (!prodByDate[e.date].includes(e.production_title))
      prodByDate[e.date].push(e.production_title)
  }

  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Pn','Wt','Śr','Cz','Pt','Sb','Nd'].map(d => (
          <div key={d} className="text-[9px] font-semibold text-gray-400 uppercase text-center">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const dateStr   = `${month}-${String(day).padStart(2, '0')}`
          const dow       = new Date(dateStr + 'T12:00:00').getDay()
          const isWeekend = dow === 0 || dow === 6
          const prods     = prodByDate[dateStr] ?? []
          const hasShow   = prods.length > 0

          return (
            <div
              key={i}
              title={hasShow ? prods.join('\n') : undefined}
              className={`flex flex-col items-center justify-start pt-1 rounded-lg min-h-[44px] cursor-default select-none
                ${hasShow
                  ? 'bg-green-100'
                  : isWeekend
                    ? 'bg-gray-50'
                    : ''
                }`}
            >
              <span className={`text-[11px] font-bold leading-none
                ${hasShow ? 'text-green-800' : isWeekend ? 'text-gray-400' : 'text-gray-200'}`}>
                {day}
              </span>
              {hasShow && (
                <div className="flex flex-wrap justify-center gap-0.5 mt-1">
                  {prods.slice(0, 2).map((_, pi) => (
                    <span key={pi} className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  ))}
                </div>
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

  // Keep only the single approved proposal per month, sorted ascending
  const months: Proposal[] = Object.values(
    (proposals as Proposal[]).reduce<Record<string, Proposal>>((acc, p) => {
      if (!acc[p.month]) acc[p.month] = p
      return acc
    }, {})
  ).sort((a, b) => a.month.localeCompare(b.month))

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repertuar</h1>
          <p className="text-sm text-gray-500 mt-1">Zatwierdzone miesiące</p>
        </div>
        <Link
          href="/planning"
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 bg-white rounded-xl hover:bg-gray-100 transition-colors shrink-0"
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
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Ładowanie…</div>
      )}

      {/* Empty */}
      {!loading && !error && months.length === 0 && (
        <div className="flex flex-col items-center justify-center h-56 text-center">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-gray-200 mb-3">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <p className="text-sm font-semibold text-gray-500">Brak zatwierdzonych miesięcy</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs">
            Przejdź do{' '}
            <Link href="/planning" className="underline hover:text-gray-600">Planowania</Link>
            , wygeneruj propozycje i zatwierdź wybrany miesiąc
          </p>
        </div>
      )}

      {/* Month cards */}
      {!loading && months.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {months.map(p => {
            const events  = [...(p.proposal_data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
            const byProd  = p.stats?.by_production ?? {}

            return (
              <div key={p.id} className="bg-white rounded-2xl border border-green-200 overflow-hidden flex flex-col">

                {/* Month header */}
                <div className="px-5 py-4 border-b border-green-100 bg-green-50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">{monthLabel(p.month)}</h2>
                      <p className="text-[11px] text-green-700 mt-0.5">
                        ✓ Zatwierdzono
                        {p.approved_at
                          ? ` ${new Date(p.approved_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`
                          : ''}
                      </p>
                    </div>
                    <Link
                      href={`/planning/${p.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-700 border border-green-300 bg-white rounded-xl hover:bg-green-50 transition-colors shrink-0"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                      Podgląd
                    </Link>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <StatChip value={events.length} label="spektakli" />
                    {Object.entries(byProd).slice(0, 3).map(([title, n]) => (
                      <StatChip key={title} value={n as number} label={title.length > 14 ? title.slice(0, 14) + '…' : title} />
                    ))}
                  </div>
                </div>

                {/* Mini calendar */}
                <div className="px-5 py-4 flex-1">
                  <MiniCalendar month={p.month} events={events} />
                </div>

              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}

function StatChip({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white text-gray-600 border border-green-200">
      <span className="font-bold">{value}</span>
      <span>{label}</span>
    </span>
  )
}
