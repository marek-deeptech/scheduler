'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  detectProposalConflicts,
  conflictedTitles,
  type ProposalConflict,
} from '@/lib/conflicts'

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
  rejected: { label: 'Odrzucony',    cls: 'bg-[#f2ede6] text-[#7a7068]'  },
}

const DAY_PL = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

function getNextMonths(n: number) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) }
  })
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const allMonths = getNextMonths(7)
  const [approvedMonths, setApprovedMonths] = useState<Set<string>>(new Set())
  const [monthsReady,    setMonthsReady]    = useState(false)

  // Fetch approved months + production cast data on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/planning/generate?status=approved').then(r => r.json()),
      supabase.from('productions').select('title, is_favourite, artist_productions(artists(id, name))'),
    ]).then(([json, castRes]) => {
      // Approved months
      const approved = new Set<string>((json.proposals ?? []).map((p: Proposal) => p.month))
      setApprovedMonths(approved)
      setMonthsReady(true)

      // Build cast maps from Supabase
      const castMap  = new Map<string, string[]>()
      const nameMap  = new Map<string, string>()
      const favSet   = new Set<string>()
      for (const p of castRes.data ?? []) {
        const ids: string[] = []
        for (const ap of p.artist_productions ?? []) {
          const a = Array.isArray(ap.artists) ? ap.artists[0] : ap.artists
          if (a?.id) { ids.push(a.id); nameMap.set(a.id, a.name) }
        }
        castMap.set(p.title, ids)
        if ((p as any).is_favourite) favSet.add(p.title)
      }
      setProductionCastMap(castMap)
      setArtistNamesMap(nameMap)
      setFavouriteSet(favSet)
    }).catch(() => setMonthsReady(true))
  }, [])

  const months = allMonths.filter(mo => !approvedMonths.has(mo.value))

  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [proposals,     setProposals]     = useState<Proposal[]>([])
  const [loading,       setLoading]       = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [constraints,   setConstraints]   = useState('')
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)

  // Cast data for real conflict detection
  const [productionCastMap, setProductionCastMap] = useState<Map<string, string[]>>(new Map())
  const [artistNamesMap,    setArtistNamesMap]     = useState<Map<string, string>>(new Map())
  const [favouriteSet,      setFavouriteSet]       = useState<Set<string>>(new Set())

  // Set default selected month once approved list is known
  useEffect(() => {
    if (!monthsReady) return
    const first = months[0]?.value
    if (first && !selectedMonth) setSelectedMonth(first)
  }, [monthsReady])   // eslint-disable-line

  useEffect(() => {
    if (selectedMonth) loadProposals()
  }, [selectedMonth])   // eslint-disable-line

  async function loadProposals() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/planning/generate?month=${selectedMonth}`)
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      // Sort by numeric label: "Propozycja 1" → 1, "Propozycja 2" → 2, …
      const sorted = (json.proposals ?? []).slice().sort((a: Proposal, b: Proposal) => {
        const numA = parseInt(a.label.replace(/\D/g, ''), 10) || 0
        const numB = parseInt(b.label.replace(/\D/g, ''), 10) || 0
        return numA - numB
      })
      setProposals(sorted)
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
      setConstraints('')
      await loadProposals()   // reload so we always show the 4 most recent drafts
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

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 px-8 py-5 -mx-8 -mt-8 mb-2"
        style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>Planowanie repertuaru</h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Stefan analizuje obsadę i dostępność, generuje propozycje układu spektakli</p>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="bg-white rounded-2xl border border-[#e4ddd4] p-5 space-y-4">
        <div className="flex gap-3 items-end flex-wrap">

          {/* Month picker — only months without approved repertoire */}
          <div className="w-52 shrink-0">
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Miesiąc</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              disabled={!monthsReady || months.length === 0}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e] disabled:opacity-50" style={{ border: '1px solid #e4ddd4', color: '#3e3830' }}
            >
              {months.length === 0
                ? <option value="">Wszystkie miesiące zatwierdzone</option>
                : months.map(mo => <option key={mo.value} value={mo.value}>{mo.label}</option>)
              }
            </select>
          </div>

          {/* Constraints */}
          <div className="flex-1 min-w-[260px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Dodatkowe ograniczenia <span className="normal-case font-normal" style={{ color: '#a89e92' }}>(opcjonalne)</span></label>
            <input
              type="text"
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !generating && generate()}
              placeholder="np. Hamlet min. 4 razy, bez środowego grania w 1. tygodniu…"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]" style={{ border: '1px solid #e4ddd4', color: '#3e3830' }}
            />
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors shrink-0"
            style={{ background: '#c8102e', color: '#fff' }}
            onMouseOver={e => !e.currentTarget.disabled && (e.currentTarget.style.background = '#9e0c24')}
            onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
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

        {/* Generating banner */}
        {generating && (
          <div className="flex items-center gap-3 text-sm rounded-xl px-4 py-3" style={{ background: '#faf8f5', color: '#7a7068' }}>
            <span className="inline-flex gap-1" style={{ color: '#cec5b8' }}>
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
            </span>
            Stefan analizuje obsadę, dostępność aktorów i sale… Może to potrwać 20–30 sekund.
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
          </svg>
          {error}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-sm" style={{ color: '#cec5b8' }}>Ładowanie propozycji…</div>
      ) : proposals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
          {proposals.map(p => (
            <ProposalCard
              key={p.id}
              proposal={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onApprove={() => handleAction(p.id, 'approve')}
              onReject={() => handleAction(p.id, 'reject')}
              actionLoading={actionLoading}
              productionCastMap={productionCastMap}
              artistNamesMap={artistNamesMap}
              favouriteSet={favouriteSet}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#b8b0a4' }}>{children}</p>
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-52 text-center">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" strokeWidth="1.3" className="mb-3" style={{ color: '#e4ddd4' }} stroke="currentColor">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round"/>
      </svg>
      <p className="text-sm font-semibold" style={{ color: '#7a7068' }}>Brak propozycji dla tego miesiąca</p>
      <p className="text-xs mt-1 max-w-xs" style={{ color: '#a89e92' }}>Kliknij „Generuj propozycje" — Stefan przygotuje kilka wariantów repertuaru uwzględniając obsadę i dostępność aktorów</p>
    </div>
  )
}

function ProposalCard({
  proposal, expanded, onToggle, onApprove, onReject, actionLoading,
  productionCastMap, artistNamesMap, favouriteSet,
}: {
  proposal: Proposal
  expanded: boolean
  onToggle: () => void
  onApprove: () => void
  onReject: () => void
  actionLoading: string | null
  productionCastMap: Map<string, string[]>
  artistNamesMap:    Map<string, string>
  favouriteSet:      Set<string>
}) {
  const cfg    = STATUS_CFG[proposal.status] ?? STATUS_CFG.draft
  const events = [...(proposal.proposal_data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const stats  = proposal.stats ?? {} as ProposalStats

  // Real conflict detection
  const realConflicts: ProposalConflict[] = productionCastMap.size > 0
    ? detectProposalConflicts(events, productionCastMap, artistNamesMap)
    : []
  const conflictTitleSet = conflictedTitles(realConflicts)

  const isApproving = actionLoading === proposal.id + 'approve'
  const isRejecting = actionLoading === proposal.id + 'reject'

  const borderCls =
    proposal.status === 'approved' ? 'border-green-300' :
    proposal.status === 'rejected' ? 'border-[#f2ede6]'  : 'border-[#e4ddd4]'

  return (
    <div className={`bg-white rounded-2xl border ${borderCls} overflow-hidden flex flex-col`}>

      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #e4ddd4' }}>
        <div className="flex items-start gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold" style={{ color: '#1a1410' }}>{proposal.label}</span>
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide ${cfg.cls}`}>
                {cfg.label}
              </span>
            </div>
            {proposal.reasoning && (
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#7a7068' }}>{proposal.reasoning}</p>
            )}
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Chip value={stats.total ?? events.length} label="spektakli" />
          {realConflicts.length > 0 && (
            <Chip value={realConflicts.length} label="konfliktów obsady" warn />
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
        className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-medium transition-colors"
        style={{ color: '#7a7068' }}
        onMouseOver={e => (e.currentTarget.style.background = '#faf8f5')}
        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span>{expanded ? 'Ukryj harmonogram' : `Pokaż harmonogram (${events.length} spektakli)`}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-3 max-h-72 overflow-y-auto" style={{ borderTop: '1px solid #f2ede6' }}>
          <div className="divide-y" style={{ borderColor: '#f2ede6' }}>
            {events.map((e, i) => {
              const d   = new Date(e.date + 'T00:00:00')
              const dow = d.getDay()
              const isWeekend    = dow === 0 || dow === 5 || dow === 6
              const hasConflict  = conflictTitleSet.has(e.production_title)
              // Find conflicting partner on the same day/time
              const partnerConflict = realConflicts.find(c =>
                c.date === e.date &&
                c.productions.some(p => p.title === e.production_title)
              )
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 py-2 rounded-lg px-1 -mx-1"
                  style={hasConflict ? { background: '#fff5f5' } : undefined}
                >
                  <span className="w-16 shrink-0 text-[11px] font-semibold" style={{ color: isWeekend ? '#1a1410' : '#a89e92' }}>
                    {DAY_PL[dow]} {d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="flex-1 min-w-0 text-xs font-medium truncate flex items-center gap-1"
                        style={{ color: hasConflict ? '#c8102e' : '#3e3830', fontWeight: hasConflict ? 600 : 400 }}>
                    {hasConflict && '⚠ '}
                    {favouriteSet.has(e.production_title) && (
                      <svg viewBox="0 0 24 24" width="11" height="11" style={{ flexShrink: 0 }} fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                      </svg>
                    )}
                    {e.production_title}
                  </span>
                  {partnerConflict && (
                    <span className="text-[10px] shrink-0 font-medium" style={{ color: '#c8102e' }}
                          title={`Konflikt z: ${partnerConflict.productions.find(p => p.title !== e.production_title)?.title}`}>
                      {partnerConflict.artistNames.slice(0,2).join(', ')}
                      {partnerConflict.artistNames.length > 2 ? ` +${partnerConflict.artistNames.length-2}` : ''}
                    </span>
                  )}
                  {e.room_name && !partnerConflict && (
                    <span className="text-[10px] shrink-0" style={{ color: '#a89e92' }}>{e.room_name}</span>
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
          <div className="px-5 py-3 flex gap-2" style={{ background: '#faf8f5', borderTop: '1px solid #e4ddd4' }}>
            <Link
              href={`/planning/${proposal.id}`}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors shrink-0"
              style={{ color: '#5a524a', border: '1px solid #e4ddd4', background: '#fff' }}
              onMouseOver={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.background = '#f2ede6')}
              onMouseOut={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.background = '#fff')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              Zobacz
            </Link>
            <button
              onClick={onApprove}
              disabled={!!actionLoading}
              className="flex-1 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors"
              style={{ background: '#c8102e', color: '#fff' }}
              onMouseOver={e => !e.currentTarget.disabled && (e.currentTarget.style.background = '#9e0c24')}
              onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
            >
              {isApproving ? 'Zatwierdzam…' : '✓ Zatwierdź'}
            </button>
            <button
              onClick={onReject}
              disabled={!!actionLoading}
              className="px-4 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors"
              style={{ color: '#7a7068', border: '1px solid #e4ddd4', background: '#fff' }}
              onMouseOver={e => (e.currentTarget.style.background = '#f2ede6')}
              onMouseOut={e => (e.currentTarget.style.background = '#fff')}
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
      warn ? 'bg-red-50 text-red-700' : 'bg-[#f2ede6] text-[#5a524a]'
    }`}>
      <span className="font-bold">{value}</span>
      <span>{label}</span>
    </span>
  )
}
