'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProposalEvent {
  date: string
  production_id: string | null
  production_title: string
  room_id: string | null
  room_name: string | null
  start_time: string
  end_time: string
  type: string
}

interface Proposal {
  id: string
  month: string
  label: string
  status: 'draft' | 'approved' | 'rejected'
  proposal_data: ProposalEvent[]
  reasoning: string
  stats: { total: number; conflicts: number; by_production: Record<string, number> }
  created_at: string
  approved_at: string | null
}

interface ProdOption {
  id: string
  title: string
  theatreId: string
  theatreName: string
}

interface AvailData {
  theatreByProdId:     Record<string, string>
  theatreNameByProdId: Record<string, string>
  castByProdId:        Record<string, string[]>
  blockedByDate:       Record<string, Set<string>>
  prodsByTheatreId:    Record<string, ProdOption[]>
}

// ── Constants ────────────────────────────────────────────────────────────────

const PL_HOLIDAYS = new Set([
  '2026-01-01','2026-01-06','2026-04-05','2026-04-06',
  '2026-05-01','2026-05-03','2026-06-04','2026-08-15',
  '2026-11-01','2026-11-11','2026-12-25','2026-12-26',
])
const DOW_FULL  = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota']
const DOW_SHORT = ['Nd','Pn','Wt','Śr','Cz','Pt','Sb']
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Propozycja',   cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Zatwierdzony', cls: 'bg-green-100  text-green-800'  },
  rejected: { label: 'Odrzucony',    cls: 'bg-gray-100   text-gray-500'   },
}

function getDaysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const count  = new Date(y, m, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  )
}

// ── Alternatives helper ───────────────────────────────────────────────────────

