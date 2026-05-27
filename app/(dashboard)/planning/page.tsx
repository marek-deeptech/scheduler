'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProposalEvent {
  date: string
  production_id: string
  production_title: string
  room_id: string | null
  room_name: string | null
  start_time: string
  end_time: string
  type: string
}

interface ProposalStats {
  total: number
  conflicts: number
  by_production: Record<string, number>
}

interface Proposal {
  id: string
  month: string
  label: string
  status: 'draft' | 'approved' | 'rejected'
  proposal_data: ProposalEvent[]
  reasoning: string
  stats: ProposalStats
  created_at: string
  approved_at: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Propozycja',   cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Zatwierdzony', cls: 'bg-green-100  text-green-800'  },
  rejected: { label: 'Odrzucony',    cls: 'bg-gray-100   text-gray-500'   },
}

const DAY_PL = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

const MONTH_PL: Record<string, string> = {
  '01': 'styczeń', '02': 'luty', '03': 'marzec', '04': 'kwiecień',
  '05': 'maj',     '06': 'czerwiec', '07': 'lipiec', '08': 'sierpień',
  '09': 'wrzesień','10': 'październik','11': 'listopad','12': 'grudzień',
}

function getNextMonths(n: number) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) }
  })
}

function monthLabel(month: string) {
  const [y, m] = month.split('-')
  const name = MONTH_PL[m] ?? m
  return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`
}

type Tab = 'repertuar' | 'planowanie'

// ── Main page ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const [tab, setTab] = useState<Tab>('repertuar')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Repertuar</h1>
        <p className="text-sm text-gray-500 mt-1">Zatwierdzone miesiące i narzędzia planowania</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {(['repertuar', 'planowanie'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-[10px] transition-colors capitalize ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'repertuar' ? 'Repertuar' : 'Planowanie'}
          </button>
        ))}
      </div>

      {tab === 'repertuar' ? <RepertuarTab /> : <PlanowanieTab />}
    </div>
  )
}

// ── Repertuar tab ─────────────────────────────────────────────────────────────

function RepertuarTab() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const r = await fetch('/api/planning/generate?status=approved')
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

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Ładowanie…</div>
  if (error)   return <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-56 text-center">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-gray-200 mb-3">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        <p className="text-sm font-semibold text-gray-500">Brak zatwierdzonych miesięcy</p>
        <p className="text-xs text-gray-400 mt-1 max-w-xs">Przejdź do zakładki Planowanie, wygeneruj propozycje i zatwierdź wybrany miesiąc</p>
      </div>
    )
  }

  // Group by month, sorted ascending
  const byMonth: Record<string, Proposal> = {}
  for (const p of proposals) byMonth[p.month] = p
  const months = Object.keys(byMonth).sort()

  return (
    <div className="space-y-6">
      {months.map(month => {
        const p      = byMonth[month]
        const events = [...(p.proposal_data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
        const byProd = p.stats?.by_production ?? {}

        return (
          <div key={month} className="bg-white rounded-2xl border border-green-200 overflow-hidden">

            {/* Month header */}
            <div className="px-6 py-4 border-b border-green-100 bg-green-50 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-gray-900">{monthLabel(month)}</h2>
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide bg-green-100 text-green-800">
                    Zatwierdzony
                  </span>
                </div>
                {p.reasoning && <p className="text-xs text-gray-500 mt-0.5">{p.reasoning}</p>}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Stats chips */}
                <div className="flex gap-1.5 flex-wrap">
                  <Chip value={events.length} label="spektakli" />
                  {Object.entries(byProd).slice(0, 4).map(([title, n]) => (
                    <Chip key={title} value={n as number} label={title.length > 14 ? title.slice(0, 14) + '…' : title} />
                  ))}
                </div>
                <Link
                  href={`/planning/${p.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 border border-green-300 bg-white rounded-xl hover:bg-green-50 transition-colors shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  Podgląd
                </Link>
              </div>
            </div>

            {/* Calendar grid — compact */}
            <div className="px-6 py-4">
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['Pn','Wt','Śr','Cz','Pt','Sb','Nd'].map(d => (
                  <div key={d} className="text-[9px] font-semibold text-gray-400 uppercase">{d}</div>
                ))}
              </div>
              <MiniCalendar month={month} events={events} />
            </div>

          </div>
        )
      })}
    </div>
  )
}

// ── Mini calendar grid ────────────────────────────────────────────────────────

