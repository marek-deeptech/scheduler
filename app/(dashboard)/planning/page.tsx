'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTheatre } from '@/lib/theatre-context'
import { useOrg } from '@/lib/org-context'
import ConflictResolutionModal from '@/components/ConflictResolutionModal'
import SendConfirmModal from '@/components/SendConfirmModal'
import { CategoryMarks } from '@/components/CategoryMarks'
import { FinanceTab, CoreTab, ExtraTab } from '@/components/PlanningConditionTabs'
import ExcelImportTab from '@/components/ExcelImportTab'
import {
  detectProposalConflicts,
  conflictedTitles,
  type ProposalConflict,
} from '@/lib/conflicts'
import { proposalStage, STAGE_META, STAGE_ORDER, isApprovedStage, type RepStage } from '@/lib/repertoire-stage'

// Ostatnio wybrany miesiąc w Planowaniu — przeżywa wyjście i powrót do zakładki.
const MONTH_STORE_KEY = 'planning:selectedMonth'

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
  objective?: string
  finance?: { revenue: number; cost: number; margin: number; attendance: number; locked: number }
  // Markery etapu procesu (Konsultacje / Sprzedaż) — patrz lib/repertoire-stage.ts
  consultations_started_at?: string | null
  sales_started_at?: string | null
  report_sent_at?: string | null
}

function fmtPlnShort(n: number): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(n || 0)
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

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
function monthLabelPl(key: string) { const [y, m] = key.split('-'); return `${MONTHS_PL[+m - 1]} ${y}` }

// Etapy cyklu życia repertuaru miesiąca: Planowanie → Zatwierdzenie → Konsultacje → Sprzedaż
// (definicje i derywacja w lib/repertoire-stage.ts)
type MonthStage = RepStage
interface MonthProp { id: string; label: string; stage: MonthStage; proposal_data: ProposalEvent[] }
const STAGE_CFG = STAGE_META

