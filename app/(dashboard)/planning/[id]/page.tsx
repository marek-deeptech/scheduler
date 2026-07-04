'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ConflictResolutionModal from '@/components/ConflictResolutionModal'
import { supabase } from '@/lib/supabase'
import { sortByLastName } from '@/lib/names'
import { proposalStage, STAGE_META } from '@/lib/repertoire-stage'

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
  stats: {
    total: number; conflicts: number; by_production: Record<string, number>
    consultations_started_at?: string | null
    sales_started_at?: string | null
    report_sent_at?: string | null
  }
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
  castByProdId:        Record<string, string[]>     // production_id → artist names
  castIdsByProdId:     Record<string, string[]>     // production_id → artist ids
  artistIdByName:      Record<string, string>       // artist name → artist id
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

function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-colors shrink-0"
      style={{ background: '#1a1410', color: '#fff' }}
      onMouseOver={e => (e.currentTarget.style.background = '#000')}
      onMouseOut={e => (e.currentTarget.style.background = '#1a1410')}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
      Drukuj
    </button>
  )
}

function getDaysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const count  = new Date(y, m, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  )
}

// ── Conflict detection ────────────────────────────────────────────────────────
// Returns a map: "date||production_id" → string[] of conflicting actor names

function detectConflicts(
  shows: ProposalEvent[],
  castByProdId: Record<string, string[]>,
): Map<string, string[]> {
  const result = new Map<string, string[]>()

  // Group shows by date
  const byDate: Record<string, ProposalEvent[]> = {}
  for (const s of shows) {
    byDate[s.date] ??= []
    byDate[s.date].push(s)
  }

  for (const dayShows of Object.values(byDate)) {
    if (dayShows.length < 2) continue
    for (let i = 0; i < dayShows.length; i++) {
      for (let j = i + 1; j < dayShows.length; j++) {
        const a    = dayShows[i]
        const b    = dayShows[j]
        const castA = new Set(castByProdId[a.production_id ?? ''] ?? [])
        const castB = castByProdId[b.production_id ?? ''] ?? []
        const shared = castB.filter(actor => castA.has(actor))
        if (shared.length > 0) {
          const keyA = `${a.date}||${a.production_id}`
          const keyB = `${b.date}||${b.production_id}`
          result.set(keyA, [...new Set([...(result.get(keyA) ?? []), ...shared])])
          result.set(keyB, [...new Set([...(result.get(keyB) ?? []), ...shared])])
        }
      }
    }
  }

  return result
}

// Strukturalne pary konfliktów (do panelu rozwiązywania).
// Ta sama logika co pulpit/lista: para spektakli w tym samym dniu z nakładającym
// się czasem i wspólną obsadą = 1 konflikt.
interface ConflictPair {
  date:        string
  a:           ProposalEvent
  b:           ProposalEvent
  sharedNames: string[]
}