function MiniCalendar({ month, events }: { month: string; events: ProposalEvent[] }) {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  // 1=Mon…7=Sun in ISO week; JS getDay() is 0=Sun…6=Sat
  const firstDow  = new Date(y, m - 1, 1).getDay()       // 0=Sun
  const startPad  = firstDow === 0 ? 6 : firstDow - 1    // pad to Mon-start

  const showDates = new Set(events.map(e => e.date))
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
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((day, i) => {
        if (day === null) return <div key={i} />
        const dateStr = `${month}-${String(day).padStart(2, '0')}`
        const dow     = new Date(dateStr + 'T12:00:00').getDay()
        const isWeekend = dow === 0 || dow === 6
        const hasShow   = showDates.has(dateStr)
        const prods     = prodByDate[dateStr] ?? []

        return (
          <div
            key={i}
            title={hasShow ? prods.join(', ') : undefined}
            className={`relative flex flex-col items-center justify-start pt-1 pb-1 rounded-lg min-h-[40px] text-center transition-colors
              ${hasShow
                ? 'bg-green-100 text-green-900'
                : isWeekend
                  ? 'bg-gray-50 text-gray-300'
                  : 'text-gray-200'
              }`}
          >
            <span className={`text-[11px] font-bold leading-none ${hasShow ? 'text-green-800' : ''}`}>{day}</span>
            {hasShow && (
              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                {prods.slice(0, 2).map((_, pi) => (
                  <span key={pi} className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Planowanie tab ────────────────────────────────────────────────────────────

function PlanowanieTab() {
  const months = getNextMonths(7)
  const [selectedMonth, setSelectedMonth] = useState(months[1].value)
  const [proposals,     setProposals]     = useState<Proposal[]>([])
  const [loading,       setLoading]       = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [constraints,   setConstraints]   = useState('')
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)

  useEffect(() => { loadProposals() }, [selectedMonth])   // eslint-disable-line

  async function loadProposals() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/planning/generate?month=${selectedMonth}`)
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setProposals(json.proposals ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania')
    } finally {
      setLoading(false)
    }
  }

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const r = await fetch('/api/planning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, constraints: constraints.trim() || undefined }),
      })
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setProposals(prev => [...(json.proposals ?? []), ...prev])
      setConstraints('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd generowania')
    } finally {
      setGenerating(false)
    }
  }

  async function handleAction(proposalId: string, action: 'approve' | 'reject') {
    setActionLoading(proposalId + action)
    try {
      const r = await fetch('/api/planning/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, action }),
      })
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      await loadProposals()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd')
    } finally {
      setActionLoading(null)
    }
  }

  const drafts   = proposals.filter(p => p.status === 'draft')
  const approved = proposals.filter(p => p.status === 'approved')
  const rejected = proposals.filter(p => p.status === 'rejected')

  return (
    <div className="space-y-6">

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex gap-3 items-end flex-wrap">

          {/* Month picker */}
          <div className="w-52 shrink-0">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Miesiąc</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {months.map(mo => (
                <option key={mo.value} value={mo.value}>{mo.label}</option>
              ))}
            </select>
          </div>

          {/* Constraints */}
          <div className="flex-1 min-w-[260px]">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Dodatkowe ograniczenia <span className="normal-case font-normal">(opcjonalne)</span>
            </label>
            <input
              type="text"
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !generating && generate()}
              placeholder="np. Hamlet min. 4 razy, bez środowego grania w 1. tygodniu…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {generating ? (
              <>
                <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                </svg>
                Stefan analizuje…
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="9" r="2" fill="currentColor" stroke="none"/>
                </svg>
                Generuj propozycje
              </>
            )}
          </button>
        </div>

        {generating && (
          <div className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
            <span className="inline-flex gap-1 text-gray-400">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
            </span>
            Stefan analizuje obsadę, dostępność aktorów i sale… Może to potrwać 20–30 sekund.
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
          </svg>
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Ładowanie propozycji…</div>
      ) : proposals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">

          {/* Drafts */}
          {drafts.length > 0 && (
            <section>
              <SectionLabel>Propozycje do zatwierdzenia ({drafts.length})</SectionLabel>
              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
                {drafts.map(p => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    expanded={expandedId === p.id}
                    onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    onApprove={() => handleAction(p.id, 'approve')}
                    onReject={() => handleAction(p.id, 'reject')}
                    actionLoading={actionLoading}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Approved */}
          {approved.length > 0 && (
            <section>
              <SectionLabel>Zatwierdzony repertuar</SectionLabel>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {approved.map(p => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    expanded={expandedId === p.id}
                    onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    onApprove={() => {}}
                    onReject={() => {}}
                    actionLoading={null}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Rejected */}
          {rejected.length > 0 && (
            <section className="opacity-50">
              <SectionLabel>Odrzucone propozycje</SectionLabel>
              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
                {rejected.map(p => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    expanded={expandedId === p.id}
                    onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    onApprove={() => {}}
                    onReject={() => {}}
                    actionLoading={null}
                  />
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-3">{children}</p>
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-52 text-center">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-gray-200 mb-3">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round"/>
      </svg>
      <p className="text-sm font-semibold text-gray-500">Brak propozycji dla tego miesiąca</p>
      <p className="text-xs text-gray-400 mt-1 max-w-xs">Kliknij „Generuj propozycje" — Stefan przygotuje kilka wariantów repertuaru uwzględniając obsadę i dostępność aktorów</p>
    </div>
  )
}

function ProposalCard({
  proposal, expanded, onToggle, onApprove, onReject, actionLoading,
}: {
  proposal: Proposal
  expanded: boolean
  onToggle: () => void
  onApprove: () => void
  onReject: () => void
  actionLoading: string | null
}) {
  const cfg    = STATUS_CFG[proposal.status] ?? STATUS_CFG.draft
  const events = [...(proposal.proposal_data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const stats  = proposal.stats ?? {} as ProposalStats

  const isApproving = actionLoading === proposal.id + 'approve'
  const isRejecting = actionLoading === proposal.id + 'reject'

  const borderCls =
    proposal.status === 'approved' ? 'border-green-300' :
    proposal.status === 'rejected' ? 'border-gray-100'  : 'border-gray-200'

  return (
    <div className={`bg-white rounded-2xl border ${borderCls} overflow-hidden flex flex-col`}>

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-gray-900">{proposal.label}</span>
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide ${cfg.cls}`}>
                {cfg.label}
              </span>
            </div>
            {proposal.reasoning && (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{proposal.reasoning}</p>
            )}
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Chip value={stats.total ?? events.length} label="spektakli" />
          {(stats.conflicts ?? 0) > 0 && (
            <Chip value={stats.conflicts} label="konfliktów" warn />
          )}
          {stats.by_production && Object.entries(stats.by_production as Record<string, number>)
            .slice(0, 4)
            .map(([title, n]) => (
              <Chip key={title} value={n} label={title.length > 14 ? title.slice(0, 14) + '…' : title} />
            ))}
        </div>
      </div>

      {/* Toggle event list */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <span>{expanded ? 'Ukryj harmonogram' : `Pokaż harmonogram (${events.length} spektakli)`}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-3 max-h-72 overflow-y-auto border-t border-gray-50">
          <div className="divide-y divide-gray-50">
            {events.map((e, i) => {
              const d   = new Date(e.date + 'T00:00:00')
              const dow = d.getDay()
              const isWeekend = dow === 0 || dow === 5 || dow === 6
              return (
                <div key={i} className="flex items-center gap-2 py-2">
                  <span className={`w-16 shrink-0 text-[11px] font-semibold ${isWeekend ? 'text-gray-900' : 'text-gray-400'}`}>
                    {DAY_PL[dow]} {d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="flex-1 min-w-0 text-xs font-medium text-gray-800 truncate">{e.production_title}</span>
                  {e.room_name && (
                    <span className="text-[10px] text-gray-400 shrink-0">{e.room_name}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto">
        {proposal.status === 'draft' && (
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
            <Link
              href={`/planning/${proposal.id}`}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 bg-white rounded-xl hover:bg-gray-100 transition-colors shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              Zobacz
            </Link>
            <button
              onClick={onApprove}
              disabled={!!actionLoading}
              className="flex-1 py-2 text-xs font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {isApproving ? 'Zatwierdzam…' : '✓ Zatwierdź'}
            </button>
            <button
              onClick={onReject}
              disabled={!!actionLoading}
              className="px-4 py-2 text-xs font-semibold text-gray-500 border border-gray-200 bg-white rounded-xl hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {isRejecting ? '…' : 'Odrzuć'}
            </button>
          </div>
        )}

        {proposal.status === 'approved' && (
          <div className="px-5 py-3 bg-green-50 border-t border-green-100 flex items-center gap-2">
            <p className="flex-1 text-xs text-green-700 font-medium">
              ✓ Zatwierdzono{proposal.approved_at
                ? ` ${new Date(proposal.approved_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`
                : ''} — {events.length} spektakli
            </p>
            <Link
              href={`/planning/${proposal.id}`}
              className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              Zobacz
            </Link>
          </div>
        )}
      </div>

    </div>
  )
}

function Chip({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium ${
      warn ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
    }`}>
      <span className="font-bold">{value}</span>
      <span>{label}</span>
    </span>
  )
}