// ── Main page ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const { selectedTheatreId, setSelectedTheatreId } = useTheatre()
  const { planningHorizon } = useOrg()
  // Horyzont planowania per organizacja: bieżący + `planningHorizon` miesięcy do przodu
  // (TD planuje 2 mies., Fundacja 6). Steruje pickerem miesiąca i osią przeglądu.
  const allMonths = getNextMonths(planningHorizon + 1)
  // Bieżący miesiąc (YYYY-MM) — planujemy tylko miesiące przyszłe.
  const thisMonthKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  const [approvedMonths, setApprovedMonths] = useState<Set<string>>(new Set())
  const [proposalsByMonth, setProposalsByMonth] = useState<Record<string, MonthProp[]>>({})
  const [monthStatus,    setMonthStatus]    = useState<Record<string, MonthStage>>({})
  const [monthsReady,    setMonthsReady]    = useState(false)
  const [theatreName,    setTheatreName]    = useState<string>('')
  const [theatreCount,   setTheatreCount]   = useState<number | null>(null)
  // Miesiące bez grania (przerwa wakacyjna/remontowa) — Ustawienia → „Miesiące przerwy".
  // Lista numerów miesięcy, np. „7,8". Dotyczy tylko miesięcy bez propozycji.
  const [breakMonths,    setBreakMonths]    = useState<Set<number>>(new Set())
  // Karta generatora — cel przewijania po kliknięciu „Zaplanuj" (strona przewija
  // się w kontenerze <main>, więc window.scrollTo nic by nie dało).
  const genCardRef = useRef<HTMLDivElement>(null)
  const [genFlash, setGenFlash] = useState(false)
  const [pendingScrollToGen, setPendingScrollToGen] = useState(false)

  function planMonth(month: string) {
    setSelectedMonth(month)
    setActiveTab('gen')
    setGenFlash(true)
    setPendingScrollToGen(true)
    // Pierwsze przewinięcie od razu (natychmiastowe — 'smooth' bywa ignorowane,
    // m.in. w webview, i klik wygląda wtedy jakby nic nie zrobił).
    setTimeout(() => genCardRef.current?.scrollIntoView({ block: 'start' }), 40)
    setTimeout(() => setGenFlash(false), 1600)
  }


  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'break_months').maybeSingle()
      .then(({ data }) => {
        const raw = String((data as any)?.value ?? '')
        setBreakMonths(new Set(raw.split(',').map(x => parseInt(x.trim(), 10)).filter(n => n >= 1 && n <= 12)))
      })
  }, [])

  // Przegląd statusów: bieżący miesiąc + horyzont planowania organizacji
  const overviewMonths = getNextMonths(planningHorizon + 1)

  // Propozycje pogrupowane per miesiąc + status etapu — PER TEATR.
  // Planowanie jest procedowane osobno dla każdego teatru; legacy propozycje globalne
  // (theatre_id = null, sprzed podziału na teatry) pokazujemy dla obu teatrów.
  useEffect(() => {
    supabase.from('repertoire_proposals').select('id, month, label, status, stats, theatre_id, proposal_data').then(({ data }) => {
      const rel = (data ?? []).filter((p: any) =>
        p.status !== 'rejected' &&
        (!selectedTheatreId || p.theatre_id === selectedTheatreId || p.theatre_id == null))
      const byMonth: Record<string, MonthProp[]> = {}
      for (const p of rel as any[]) {
        const stage: MonthStage = proposalStage(p)
        ;(byMonth[p.month] ??= []).push({ id: p.id, label: p.label, stage, proposal_data: p.proposal_data ?? [] })
      }
      for (const k in byMonth) byMonth[k].sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.label.localeCompare(b.label, 'pl'))
      setProposalsByMonth(byMonth)
      const m: Record<string, MonthStage> = {}
      for (const mo of overviewMonths) {
        const ps = byMonth[mo.value] ?? []
        // Najbardziej zaawansowany etap miesiąca (najniższy STAGE_ORDER wśród nie-'brak')
        const isBreak = breakMonths.has(parseInt(mo.value.slice(5), 10))
        m[mo.value] = ps.length
          ? ps.reduce<MonthStage>((best, p) => STAGE_ORDER[p.stage] < STAGE_ORDER[best] ? p.stage : best, 'planowanie')
          : (isBreak ? 'przerwa' : 'brak')
      }
      setMonthStatus(m)
    })
  }, [selectedTheatreId, breakMonths])

  // Domyślnie planujemy dla Teatru Polonia — gdy wybrano „Wszystkie", przełącz na Polonię.
  // KPA może zmienić na Och-Teatr w menu po lewej.
  useEffect(() => {
    if (selectedTheatreId) return
    supabase.from('theatres').select('id, name').then(({ data }) => {
      const polonia = (data ?? []).find((t: any) => /polonia/i.test(t.name)) ?? (data ?? [])[0]
      if (polonia) setSelectedTheatreId(polonia.id)
    })
  }, [selectedTheatreId])

  // Liczba teatrów w org — steruje podpowiedziami o przełączniku (ukrywane przy 1 teatrze)
  useEffect(() => {
    supabase.from('theatres').select('id').then(({ data }) => setTheatreCount((data ?? []).length))
  }, [])

  // Fetch approved months + production cast data on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/planning/generate?status=approved').then(r => r.json()),
      // Tolerancyjnie na brak migracji 'stage' — ponów bez tej kolumny.
      (async () => {
        const sel = (s: boolean, l: boolean): string => `title, is_favourite, ${s ? 'stage, ' : ''}${l ? 'favourite_level, hit_level, ' : ''}price_category, artist_productions(artists(id, name))`
        let r = await supabase.from('productions').select(sel(true, true))
        if (r.error) r = await supabase.from('productions').select(sel(false, true))
        if (r.error) r = await supabase.from('productions').select(sel(false, false))
        return r
      })(),
    ]).then(([json, castRes]) => {
      // Approved months
      const approved = new Set<string>((json.proposals ?? []).map((p: Proposal) => p.month))
      setApprovedMonths(approved)
      setMonthsReady(true)

      // Build cast maps from Supabase
      const castMap  = new Map<string, string[]>()
      const nameMap  = new Map<string, string>()
      const favSet   = new Set<string>()
      const stages   = new Map<string, 'Duża' | 'Mała'>()
      const cats     = new Map<string, { fav: number; hit: number }>()
      for (const p of (castRes.data ?? []) as any[]) {
        const ids: string[] = []
        for (const ap of p.artist_productions ?? []) {
          const a = Array.isArray(ap.artists) ? ap.artists[0] : ap.artists
          if (a?.id) { ids.push(a.id); nameMap.set(a.id, a.name) }
        }
        castMap.set(p.title, ids)
        if ((p as any).is_favourite) favSet.add(p.title)
        stages.set(p.title, ((p as any).stage === 'mala' || (!(p as any).stage && (p as any).price_category === 'mala')) ? 'Mała' : 'Duża')
        cats.set(p.title, {
          fav: (p as any).favourite_level ?? ((p as any).is_favourite ? 1 : 0),
          hit: (p as any).hit_level ?? 0,
        })
      }
      setProductionCastMap(castMap)
      setArtistNamesMap(nameMap)
      setFavouriteSet(favSet)
      setStageMap(stages)
      setCatMap(cats)
    }).catch(() => setMonthsReady(true))
  }, [])

  // Zatwierdzone miesiące + nazwa — PER TEATR
  useEffect(() => {
    const url = selectedTheatreId
      ? `/api/planning/generate?status=approved&theatre=${selectedTheatreId}`
      : '/api/planning/generate?status=approved'
    fetch(url).then(r => r.json()).then(json => {
      const props = (json.proposals ?? []) as Proposal[]
      setApprovedMonths(new Set<string>(props.map(p => p.month)))
    }).catch(() => {})
    if (selectedTheatreId) {
      supabase.from('theatres').select('name').eq('id', selectedTheatreId).single()
        .then(({ data }) => setTheatreName(data?.name ?? ''))
    } else setTheatreName('')
  }, [selectedTheatreId])

  // Pomijamy miesiące przeszłe/bieżący oraz te z zatwierdzonym repertuarem.
  const months = allMonths.filter(mo => mo.value > thisMonthKey && !approvedMonths.has(mo.value))

  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [proposals,     setProposals]     = useState<Proposal[]>([])
  const [loading,       setLoading]       = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [constraints,   setConstraints]   = useState('')
  // Warunki generowania — domyślnie WSZYSTKIE OFF; KPA włącza świadomie te,
  // które mają wpłynąć na propozycje (Finanse ON → 4 warianty pod cele finansowe).
  const [cond, setCond] = useState({ slots: false, finance: false, core: false, extra: false })
  const [activeTab, setActiveTab] = useState<'gen' | 'finance' | 'core' | 'extra' | 'import'>('gen')
  const [expandedIds,   setExpandedIds]   = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [approveConfirm, setApproveConfirm] = useState<Proposal | null>(null)

  // Cast data for real conflict detection
  const [productionCastMap, setProductionCastMap] = useState<Map<string, string[]>>(new Map())
  const [artistNamesMap,    setArtistNamesMap]     = useState<Map<string, string>>(new Map())
  const [favouriteSet,      setFavouriteSet]       = useState<Set<string>>(new Set())
  const [stageMap,          setStageMap]           = useState<Map<string, 'Duża' | 'Mała'>>(new Map())
  const [catMap,            setCatMap]             = useState<Map<string, { fav: number; hit: number }>>(new Map())

  const [conflictModal, setConflictModal] = useState<{
    artistId: string; artistName: string; conflictDate: string;
    conflictStart?: string; conflictEnd?: string; productions: string[]
  } | null>(null)

  // Wybrany miesiąc pamiętany między wejściami w zakładkę (localStorage).
  // Po powrocie wraca ostatnio wybrany miesiąc, a nie pierwszy z listy.
  useEffect(() => {
    if (!monthsReady || selectedMonth) return
    const saved = typeof window !== 'undefined' ? localStorage.getItem(MONTH_STORE_KEY) : null
    const restored = saved && months.some(m => m.value === saved) ? saved : null
    const next = restored ?? months[0]?.value
    if (next) setSelectedMonth(next)
  }, [monthsReady])   // eslint-disable-line

  useEffect(() => {
    if (selectedMonth && typeof window !== 'undefined') localStorage.setItem(MONTH_STORE_KEY, selectedMonth)
  }, [selectedMonth])

  useEffect(() => {
    if (selectedMonth) loadProposals()
  }, [selectedMonth, selectedTheatreId])   // eslint-disable-line

  // Powtórz przewinięcie, gdy propozycje wybranego miesiąca się doładują — wtedy
  // wysokość strony się zmienia i pierwsze przewinięcie by uciekło.
  useEffect(() => {
    if (!pendingScrollToGen || loading) return
    const id = requestAnimationFrame(() => {
      genCardRef.current?.scrollIntoView({ block: 'start' })
      setPendingScrollToGen(false)
    })
    return () => cancelAnimationFrame(id)
  }, [pendingScrollToGen, loading, proposals])


  async function loadProposals() {
    setLoading(true)
    setError(null)
    try {
      const theatreParam = selectedTheatreId ? `&theatre=${selectedTheatreId}` : ''
      const r = await fetch(`/api/planning/generate?month=${selectedMonth}${theatreParam}`)
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

  // Składa tekst ograniczeń z włączonych warunków (CORE + założenia dodatkowe).
  async function buildComposedConstraints(): Promise<string> {
    const parts: string[] = []
    if (constraints.trim()) parts.push(constraints.trim())
    if (cond.core) {
      const r = await supabase.from('artists').select('id, name, is_core').eq('is_core', true)
      const core = r.error ? [] : (r.data ?? [])
      if (core.length) {
        const ids = core.map((a: any) => a.id)
        const start = `${selectedMonth}-01T00:00:00`, end = `${selectedMonth}-31T23:59:59`
        const { data: av } = await supabase.from('availabilities').select('artist_id, start_time, end_time')
          .in('artist_id', ids).lte('start_time', end).gte('end_time', start)
        const byId: Record<string, string> = Object.fromEntries(core.map((a: any) => [a.id, a.name]))
        const lines = ((av ?? []) as any[]).map(a => `${byId[a.artist_id]}: niedostępny ${a.start_time.slice(0, 10)}–${a.end_time.slice(0, 10)}`)
        if (lines.length) parts.push('Twarde blokady — aktorzy CORE niedostępni (nie obsadzaj ich w tych dniach):\n' + lines.join('\n'))
      }
    }
    if (cond.extra && selectedTheatreId) {
      const { data: asmp } = await supabase.from('planning_assumptions').select('text')
        .eq('theatre_id', selectedTheatreId).eq('active', true)
      const lines = ((asmp ?? []) as any[]).map(a => a.text)
      if (lines.length) parts.push('Założenia dodatkowe (twarde reguły):\n- ' + lines.join('\n- '))
    }
    return parts.join('\n\n')
  }

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const composed = await buildComposedConstraints()
      const endpoint = cond.finance ? '/api/planning/generate-options' : '/api/planning/generate'
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth, theatreId: selectedTheatreId,
          constraints: composed || undefined,
          useSlots: cond.slots, useCore: cond.core,
        }),
      })
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setConstraints('')
      await loadProposals()
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
      setApproveConfirm(null)
      await loadProposals()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Potwierdzenie zatwierdzenia repertuaru (bez powiadamiania obsady) */}
      {approveConfirm && (
        <SendConfirmModal
          title={`Zatwierdź repertuar — ${monthLabelPl(approveConfirm.month)}`}
          recipients={[]}
          content={`Repertuar „${approveConfirm.label}" na ${monthLabelPl(approveConfirm.month)} zostanie zatwierdzony, a spektakle trafią do kalendarza.`}
          note={'Obsada NIE jest jeszcze powiadamiana — powiadomienia i zbieranie potwierdzeń wyślesz w kolejnym etapie „Konsultacje".'}
          confirmLabel="Zatwierdź repertuar"
          sending={actionLoading === approveConfirm.id + 'approve'}
          allowEmpty
          onConfirm={() => handleAction(approveConfirm.id, 'approve')}
          onCancel={() => setApproveConfirm(null)}
        />
      )}

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

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4 px-4 py-4 -mx-4 -mt-4 md:px-8 md:py-5 md:-mx-8 md:-mt-8 mb-2"
        style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>Planowanie repertuaru</h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>
            Tutaj zaplanujesz repertuar. Stefan przygotuje dla Ciebie parę propozycji.<br />
            Wpisz poniżej Twoje potrzeby. Możesz zacząć od zaplanowania ulubionych spektakli (<Link href="/planning/slots" className="underline underline-offset-2" style={{ color: '#7a2020' }}>Fav Slots</Link>).
          </p>
        </div>
      </div>

      {/* ── Zakładki: Generowanie + edycja warunków ── */}
      <div className="flex gap-1.5 overflow-x-auto -mt-2 pb-1">
        {([
          ['gen', 'Generowanie'], ['slots', 'Sloty Favourites'], ['finance', 'Założenia finansowe'], ['core', 'Dostępność CORE'], ['extra', 'Założenia dodatkowe'], ['import', 'Import Excel'],
        ] as const).map(([k, lbl]) => (
          // „Sloty Favourites" prowadzi wprost do edytora slotów (bez ekranu pośredniego).
          k === 'slots' ? (
            <Link key={k} href="/planning/slots"
              className="px-3.5 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition-colors shrink-0"
              style={{ background: '#f2ede6', color: '#7a7068' }}>
              {lbl}
            </Link>
          ) : (
            <button key={k} onClick={() => setActiveTab(k)}
              className="px-3.5 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition-colors shrink-0"
              style={activeTab === k ? { background: '#1a1410', color: '#fff' } : { background: '#f2ede6', color: '#7a7068' }}>
              {lbl}
            </button>
          )
        ))}
      </div>

      {/* ── Zakładki edycji warunków ── */}
      {activeTab === 'finance' && <FinanceTab />}
      {activeTab === 'core'    && <CoreTab month={selectedMonth || thisMonthKey} />}
      {activeTab === 'extra'   && <ExtraTab theatreId={selectedTheatreId} theatreName={theatreName} />}
      {activeTab === 'import'  && <ExcelImportTab theatreId={selectedTheatreId} theatreName={theatreName} onScheduleImported={loadProposals} />}

      {activeTab === 'gen' && (<>

      {/* ── Controls ── */}
      <div ref={genCardRef}
        className="bg-white rounded-2xl p-5 space-y-4 transition-shadow"
        style={{
          scrollMarginTop: 72,   // pod przyklejony nagłówek
          ...(genFlash
            ? { border: '1px solid #c8102e', boxShadow: '0 0 0 4px rgba(200,16,46,0.12)' }
            : { border: '1px solid #e4ddd4' }),
        }}>
        {/* Warunki do uwzględnienia (zadanie 1) */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Uwzględnij warunki</label>
          <div className="flex gap-2 flex-wrap">
            {([
              ['slots', '♥', 'Sloty Favourites', '#ef4444'],
              ['finance', '◆', 'Założenia finansowe', '#34d399'],
              ['core', '★', 'Dostępność CORE', '#eab308'],
              ['extra', '▣', 'Założenia dodatkowe', '#60a5fa'],
            ] as const).map(([k, icon, lbl, color]) => {
              const on = cond[k]
              return (
                <button key={k} type="button" onClick={() => setCond(c => ({ ...c, [k]: !c[k] }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors"
                  style={on
                    ? { borderColor: '#1a1410', background: '#1a1410', color: '#fff' }
                    : { borderColor: '#e4ddd4', background: '#fff', color: '#a89e92' }}>
                  <span style={{ color: on ? color : '#cec5b8' }}>{icon}</span>
                  {lbl}
                  <span className="ml-0.5 text-[9px] font-bold" style={{ color: on ? color : '#cec5b8' }}>{on ? 'ON' : 'OFF'}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex gap-3 items-end flex-wrap">

          {/* Month picker — only months without approved repertoire */}
          <div className="w-full sm:w-52 shrink-0">
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Miesiąc</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              disabled={!monthsReady || months.length === 0}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#cbbfb0] focus:border-[#cbbfb0] disabled:opacity-50" style={{ border: '1px solid #e4ddd4', color: '#3e3830' }}
            >
              {months.length === 0
                ? <option value="">Wszystkie miesiące zatwierdzone</option>
                : months.map(mo => <option key={mo.value} value={mo.value}>{mo.label}</option>)
              }
            </select>
          </div>

          {/* Constraints */}
          <div className="flex-1 min-w-[220px] sm:min-w-[260px] w-full sm:w-auto">
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Dodatkowe ograniczenia <span className="normal-case font-normal" style={{ color: '#a89e92' }}>(opcjonalne)</span></label>
            <input
              type="text"
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !generating && handleGenerate()}
              placeholder="np. Hamlet min. 4 razy, bez środowego grania w 1. tygodniu…"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#cbbfb0] focus:border-[#cbbfb0]" style={{ border: '1px solid #e4ddd4', color: '#3e3830' }}
            />
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating || !selectedTheatreId}
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
                Generowanie
              </>
            )}
          </button>

          {/* Wdrożenie — obok Generowanie */}
          <Link
            href="/planning/implementation"
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors shrink-0"
            style={{ background: '#fff', border: '1px solid #e4ddd4', color: '#7a7068' }}
          >
            ✓ Wdrożenie
          </Link>
        </div>
        <p className="text-[11px] -mt-2" style={{ color: '#a89e92' }}>
          Planujesz: <b style={{ color: '#7a2020' }}>{theatreName || 'Teatr Polonia'}</b>{(theatreCount ?? 0) > 1 ? ' (zmień teatr w menu po lewej)' : ''}. Włączone warunki powyżej zostaną uwzględnione przy generowaniu{cond.finance ? ' (Finanse ON → 4 warianty pod cele finansowe)' : ' (1 propozycja)'}.
        </p>

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

      {/* ── Status repertuarów — pionowa oś (horyzont planowania org) ── */}
      <div className="bg-white rounded-2xl border border-[#e4ddd4] p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>Status repertuarów — najbliższe {Math.max(1, overviewMonths.length - 1)} {overviewMonths.length - 1 === 1 ? 'miesiąc' : (overviewMonths.length - 1) < 5 ? 'miesiące' : 'miesięcy'}</p>
          <div className="flex items-center gap-3 flex-wrap">
            {(['planowanie', 'zatwierdzenie', 'konsultacje', 'sprzedaz', 'przerwa'] as MonthStage[]).map(s => (
              <span key={s} className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#7a7068' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: STAGE_CFG[s].dot }} />
                {STAGE_CFG[s].label}
              </span>
            ))}
          </div>
        </div>

        <div className="divide-y" style={{ borderColor: '#f2ede6' }}>
          {overviewMonths.map(mo => {
            const st = monthStatus[mo.value] ?? 'brak'
            const cfg = STAGE_CFG[st]
            const isCurrent = mo.value === thisMonthKey
            const props = proposalsByMonth[mo.value] ?? []
            const isApprovedMonth = isApprovedStage(st)
            const approvedProp = props.find(p => isApprovedStage(p.stage))
            return (
              <div key={mo.value} className="py-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
                style={isCurrent ? { background: 'linear-gradient(90deg,#faf8f5,transparent)' } : undefined}>
                {/* Miesiąc + etap (lewa kolumna) */}
                <div className="sm:w-52 shrink-0 flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>
                      {mo.label}{isCurrent && <span className="ml-1.5 text-[10px] font-normal" style={{ color: '#a89e92' }}>• teraz</span>}
                    </p>
                    <p className="text-[11px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
                  </div>
                </div>

                {/* Propozycje obok siebie (prawa część) */}
                <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                  {props.length === 0 ? (
                    st === 'przerwa' ? (
                      // Przerwa: nie proponujemy planowania, tylko wyjaśniamy stan.
                      <span className="text-xs italic self-center" style={{ color: '#8b98a8' }}>
                        Przerwa — w tym miesiącu teatr nie gra.
                      </span>
                    ) : mo.value > thisMonthKey ? (
                      <button type="button"
                        onClick={() => planMonth(mo.value)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors self-center hover:opacity-90"
                        style={{ background: '#1a1410', color: '#fff' }}
                        title={`Zaplanuj repertuar — ${mo.label}`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="9" r="2" fill="currentColor" stroke="none"/></svg>
                        Zaplanuj
                      </button>
                    ) : (
                      <span className="text-xs italic self-center" style={{ color: '#bdb4a8' }}>Brak propozycji</span>
                    )
                  ) : isApprovedMonth && approvedProp ? (
                    <Link href={`/planning/${approvedProp.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors self-center hover:opacity-90"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      Zobacz repertuar
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </Link>
                  ) : props.map(p => {
                    const pc = STAGE_CFG[p.stage]
                    const pillLabel = p.stage === 'planowanie' ? 'Robocza' : pc.label
                    // Konflikty obsady — ta sama logika co na pulpicie (detectProposalConflicts).
                    // Dla roboczych liczymy z danych propozycji; zatwierdzone pomijamy.
                    const conflictCount = p.stage === 'planowanie' && productionCastMap.size > 0
                      ? detectProposalConflicts(p.proposal_data ?? [], productionCastMap, artistNamesMap).length
                      : 0
                    return (
                      <div key={p.id} className="rounded-xl border px-3 py-2 flex flex-col gap-1.5 min-w-[148px]" style={{ borderColor: '#e4ddd4', background: '#faf8f5' }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold" style={{ color: '#1a1410' }}>{p.label} <span style={{ color: '#a89e92', fontWeight: 500 }}>/ {monthLabelPl(mo.value)}</span></span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: pc.bg, color: pc.color }}>{pillLabel}</span>
                        </div>
                        {conflictCount > 0 && (
                          <Link href={`/planning/${p.id}`}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md self-start hover:opacity-90 transition-opacity"
                            style={{ background: '#fff0f0', color: '#c8102e', border: '1px solid #fecaca' }}
                            title="Pokaż konflikty obsady w podglądzie">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            {conflictCount} {conflictCount === 1 ? 'konflikt obsady' : conflictCount < 5 ? 'konflikty obsady' : 'konfliktów obsady'}
                          </Link>
                        )}
                        <div className="flex items-center gap-3">
                          <Link href={`/planning/${p.id}`} className="text-[11px] font-medium hover:underline" style={{ color: '#7a7068' }}>Podgląd</Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
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
        <>
          {/* Porównanie harmonogramów — rozwiń/zwiń wszystkie naraz */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <p className="text-xs" style={{ color: '#a89e92' }}>
              {proposals.length} {proposals.length === 1 ? 'propozycja' : 'propozycje'} — rozwiń harmonogramy, by porównać obok siebie
            </p>
            <button
              onClick={() => setExpandedIds(prev => prev.size === proposals.length ? new Set() : new Set(proposals.map(p => p.id)))}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ border: '1px solid #e4ddd4', color: '#7a7068' }}>
              {expandedIds.size === proposals.length ? 'Zwiń wszystkie' : 'Rozwiń wszystkie (porównaj)'}
            </button>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
            {proposals.map(p => (
              <ProposalCard
                key={p.id}
                proposal={p}
                expanded={expandedIds.has(p.id)}
                onToggle={() => setExpandedIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                onApprove={() => setApproveConfirm(p)}
                onReject={() => handleAction(p.id, 'reject')}
                actionLoading={actionLoading}
                productionCastMap={productionCastMap}
                artistNamesMap={artistNamesMap}
                favouriteSet={favouriteSet}
                stageMap={stageMap}
                catMap={catMap}
                onConflictClick={setConflictModal}
              />
            ))}
          </div>
        </>
      )}

      </>)}
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
  productionCastMap, artistNamesMap, favouriteSet, stageMap, catMap, onConflictClick,
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
  stageMap:          Map<string, 'Duża' | 'Mała'>
  catMap:            Map<string, { fav: number; hit: number }>
  onConflictClick: (params: {
    artistId: string; artistName: string; conflictDate: string;
    conflictStart?: string; conflictEnd?: string; productions: string[]
  }) => void
}) {
  const stage  = proposalStage(proposal)
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
              <span className="text-base font-bold" style={{ color: '#1a1410' }}>{proposal.label} <span style={{ color: '#a89e92', fontWeight: 500 }}>/ {monthLabelPl(proposal.month)}</span></span>
              {proposal.status === 'rejected' ? (
                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide ${STATUS_CFG.rejected.cls}`}>
                  {STATUS_CFG.rejected.label}
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide"
                  style={{ background: STAGE_CFG[stage].bg, color: STAGE_CFG[stage].color }}>
                  {stage === 'planowanie' ? 'Propozycja' : STAGE_CFG[stage].label}
                </span>
              )}
            </div>
            {proposal.reasoning && (
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#7a7068' }}>{proposal.reasoning}</p>
            )}
          </div>
        </div>

        {/* Finance KPIs (opcje finansowe) */}
        {stats.finance && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            <FinKpi label="Przychód" value={fmtPlnShort(stats.finance.revenue)} color="#15803d" />
            <FinKpi label="Koszt" value={fmtPlnShort(stats.finance.cost)} color="#b45309" />
            <FinKpi label="Dochód" value={fmtPlnShort(stats.finance.margin)} color={stats.finance.margin >= 0 ? '#15803d' : '#c8102e'} />
            <FinKpi label="Śr. frekw." value={`${Math.round((stats.finance.attendance || 0) * 100)}%`} color="#1a1410" />
          </div>
        )}

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
                    <CategoryMarks favLevel={catMap.get(e.production_title)?.fav ?? 0} hitLevel={catMap.get(e.production_title)?.hit ?? 0} size={10} />
                    <span className="truncate">{e.production_title}</span>
                    {stageMap.get(e.production_title) && (
                      <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                        style={stageMap.get(e.production_title) === 'Mała'
                          ? { background: '#eef2ff', color: '#4338ca' }
                          : { background: '#f2ede6', color: '#7a7068' }}>
                        {stageMap.get(e.production_title)} scena
                      </span>
                    )}
                  </span>
                  {partnerConflict && (
                    <span className="text-[10px] shrink-0 font-medium flex items-center gap-0.5 flex-wrap" style={{ color: '#c8102e' }}>
                      {partnerConflict.artistNames.slice(0, 2).map((name, ni) => {
                        const id = partnerConflict.artistIds[ni]
                        return (
                          <button
                            key={ni}
                            type="button"
                            onClick={() => id && onConflictClick({
                              artistId: id,
                              artistName: name,
                              conflictDate: partnerConflict.date,
                              conflictStart: partnerConflict.productions[0]?.start_time,
                              conflictEnd:   e.end_time?.slice(0,5),
                              productions:   partnerConflict.productions.map(p => p.title),
                            })}
                            className={`underline underline-offset-2 ${id ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
                            title={`Konflikt: ${name} — kliknij aby rozwiązać`}
                          >
                            {ni > 0 && <span style={{ textDecoration: 'none' }}>, </span>}
                            {name.split(' ').pop()}
                          </button>
                        )
                      })}
                      {partnerConflict.artistNames.length > 2 && (
                        <span style={{ textDecoration: 'none' }}> +{partnerConflict.artistNames.length - 2}</span>
                      )}
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
          <div className="px-5 py-3 flex items-center gap-2 border-t"
            style={{ background: STAGE_CFG[stage].bg + '55', borderColor: STAGE_CFG[stage].bg }}>
            <p className="flex-1 text-xs font-semibold" style={{ color: STAGE_CFG[stage].color }}>
              {stage === 'zatwierdzenie' && `✓ Zatwierdzono — czeka na konsultacje z obsadą`}
              {stage === 'konsultacje'   && `Konsultacje w toku (obsada + Technika + Sprzedaż)`}
              {stage === 'sprzedaz'      && `Sprzedaż uruchomiona`}
            </p>
            <Link
              href={`/planning/${proposal.id}`}
              className="flex items-center gap-1 text-xs font-semibold hover:opacity-80 transition-opacity"
              style={{ color: STAGE_CFG[stage].color }}
            >
              {stage === 'sprzedaz' ? 'Zobacz' : 'Zarządzaj etapem'}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
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

function FinKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: '#faf8f5', border: '1px solid #f2ede6' }}>
      <p className="text-[9px] uppercase tracking-wide" style={{ color: '#a89e92' }}>{label}</p>
      <p className="text-xs font-bold leading-tight" style={{ color }}>{value}</p>
    </div>
  )
}