function getAlternatives(
  date: string,
  show: ProposalEvent,
  allShows: ProposalEvent[],
  avail: AvailData,
): ProdOption[] {
  const theatreId = avail.theatreByProdId[show.production_id ?? '']
  if (!theatreId) return []

  // Productions already used today in the same theatre (excluding the one we're replacing)
  const usedToday = new Set(
    allShows
      .filter(s => s.date === date && s.production_id !== show.production_id)
      .filter(s => avail.theatreByProdId[s.production_id ?? ''] === theatreId)
      .map(s => s.production_id)
  )

  const blocked = avail.blockedByDate[date] ?? new Set()

  return (avail.prodsByTheatreId[theatreId] ?? []).filter(p => {
    if (p.id === show.production_id) return false   // same as current
    if (usedToday.has(p.id))         return false   // already in other room today
    const cast  = avail.castByProdId[p.id] ?? []
    const avail2 = cast.filter(n => !blocked.has(n))
    return avail2.length >= Math.ceil(cast.length / 2)
  })
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProposalDetailPage() {
  const { id }  = useParams<{ id: string }>()

  const [proposal,     setProposal]     = useState<Proposal | null>(null)
  const [localShows,   setLocalShows]   = useState<ProposalEvent[]>([])
  const [availData,    setAvailData]    = useState<AvailData | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [approving,    setApproving]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null) // "date||prodId"

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch proposal + availability data
  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      try {
        const r = await fetch(`/api/planning/generate?id=${id}`)
        const { proposal: p, error: e } = await r.json()
        if (e) throw new Error(e)
        setProposal(p)
        setLocalShows(p.proposal_data ?? [])

        const month      = p.month
        const monthStart = month + '-01'
        const [y, m]     = month.split('-').map(Number)
        const lastDay    = new Date(y, m, 0)
        const monthEnd   = `${lastDay.getFullYear()}-${String(lastDay.getMonth()+1).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`

        const [
          { data: prods },
          { data: artistProds },
          { data: artists },
          { data: theatres },
          { data: statuses },
        ] = await Promise.all([
          supabase.from('productions').select('id, title, theatre_id').order('title'),
          supabase.from('artist_productions').select('artist_id, production_id'),
          supabase.from('artists').select('id, name'),
          supabase.from('theatres').select('id, name'),
          supabase.from('actor_day_status')
            .select('artist_id, date, status, artists(name)')
            .gte('date', monthStart)
            .lte('date', monthEnd),
        ])

        const theatreNames: Record<string, string> = {}
        for (const t of (theatres ?? []) as any[]) theatreNames[t.id] = t.name

        const castByProdId: Record<string, string[]> = {}
        for (const ap of (artistProds ?? []) as any[]) {
          const artist = ((artists ?? []) as any[]).find((a: any) => a.id === ap.artist_id)
          if (artist) { castByProdId[ap.production_id] ??= []; castByProdId[ap.production_id].push(artist.name) }
        }

        const theatreByProdId: Record<string, string>     = {}
        const theatreNameByProdId: Record<string, string> = {}
        const prodsByTheatreId: Record<string, ProdOption[]> = {}

        for (const pr of (prods ?? []) as any[]) {
          if (!(castByProdId[pr.id]?.length)) continue // skip productions with no cast
          const tid   = pr.theatre_id ?? 'unknown'
          const tName = theatreNames[tid] ?? ''
          theatreByProdId[pr.id]     = tid
          theatreNameByProdId[pr.id] = tName
          prodsByTheatreId[tid] ??= []
          prodsByTheatreId[tid].push({ id: pr.id, title: pr.title, theatreId: tid, theatreName: tName })
        }

        const BLOCKING = new Set(['Urlop', 'Niedostępny', 'Choroba'])
        const blockedByDate: Record<string, Set<string>> = {}
        for (const s of (statuses ?? []) as any[]) {
          if (BLOCKING.has(s.status)) {
            const name = (Array.isArray(s.artists) ? s.artists[0] : s.artists)?.name ?? ''
            if (name) { blockedByDate[s.date] ??= new Set(); blockedByDate[s.date].add(name) }
          }
        }

        setAvailData({ theatreByProdId, theatreNameByProdId, castByProdId, blockedByDate, prodsByTheatreId })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Błąd')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [id])

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function persist(shows: ProposalEvent[]) {
    if (!proposal || proposal.status !== 'draft') return
    setSaving(true)
    try {
      const r = await fetch('/api/planning/generate', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ proposalId: proposal.id, proposal_data: shows }),
      })
      const { error: e } = await r.json()
      if (e) throw new Error(e)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  function deleteShow(date: string, prodId: string | null) {
    const updated = localShows.filter(s => !(s.date === date && s.production_id === prodId))
    setLocalShows(updated)
    persist(updated)
  }

  function replaceShow(date: string, oldProdId: string | null, newProd: ProdOption) {
    const updated = localShows.map(s =>
      s.date === date && s.production_id === oldProdId
        ? { ...s, production_id: newProd.id, production_title: newProd.title }
        : s
    )
    setLocalShows(updated)
    setOpenDropdown(null)
    persist(updated)
  }

  async function handleApprove() {
    if (!proposal) return
    setApproving(true)
    try {
      const r = await fetch('/api/planning/approve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ proposalId: proposal.id, action: 'approve' }),
      })
      const { error: e } = await r.json()
      if (e) throw new Error(e)
      setProposal(p => p ? { ...p, status: 'approved', approved_at: new Date().toISOString() } : p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd')
    } finally {
      setApproving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Ładowanie…</div>
  if (error || !proposal) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-sm text-red-500">{error ?? 'Nie znaleziono propozycji'}</p>
      <Link href="/planning" className="text-xs text-gray-500 underline">← Wróć do planowania</Link>
    </div>
  )

  const days  = getDaysInMonth(proposal.month)
  const eventsByDate = new Map<string, ProposalEvent[]>()
  for (const e of localShows) {
    const list = eventsByDate.get(e.date) ?? []; list.push(e); eventsByDate.set(e.date, list)
  }

  const cfg       = STATUS_CFG[proposal.status] ?? STATUS_CFG.draft
  const [y, m]    = proposal.month.split('-').map(Number)
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
  const isDraft   = proposal.status === 'draft'

  // Stats from localShows
  const byProd: Record<string, number> = {}
  for (const s of localShows) byProd[s.production_title] = (byProd[s.production_title] ?? 0) + 1

  return (
    <div className="space-y-5 max-w-3xl" ref={dropdownRef}>

      {/* Back + header */}
      <div>
        <Link href="/planning" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Planowanie
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{proposal.label}</h1>
              <span className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide ${cfg.cls}`}>
                {cfg.label}
              </span>
              {saving && <span className="text-[11px] text-gray-400">Zapisuję…</span>}
            </div>
            <p className="text-sm text-gray-500">
              {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
              {proposal.reasoning ? ` · ${proposal.reasoning}` : ''}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <StatChip value={localShows.length} label="spektakli" />
            {Object.entries(byProd).sort((a,b) => b[1]-a[1]).map(([title, n]) => (
              <StatChip key={title} value={n} label={title.length > 16 ? title.slice(0,16)+'…' : title} />
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Approve bar */}
      {isDraft && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-3">
          <p className="flex-1 text-sm text-yellow-800">Ta propozycja czeka na zatwierdzenie. Możesz edytować spektakle przed zatwierdzeniem.</p>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {approving ? 'Zatwierdzam…' : '✓ Zatwierdź repertuar'}
          </button>
        </div>
      )}
      {proposal.status === 'approved' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3 text-sm text-green-800 font-medium">
          ✓ Zatwierdzono{proposal.approved_at ? ` ${new Date(proposal.approved_at).toLocaleDateString('pl-PL', { day:'numeric', month:'long', year:'numeric' })}` : ''} — spektakle dodane do kalendarza
        </div>
      )}

      {/* Day-by-day calendar */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Harmonogram</p>
          <p className="text-xs text-gray-400">{eventsByDate.size} z {days.length} dni zaplanowanych</p>
        </div>

        <div className="divide-y divide-gray-50">
          {days.map(date => {
            const dow       = new Date(date + 'T12:00:00').getDay()
            const isWeekend = dow === 0 || dow === 5 || dow === 6
            const isHoliday = PL_HOLIDAYS.has(date)
            const dayShows  = eventsByDate.get(date) ?? []
            const hasShows  = dayShows.length > 0
            const dayNum    = parseInt(date.slice(8), 10)

            return (
              <div key={date} className={`${isWeekend && hasShows ? 'bg-blue-50/30' : isWeekend ? 'bg-gray-50/40' : ''}`}>

                {/* Date row */}
                <div className="flex items-start gap-3 px-5 py-2.5">
                  {/* Date */}
                  <div className="w-14 shrink-0 flex items-center gap-1.5 pt-0.5">
                    <span className={`text-sm font-bold tabular-nums ${hasShows ? (isWeekend ? 'text-gray-900':'text-gray-700') : 'text-gray-300'}`}>
                      {dayNum}
                    </span>
                    <span className={`text-[11px] font-medium ${isWeekend ? 'text-gray-500':'text-gray-300'}`}>
                      {DOW_SHORT[dow]}
                    </span>
                  </div>

                  {/* Shows */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {isHoliday && !hasShows && <span className="text-[11px] text-red-400 font-medium">🚫 Święto</span>}
                    {!isHoliday && !hasShows && <span className="text-[11px] text-gray-200 select-none">—</span>}

                    {dayShows.map((show, i) => {
                      const dropKey   = `${date}||${show.production_id}`
                      const isOpen    = openDropdown === dropKey
                      const theatreName = availData?.theatreNameByProdId[show.production_id ?? '']
                      const alts = (availData && isOpen)
                        ? getAlternatives(date, show, localShows, availData)
                        : []

                      return (
                        <div key={i}>
                          {/* Show row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Theatre badge */}
                            {theatreName && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded shrink-0">
                                {theatreName}
                              </span>
                            )}
                            {/* Title */}
                            <span className="text-sm font-semibold text-gray-900">{show.production_title}</span>
                            {/* Time */}
                            <span className="text-[11px] text-gray-400 font-mono shrink-0">
                              {show.start_time?.slice(0,5)}–{show.end_time?.slice(0,5)}
                            </span>
                            {/* Room */}
                            {show.room_name && (
                              <span className="text-[11px] text-gray-400 shrink-0 flex items-center gap-1">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>
                                </svg>
                                {show.room_name}
                              </span>
                            )}

                            {/* Edit buttons — only for draft */}
                            {isDraft && (
                              <div className="flex gap-1 ml-auto shrink-0">
                                <button
                                  onClick={() => setOpenDropdown(isOpen ? null : dropKey)}
                                  className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-lg border transition-colors ${isOpen ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'}`}
                                >
                                  Zmień
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                                    <path d="M6 9l6 6 6-6" strokeLinecap="round"/>
                                  </svg>
                                </button>
                                <button
                                  onClick={() => deleteShow(date, show.production_id)}
                                  className="px-2 py-0.5 text-[11px] font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                  Usuń
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Alternatives dropdown */}
                          {isOpen && (
                            <div className="mt-1.5 ml-0 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                              {alts.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-gray-400 italic">Brak dostępnych zastępstw w tym dniu</p>
                              ) : (
                                <div className="divide-y divide-gray-100">
                                  {alts.map(alt => (
                                    <button
                                      key={alt.id}
                                      onClick={() => replaceShow(date, show.production_id, alt)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white transition-colors"
                                    >
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded shrink-0">
                                        {alt.theatreName}
                                      </span>
                                      <span className="text-xs font-medium text-gray-800 flex-1">{alt.title}</span>
                                      <span className="text-[10px] text-blue-600 font-semibold shrink-0">Wybierz →</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Weekend badge */}
                  {isWeekend && hasShows && (
                    <span className="shrink-0 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-md self-start mt-0.5">
                      {DOW_FULL[dow]}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

function StatChip({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-100 text-gray-600">
      <span className="font-bold">{value}</span>
      <span>{label}</span>
    </span>
  )
}