function detectConflictPairs(
  shows:           ProposalEvent[],
  castIdsByProdId: Record<string, string[]>,
  idToName:        Map<string, string>,
): ConflictPair[] {
  const byDate: Record<string, ProposalEvent[]> = {}
  for (const s of shows) (byDate[s.date] ??= []).push(s)

  const out: ConflictPair[] = []
  for (const [date, ds] of Object.entries(byDate)) {
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i], b = ds[j]
        if (!a.production_id || !b.production_id) continue
        if (a.production_id === b.production_id) continue
        const aS = (a.start_time || '').slice(0, 5), aE = (a.end_time || '').slice(0, 5)
        const bS = (b.start_time || '').slice(0, 5), bE = (b.end_time || '').slice(0, 5)
        if (aS >= bE || bS >= aE) continue   // brak nakładania czasu
        const castA = new Set(castIdsByProdId[a.production_id] ?? [])
        const shared = (castIdsByProdId[b.production_id] ?? []).filter(id => castA.has(id))
        if (shared.length === 0) continue
        out.push({ date, a, b, sharedNames: shared.map(id => idToName.get(id) ?? id) })
      }
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.a.start_time.localeCompare(y.a.start_time))
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
  const [busy,         setBusy]         = useState<null | 'approve' | 'consult' | 'sell'>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null) // "date||prodId"
  const [panelSwapKey, setPanelSwapKey] = useState<string | null>(null) // panel konfliktów: które alternatywy rozwinięte
  const [favouriteSet, setFavouriteSet] = useState<Set<string>>(new Set())
  const [conflictModal, setConflictModal] = useState<{
    artistId:    string
    artistName:  string
    conflictDate: string
    conflictStart?: string
    conflictEnd?:   string
    productions: string[]
  } | null>(null)

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
          supabase.from('productions').select('id, title, theatre_id, is_favourite').order('title'),
          supabase.from('artist_productions').select('artist_id, production_id'),
          supabase.from('artists').select('id, name, teams!inner(name)').eq('teams.name', 'Cast').order('name'),
          supabase.from('theatres').select('id, name'),
          supabase.from('actor_day_status')
            .select('artist_id, date, status, artists(name)')
            .gte('date', monthStart)
            .lte('date', monthEnd),
        ])

        const theatreNames: Record<string, string> = {}
        for (const t of (theatres ?? []) as any[]) theatreNames[t.id] = t.name

        const castByProdId: Record<string, string[]>   = {}
        const castIdsByProdId: Record<string, string[]> = {}
        const artistIdByName: Record<string, string>    = {}
        const castPairsByProdId: Record<string, { id: string; name: string }[]> = {}
        for (const ap of (artistProds ?? []) as any[]) {
          const artist = ((artists ?? []) as any[]).find((a: any) => a.id === ap.artist_id)
          if (artist) {
            castPairsByProdId[ap.production_id] ??= []
            castPairsByProdId[ap.production_id].push({ id: artist.id, name: artist.name })
            artistIdByName[artist.name] = artist.id
          }
        }
        // Sort each cast alphabetically by surname, keeping name/id arrays aligned
        for (const [prodId, pairs] of Object.entries(castPairsByProdId)) {
          const sorted = sortByLastName(pairs)
          castByProdId[prodId]    = sorted.map(p => p.name)
          castIdsByProdId[prodId] = sorted.map(p => p.id)
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

        setAvailData({ theatreByProdId, theatreNameByProdId, castByProdId, castIdsByProdId, artistIdByName, blockedByDate, prodsByTheatreId })

        const favs = new Set<string>()
        for (const pr of (prods ?? []) as any[]) {
          if (pr.is_favourite) favs.add(pr.title)
        }
        setFavouriteSet(favs)
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

  // Bramki procesu: Zatwierdzenie (approve) → Konsultacje (consult) → Sprzedaż (sell)
  async function runAction(action: 'approve' | 'consult' | 'sell') {
    if (!proposal) return
    setBusy(action)
    setError(null)
    try {
      const r = await fetch('/api/planning/approve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ proposalId: proposal.id, action }),
      })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      const now = new Date().toISOString()
      setProposal(p => {
        if (!p) return p
        if (action === 'approve') return { ...p, status: 'approved', approved_at: now }
        if (action === 'consult') return { ...p, stats: { ...p.stats, consultations_started_at: now } }
        return { ...p, stats: { ...p.stats, sales_started_at: now } }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd')
    } finally {
      setBusy(null)
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

  const stage     = proposalStage(proposal)
  const stageMeta = STAGE_META[stage]
  const [y, m]    = proposal.month.split('-').map(Number)
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
  const isDraft   = proposal.status === 'draft'

  // Stats from localShows
  const byProd: Record<string, number> = {}
  for (const s of localShows) byProd[s.production_title] = (byProd[s.production_title] ?? 0) + 1

  // Conflict map: "date||production_id" → conflicting actor names (do podświetleń w grafiku)
  const conflicts = availData
    ? detectConflicts(localShows, availData.castByProdId)
    : new Map<string, string[]>()

  // Strukturalne pary konfliktów (panel + licznik) — spójne z pulpitem/listą.
  const idToName = new Map<string, string>()
  if (availData) for (const [name, aid] of Object.entries(availData.artistIdByName)) idToName.set(aid, name)
  const conflictPairs = availData
    ? detectConflictPairs(localShows, availData.castIdsByProdId, idToName)
    : []
  const conflictCount = conflictPairs.length

  return (
    <div className="space-y-5" ref={dropdownRef}>
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

      {/* Back + header */}
      <div>
        <Link href="/planning" className="no-print inline-flex items-center gap-1.5 text-xs transition-colors mb-3" style={{ color: '#a89e92' }} onMouseOver={e => (e.currentTarget.style.color = '#3e3830')} onMouseOut={e => (e.currentTarget.style.color = '#a89e92')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Planowanie
        </Link>

        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.5rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>{proposal.label} <span style={{ color: '#a89e92', fontWeight: 500 }}>/ {monthName.charAt(0).toUpperCase() + monthName.slice(1)}</span></h1>
            {proposal.status === 'rejected' ? (
              <span className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide ${STATUS_CFG.rejected.cls}`}>
                {STATUS_CFG.rejected.label}
              </span>
            ) : (
              <span className="px-2.5 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide"
                style={{ background: stageMeta.bg, color: stageMeta.color }}>
                {stage === 'planowanie' ? 'Propozycja' : stageMeta.label}
              </span>
            )}
            {saving && <span className="text-[11px] text-gray-400">Zapisuję…</span>}
          </div>
          {proposal.reasoning && (
            <p className="text-sm text-gray-500">{proposal.reasoning}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <StatChip value={localShows.length} label="spektakli" />
            {conflictCount > 0 && (
              <StatChip value={conflictCount} label="konfliktów obsady" warn />
            )}
            {Object.entries(byProd).sort((a,b) => b[1]-a[1]).map(([title, n]) => (
              <StatChip key={title} value={n} label={title.length > 20 ? title.slice(0,20)+'…' : title} />
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Pasek etapu: Planowanie → Zatwierdzenie → Konsultacje → Sprzedaż */}
      {isDraft && (
        <div className="no-print flex items-center gap-3 flex-wrap bg-white rounded-2xl px-4 md:px-5 py-3" style={{ border: '1px solid #e4ddd4' }}>
          <p className="flex-1 min-w-[200px] text-sm text-gray-500">Ta propozycja czeka na zatwierdzenie. Możesz edytować spektakle przed zatwierdzeniem.</p>
          <div className="flex gap-2 w-full md:w-auto">
            <PrintButton />
            <button
              onClick={() => runAction('approve')}
              disabled={busy !== null}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors shrink-0"
              style={{ background: '#c8102e', color: '#fff' }}
              onMouseOver={e => !e.currentTarget.disabled && (e.currentTarget.style.background = '#9e0c24')}
              onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
            >
              {busy === 'approve' ? 'Zatwierdzam…' : '✓ Zatwierdź repertuar'}
            </button>
          </div>
        </div>
      )}

      {stage === 'zatwierdzenie' && (
        <div className="no-print flex items-center gap-3 flex-wrap rounded-2xl px-4 md:px-5 py-3" style={{ background: STAGE_META.zatwierdzenie.bg, border: `1px solid ${STAGE_META.zatwierdzenie.dot}` }}>
          <p className="flex-1 min-w-[200px] text-sm font-medium" style={{ color: STAGE_META.zatwierdzenie.color }}>
            ✓ Zatwierdzono{proposal.approved_at ? ` ${new Date(proposal.approved_at).toLocaleDateString('pl-PL', { day:'numeric', month:'long', year:'numeric' })}` : ''} — spektakle w kalendarzu. Następny krok: konsultacje — komunikacja z obsadą (dostępność / udział) oraz powiadomienie działu Techniki i Sprzedaży.
          </p>
          <div className="flex gap-2 w-full md:w-auto">
            <PrintButton />
            <button
              onClick={() => runAction('consult')}
              disabled={busy !== null}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors shrink-0"
              style={{ background: '#6d28d9', color: '#fff' }}
              onMouseOver={e => !e.currentTarget.disabled && (e.currentTarget.style.background = '#5b21b6')}
              onMouseOut={e => (e.currentTarget.style.background = '#6d28d9')}
            >
              {busy === 'consult' ? 'Uruchamiam…' : 'Rozpocznij konsultacje →'}
            </button>
          </div>
        </div>
      )}

      {stage === 'konsultacje' && (
        <div className="no-print flex items-center gap-3 flex-wrap rounded-2xl px-4 md:px-5 py-3" style={{ background: STAGE_META.konsultacje.bg, border: `1px solid ${STAGE_META.konsultacje.dot}` }}>
          <p className="flex-1 min-w-[200px] text-sm font-medium" style={{ color: STAGE_META.konsultacje.color }}>
            Konsultacje w toku — obsada dostała prośby o potwierdzenie dostępności/udziału, a działy Techniki i Sprzedaży zostały powiadomione. Po zebraniu potwierdzeń uruchom sprzedaż biletów.
          </p>
          <div className="flex gap-2 w-full md:w-auto flex-wrap">
            <Link
              href={`/planning/implementation?month=${proposal.month}`}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-colors shrink-0"
              style={{ background: '#fff', color: '#6d28d9', border: '1px solid #6d28d9' }}
            >
              Zobacz potwierdzenia
            </Link>
            <button
              onClick={() => runAction('sell')}
              disabled={busy !== null}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors shrink-0"
              style={{ background: '#15803d', color: '#fff' }}
              onMouseOver={e => !e.currentTarget.disabled && (e.currentTarget.style.background = '#166534')}
              onMouseOut={e => (e.currentTarget.style.background = '#15803d')}
            >
              {busy === 'sell' ? 'Uruchamiam…' : 'Uruchom sprzedaż →'}
            </button>
            <PrintButton />
          </div>
        </div>
      )}

      {stage === 'sprzedaz' && (
        <div className="no-print flex items-center gap-3 flex-wrap rounded-2xl px-4 md:px-5 py-3" style={{ background: STAGE_META.sprzedaz.bg, border: `1px solid ${STAGE_META.sprzedaz.dot}` }}>
          <p className="flex-1 min-w-[200px] text-sm font-medium" style={{ color: STAGE_META.sprzedaz.color }}>
            ● Sprzedaż uruchomiona — repertuar przekazany do sprzedaży biletów (podgląd tylko do odczytu).
          </p>
          <div className="flex gap-2 w-full md:w-auto">
            <Link
              href={`/planning/implementation?month=${proposal.month}`}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-colors shrink-0"
              style={{ background: '#fff', color: '#15803d', border: '1px solid #86efac' }}
            >
              Zobacz potwierdzenia
            </Link>
            <PrintButton />
          </div>
        </div>
      )}

      {/* Panel konfliktów obsady — jedno miejsce do rozwiązywania */}
      {isDraft && conflictPairs.length > 0 && (
        <div className="no-print bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #fecaca' }}>
          <div className="px-5 py-3 flex items-start gap-2.5" style={{ background: '#fff5f5', borderBottom: '1px solid #fecaca' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8102e" strokeWidth="2.2" className="shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 9v4M12 17h.01" strokeLinecap="round"/>
            </svg>
            <div>
              <p className="text-sm font-bold" style={{ color: '#7a2020' }}>Konflikty obsady ({conflictPairs.length})</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#a06a6a' }}>
                Ten sam aktor gra w dwóch spektaklach naraz. Rozwiąż każdy przed zatwierdzeniem — podmień jeden z tytułów na alternatywę lub usuń spektakl.
              </p>
            </div>
          </div>

          <div className="divide-y max-h-[460px] overflow-y-auto" style={{ borderColor: '#f7e4e4' }}>
            {conflictPairs.map((c, idx) => {
              const dow = new Date(c.date + 'T12:00:00').getDay()
              return (
                <div key={`${c.date}-${c.a.production_id}-${c.b.production_id}-${idx}`} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-xs font-bold" style={{ color: '#1a1410' }}>
                      {DOW_FULL[dow]} {parseInt(c.date.slice(8), 10)}.{c.date.slice(5, 7)}
                    </span>
                    <span className="text-[11px]" style={{ color: '#a06a6a' }}>
                      wspólna obsada: <b style={{ color: '#7a2020' }}>{c.sharedNames.join(', ')}</b>
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {[c.a, c.b].map((show, si) => {
                      const key  = `${c.date}||${show.production_id}`
                      const open = panelSwapKey === key
                      const alts = (availData && open) ? getAlternatives(c.date, show, localShows, availData) : []
                      return (
                        <div key={si} className="rounded-xl" style={{ background: '#faf8f5', border: '1px solid #f2ede6' }}>
                          <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                            <span className="text-sm font-semibold" style={{ color: '#1a1410' }}>{show.production_title}</span>
                            <span className="text-[11px] font-mono" style={{ color: '#a89e92' }}>
                              {show.start_time?.slice(0, 5)}–{show.end_time?.slice(0, 5)}
                            </span>
                            {show.room_name && <span className="text-[11px]" style={{ color: '#a89e92' }}>· {show.room_name}</span>}
                            <div className="ml-auto flex items-center gap-1.5">
                              <button
                                onClick={() => setPanelSwapKey(open ? null : key)}
                                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-lg border transition-colors"
                                style={open ? { background: '#1a1410', color: '#fff', borderColor: '#1a1410' } : { color: '#7a7068', borderColor: '#e4ddd4' }}
                              >
                                Zmień tytuł
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" strokeLinecap="round"/></svg>
                              </button>
                              <button
                                onClick={() => deleteShow(c.date, show.production_id)}
                                className="px-2 py-0.5 text-[11px] font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                Usuń
                              </button>
                            </div>
                          </div>
                          {open && (
                            <div className="border-t" style={{ borderColor: '#f2ede6' }}>
                              {alts.length === 0 ? (
                                <p className="px-3 py-2 text-xs italic" style={{ color: '#a89e92' }}>Brak dostępnych alternatyw w tym dniu — rozważ usunięcie spektaklu.</p>
                              ) : (
                                <div className="divide-y" style={{ borderColor: '#f2ede6' }}>
                                  {alts.map(alt => (
                                    <button
                                      key={alt.id}
                                      onClick={() => { replaceShow(c.date, show.production_id, alt); setPanelSwapKey(null) }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white transition-colors"
                                    >
                                      <TheatreBadge name={alt.theatreName} />
                                      <span className="text-xs font-medium flex-1" style={{ color: '#1a1410' }}>{alt.title}</span>
                                      <span className="text-[10px] font-semibold shrink-0" style={{ color: '#c8102e' }}>Wybierz →</span>
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
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Day-by-day calendar */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>Harmonogram</p>
          <p className="text-xs text-gray-400">{eventsByDate.size} z {days.length} dni zaplanowanych</p>
        </div>

        <div className="divide-y divide-gray-100">
          {days.map((date, di) => {
            const dow       = new Date(date + 'T12:00:00').getDay()
            const isWeekend = dow === 0 || dow === 5 || dow === 6
            const isMonday  = dow === 1
            const isHoliday = PL_HOLIDAYS.has(date)
            const dayShows  = eventsByDate.get(date) ?? []
            const hasShows  = dayShows.length > 0
            const dayNum    = parseInt(date.slice(8), 10)

            return (
              <div
                key={date}
                className={[
                  isMonday && di > 0 ? 'border-t-2 border-gray-200' : '',
                  hasShows && isWeekend ? 'bg-gray-50/60' : hasShows ? 'bg-gray-50/60' : '',
                ].join(' ')}
              >
                {/* Date row */}
                <div className="flex items-start gap-3 px-5 py-3">
                  {/* Date number + short DOW */}
                  <div className="w-10 shrink-0 pt-0.5 flex flex-col items-center">
                    <span className={`text-sm font-bold tabular-nums leading-none ${hasShows ? (isWeekend ? 'text-gray-900' : 'text-gray-700') : 'text-gray-300'}`}>
                      {dayNum}
                    </span>
                    <span className={`text-[9px] font-semibold uppercase mt-0.5 ${isWeekend ? 'text-gray-500' : 'text-gray-300'}`}>
                      {DOW_SHORT[dow]}
                    </span>
                  </div>

                  {/* Shows */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {isHoliday && !hasShows && <span className="text-[11px] text-red-400 font-medium">🚫 Święto</span>}
                    {!isHoliday && !hasShows && <span className="text-[11px] text-gray-200 select-none">—</span>}

                    {dayShows.map((show, i) => {
                      const dropKey     = `${date}||${show.production_id}`
                      const isOpen      = openDropdown === dropKey
                      const theatreName = availData?.theatreNameByProdId[show.production_id ?? '']
                      const alts        = (availData && isOpen)
                        ? getAlternatives(date, show, localShows, availData)
                        : []

                      const conflictActors = conflicts.get(dropKey) ?? []
                      const hasConflict    = conflictActors.length > 0

                      return (
                        <div key={i}>
                          {/* Show row — info grows, right column fixed */}
                          <div className="flex items-center gap-2 min-w-0 flex-wrap md:flex-nowrap">

                            {/* Info section (grows) */}
                            <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                              {theatreName && (
                                <TheatreBadge name={theatreName} />
                              )}
                              <span className={`text-sm font-semibold truncate flex items-center gap-1 ${hasConflict ? 'text-red-700' : 'text-gray-900'}`}>
                                {favouriteSet.has(show.production_title) && (
                                  <svg viewBox="0 0 24 24" width="13" height="13" style={{ flexShrink: 0 }} fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                                  </svg>
                                )}
                                {show.production_title}
                              </span>
                              {/* Conflict icon — clickable per-actor */}
                              {hasConflict && (() => {
                                // Find conflicting sibling productions on same date
                                const siblingTitles = (eventsByDate.get(date) ?? [])
                                  .filter(s => s !== show)
                                  .filter(s => {
                                    const castA = new Set(availData?.castByProdId[show.production_id ?? ''] ?? [])
                                    const castB = availData?.castByProdId[s.production_id ?? ''] ?? []
                                    return castB.some(n => castA.has(n))
                                  })
                                  .map(s => s.production_title)
                                const allProds = [show.production_title, ...siblingTitles]
                                return (
                                  <span className="shrink-0 flex items-center flex-wrap gap-0.5 px-1.5 py-0.5 bg-red-50 border border-red-200 rounded text-[10px] font-semibold text-red-600">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/>
                                      <path d="M12 9v4M12 17h.01" strokeLinecap="round"/>
                                    </svg>
                                    {conflictActors.map((name, ci) => {
                                      const artistId = availData?.artistIdByName[name]
                                      return (
                                        <button
                                          key={ci}
                                          type="button"
                                          onClick={() => artistId && setConflictModal({
                                            artistId,
                                            artistName: name,
                                            conflictDate: date,
                                            conflictStart: show.start_time?.slice(0,5),
                                            conflictEnd:   show.end_time?.slice(0,5),
                                            productions:   allProds,
                                          })}
                                          className={`underline underline-offset-2 transition-opacity ${artistId ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
                                          title={`Konflikt obsady: ${name} — kliknij aby rozwiązać`}
                                        >
                                          {ci > 0 && <span style={{ textDecoration: 'none' }}>, </span>}
                                          {name.split(' ').pop()}
                                        </button>
                                      )
                                    })}
                                  </span>
                                )
                              })()}
                              <span className="text-[11px] text-gray-400 font-mono shrink-0">
                                {show.start_time?.slice(0,5)}–{show.end_time?.slice(0,5)}
                              </span>
                              {show.room_name && (
                                <span className="text-[11px] text-gray-400 shrink-0 flex items-center gap-1">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>
                                  </svg>
                                  {show.room_name}
                                </span>
                              )}
                            </div>

                            {/* Right column — day name + buttons, always same width */}
                            <div className="flex items-center gap-1.5 shrink-0 w-auto md:w-[200px] justify-end ml-auto">
                              {isWeekend && (
                                <span className="text-[11px] font-medium text-gray-400 mr-1">{DOW_FULL[dow]}</span>
                              )}
                              {isDraft && (
                                <span className="no-print flex items-center gap-1.5">
                                  <button
                                    onClick={() => setOpenDropdown(isOpen ? null : dropKey)}
                                    className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-lg border transition-colors ${isOpen ? 'border-[#1a1410]' : 'border-[#e4ddd4] hover:border-[#cec5b8]'}`}
                                    style={isOpen ? { background: '#1a1410', color: '#fff' } : { color: '#7a7068' }}
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
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Alternatives dropdown */}
                          {isOpen && (
                            <div className="mt-1.5 rounded-xl overflow-hidden" style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
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
                                      <TheatreBadge name={alt.theatreName} />
                                      <span className="text-xs font-medium text-gray-800 flex-1">{alt.title}</span>
                                      <span className="text-[10px] font-semibold shrink-0" style={{ color: '#c8102e' }}>Wybierz →</span>
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
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

function TheatreBadge({ name }: { name: string }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 tracking-wide bg-gray-100 text-gray-500">
      {name}
    </span>
  )
}

function StatChip({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
      warn ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-[#f2ede6] text-[#5a524a]'
    }`}>
      {warn && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 9v4M12 17h.01" strokeLinecap="round"/>
        </svg>
      )}
      <span className="font-bold">{value}</span>
      <span>{label}</span>
    </span>
  )
}
