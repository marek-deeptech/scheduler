'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EventModal from '@/components/EventModal'
import { EVENT_TYPE_CATEGORIES } from '@/types'
import {
  CATEGORY_DEFAULTS, DEFAULT_PARAMS, stageCapacity, costForStage, stageLabel, scenesForTheatre, asp, fmtPln, fmtPct,
  DEFAULT_ZONES, defaultTicketTypes, zonesFromPricing, ticketTypesFromPricing, zoneLabel,
  aspFromTypes, effectivePrice, baseNormalPrice, type PriceZone, type TicketType, type TicketMode,
  type PriceCategory, type Stage,
} from '@/lib/finance'

interface Theatre { id: string; name: string }
interface Room    { id: string; theatre_id: string; name: string }

interface ArtistRecord {
  id: string
  name: string
  role: string | null
  teams?: { name: string } | null
}

interface ProductionRecord {
  id: string
  title: string
  director: string | null
  premiere_date: string | null
  start_date: string | null
  end_date: string | null
  theatre_id: string | null
  status: string | null
  location_type?: string | null
  comment?: string | null
  is_favourite?: boolean | null
  favourite_level?: number | null
  hit_level?: number | null
}

interface EventRecord {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  location: string | null
  room_id: string | null
  production_id: string | null
  theatre_id: string | null
  event_artists?: { artist_id: string }[]
}

interface Props {
  production: ProductionRecord | null  // null = create mode
  theatres: Theatre[]
  rooms: Room[]
  artists: ArtistRecord[]
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTIONS = ['Bieżące', 'Planowane', 'Archiwalne']

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
const labelCls = 'block text-sm font-medium text-gray-500 mb-1.5'

/* ── Event type helpers ────────────────────────────────────────── */
const TYPE_CATEGORY_COLOR: Record<string, string> = {
  'Próby':         'bg-gray-100 text-gray-600',
  'Przygotowania': 'bg-gray-100 text-gray-600',
  'Spektakle':     'bg-gray-100 text-gray-600',
  'Media / PR':    'bg-gray-100 text-gray-600',
  'Organizacyjne': 'bg-gray-100 text-gray-600',
}

function typeCategory(type: string | null): string {
  if (!type) return 'Organizacyjne'
  for (const [cat, types] of Object.entries(EVENT_TYPE_CATEGORIES)) {
    if (types.includes(type)) return cat
  }
  return 'Organizacyjne'
}

function typeBadgeColor(type: string | null) {
  return TYPE_CATEGORY_COLOR[typeCategory(type)] ?? 'bg-gray-100 text-gray-600'
}

function pad(n: number) { return String(n).padStart(2, '0') }

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: '#a89e92' }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: accent ?? '#1a1410' }}>{value}</p>
    </div>
  )
}

/* ── Wybór poziomu kategorii (Favourite / Hit Kasowy) ──────────── */
function LevelPicker({ kind, label, hint, value, onChange }: {
  kind: 'fav' | 'hit'; label: string; hint: string; value: number; onChange: (v: number) => void
}) {
  const color  = kind === 'fav' ? '#ef4444' : '#15803d'
  const active = value > 0
  const iconColor = active ? color : '#cbd5e1'
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2"
      style={{ border: active ? `1.5px solid ${kind === 'fav' ? '#fca5a5' : '#86efac'}` : '1px solid #e5e7eb', background: active ? (kind === 'fav' ? '#fff1f2' : '#f0fdf4') : '#f9fafb' }}>
      <span className="shrink-0">
        {kind === 'fav' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? iconColor : 'none'} stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20"/>
            <path d="M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.7 7 6.8c0 5 10 2.6 10 7.7 0 2.1-2.2 3.3-5 3.3s-5-1.1-5-3.2"/>
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>{label}</p>
        <p className="text-[11px]" style={{ color: '#9ca3af' }}>{hint}</p>
      </div>
      <div className="flex p-0.5 bg-gray-100 rounded-lg shrink-0">
        {[0, 1, 2, 3].map(lvl => (
          <button key={lvl} type="button" onClick={() => onChange(lvl)}
            title={lvl === 0 ? 'Brak kategorii' : `Poziom ${lvl}`}
            className={`w-8 py-1.5 text-xs font-bold rounded-md transition-colors ${value === lvl ? 'bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            style={value === lvl && lvl > 0 ? { color } : undefined}>
            {lvl === 0 ? '—' : lvl}
          </button>
        ))}
      </div>
    </div>
  )
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

function fmtTime(iso: string) {
  return String(iso).slice(11, 16)  // ściana zegara (UTC) = czas Warszawa; bez przesunięcia strefy
}

/* ── Component ─────────────────────────────────────────────────── */
export default function ProductionModal({ production, theatres, rooms, artists, onClose, onSaved }: Props) {
  const isEdit = !!production

  const [form, setForm] = useState({
    title:         production?.title         ?? '',
    director:      production?.director      ?? '',
    theatre_id:    production?.theatre_id    ?? '',
    status:        production?.status        ?? 'Bieżące',
    location_type: production?.location_type ?? 'Na miejscu',
    premiere_date: production?.premiere_date ?? '',
    start_date:    production?.start_date    ?? '',
    end_date:      production?.end_date      ?? '',
    comment:       production?.comment       ?? '',
    favourite_level: production?.favourite_level ?? (production?.is_favourite ? 1 : 0),
    hit_level:       production?.hit_level       ?? 0,
  })
  const [assignedIds, setAssignedIds] = useState<string[]>([])
  const [events,      setEvents]      = useState<EventRecord[]>([])
  const [eventModal,  setEventModal]  = useState<EventRecord | null | undefined>(undefined)
  // undefined = closed, null = create, EventRecord = edit
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<'details' | 'team' | 'calendar' | 'finance'>('details')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [delText,       setDelText]       = useState('')

  // Parametry finansowe (ładowane z bazy w trybie edycji)
  const [fin, setFin] = useState({
    stage:         'duza' as Stage,
    priceCategory: 'standard' as PriceCategory,
    priceNormal:     '' as string,
    priceReduced:    '' as string,
    priceLastMinute: '' as string,
    attendancePct:   '75' as string,  // % w UI, zapis jako 0–1
    fixedCost:       '8000' as string,
    setupDays:       '0' as string,    // montaż scenografii (dni robocze)
    teardownDays:    '0' as string,    // demontaż scenografii (dni robocze)
  })
  // Strefy cenowe widowni (Strefa I–III). Średnie ważone z nich trafiają do
  // price_normal / price_reduced, więc prognoza finansowa liczy się jak dotąd.
  const [zones, setZones] = useState<PriceZone[]>(() => DEFAULT_ZONES.map(z => ({ ...z })))
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>(() => defaultTicketTypes(0, 0, 0))
  const [pricingRaw, setPricingRaw] = useState<Record<string, unknown>>({})
  const zoneShareSum   = Math.round(zones.reduce((s, z) => s + (z.share || 0), 0) * 100)
  const typeShareSum   = Math.round(ticketTypes.reduce((s, t) => s + (t.share || 0), 0) * 100)
  const baseNormal     = baseNormalPrice(ticketTypes, zones)
  const computedAsp    = aspFromTypes(ticketTypes, zones)

  // Pojemność sceny tytułu — do podglądu progu rentowności
  const previewCapacity = stageCapacity(fin.stage, form.theatre_id || null)

  const previewAsp = computedAsp
  const previewRevenueFull = Math.round(previewCapacity * (parseFloat(fin.attendancePct) / 100 || 0)) * previewAsp
  const previewMargin = previewRevenueFull - (parseFloat(fin.fixedCost) || 0)

  // Load existing actor assignments in edit mode
  useEffect(() => {
    if (!production) return
    supabase
      .from('artist_productions')
      .select('artist_id')
      .eq('production_id', production.id)
      .then(({ data }) => setAssignedIds((data ?? []).map(r => r.artist_id)))
  }, [production?.id])

  // Load events for this production in edit mode
  useEffect(() => {
    if (!production) return
    loadEvents()
  }, [production?.id])

  // Load financial params in edit mode (tolerant — gdy brak migracji finansowej)
  useEffect(() => {
    if (!production) return
    // Tolerancyjnie na brak migracji 'stage' — ponów bez tej kolumny.
    ;(async () => {
      const sel = (withStage: boolean): string => `${withStage ? 'stage, ' : ''}price_category, price_normal, price_reduced, price_last_minute, assumed_attendance, fixed_cost, pricing`
      const first = await supabase.from('productions').select(sel(true)).eq('id', production.id).single()
      const { data } = first.error
        ? await supabase.from('productions').select(sel(false)).eq('id', production.id).single()
        : first
      if (!data) return
      // Kategoria 'mala' wycofana — mapujemy na 'standard' (scena jest osobnym polem).
      const cat: PriceCategory = (data as any).price_category === 'premium' ? 'premium' : 'standard'
      // Klucz sceny zapisany wprost; brak → 'mala' gdy stara kategoria 'mala', inaczej 'duza'.
      const stage: Stage = (data as any).stage
        ?? ((data as any).price_category === 'mala' ? 'mala' : 'duza')
      const def = CATEGORY_DEFAULTS[cat] ?? CATEGORY_DEFAULTS.standard
      setFin(f => ({
        ...f,
        stage,
        priceCategory:   cat,
        priceNormal:     String((data as any).price_normal      ?? def.normal),
        priceReduced:    String((data as any).price_reduced     ?? def.reduced),
        priceLastMinute: String((data as any).price_last_minute ?? def.lastMinute),
        attendancePct:   String(Math.round(((data as any).assumed_attendance ?? 0.75) * 100)),
        fixedCost:       String((data as any).fixed_cost ?? 8000),
      }))
      const rawPricing = ((data as any).pricing ?? {}) as Record<string, unknown>
      setPricingRaw(rawPricing)
      const zs = zonesFromPricing(rawPricing)
      setZones(zs)
      setTicketTypes(ticketTypesFromPricing(
        rawPricing, zs,
        Number((data as any).price_normal)      || def.normal,
        Number((data as any).price_reduced)     || def.reduced,
        Number((data as any).price_last_minute) || def.lastMinute,
      ))
    })()
  }, [production?.id])

  // Poziomy kategorii (tolerancyjnie na brak migracji categories)
  useEffect(() => {
    if (!production) return
    supabase.from('productions').select('favourite_level, hit_level').eq('id', production.id).single()
      .then(({ data, error }) => {
        if (error || !data) return
        setForm(f => ({
          ...f,
          favourite_level: (data as any).favourite_level ?? f.favourite_level,
          hit_level:       (data as any).hit_level       ?? 0,
        }))
      })
  }, [production?.id])

  // Montaż / demontaż (tolerancyjnie — gdy brak migracji setup-teardown)
  useEffect(() => {
    if (!production) return
    supabase.from('productions').select('setup_days, teardown_days').eq('id', production.id).single()
      .then(({ data, error }) => {
        if (error || !data) return
        setFin(f => ({
          ...f,
          setupDays:    String((data as any).setup_days    ?? 0),
          teardownDays: String((data as any).teardown_days ?? 0),
        }))
      })
  }, [production?.id])

  // Zmiana sceny podstawia sugerowany koszt ryczałtowy (pojemność liczy się automatycznie)
  function applyStage(stage: Stage) {
    setFin(f => ({ ...f, stage, fixedCost: String(costForStage(stage, form.theatre_id || null)) }))
  }

  async function loadEvents() {
    if (!production) return
    const { data } = await supabase
      .from('events')
      .select('id, title, type, start_time, end_time, location, room_id, production_id, theatre_id, event_artists(artist_id)')
      .eq('production_id', production.id)
      .order('start_time')
    setEvents((data ?? []) as EventRecord[])
  }

  function toggleActor(id: string) {
    setAssignedIds(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      title:         form.title,
      director:      form.director      || null,
      theatre_id:    form.theatre_id    || null,
      status:        form.status        || null,
      location_type: form.location_type || 'Na miejscu',
      premiere_date: form.premiere_date || null,
      start_date:    form.start_date    || null,
      end_date:      form.end_date      || null,
      comment:       form.comment       || null,
      is_favourite:  form.favourite_level > 0,   // zsynchronizowane z poziomem (zgodność z planowaniem)
    }

    let productionId = production?.id ?? null

    if (isEdit && production) {
      const { error: updateErr } = await supabase.from('productions').update(payload).eq('id', production.id)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      productionId = production.id
    } else {
      const { data: newProd, error: insertErr } = await supabase.from('productions').insert(payload).select().single()
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      productionId = newProd?.id ?? null
    }

    // Sync actors
    if (productionId) {
      const pid = productionId
      await supabase.from('artist_productions').delete().eq('production_id', pid)
      if (assignedIds.length > 0) {
        const { error: apErr } = await supabase.from('artist_productions').insert(
          assignedIds.map(artist_id => ({ production_id: pid, artist_id }))
        )
        if (apErr) { setError(apErr.message); setSaving(false); return }
      }
    }

    // Zapis parametrów finansowych — osobno, tolerancyjnie (gdy brak migracji)
    if (productionId) {
      const financePayload = {
        stage:              fin.stage,
        price_category:     fin.priceCategory,
        price_normal:       baseNormal || null,
        price_reduced:      effectivePrice(ticketTypes.find(t => t.mode === 'zones' && t.id !== ticketTypes.find(x => x.mode === 'zones')?.id) ?? ticketTypes[1] ?? ticketTypes[0], zones, baseNormal) || null,
        price_last_minute:  parseFloat(fin.priceLastMinute) || null,
        assumed_attendance: (parseFloat(fin.attendancePct) || 0) / 100,
        fixed_cost:         parseFloat(fin.fixedCost) || 0,
      }
      const { error: finErr } = await supabase.from('productions').update(financePayload).eq('id', productionId)
      if (finErr) console.warn('Zapis parametrów finansowych pominięty (czy migracja finansowa uruchomiona?):', finErr.message)

      // Strefy cenowe — w kolumnie `pricing` (jsonb); metadane cennika zachowane.
      const { error: zoneErr } = await supabase.from('productions')
        .update({ pricing: { ...pricingRaw, zones, ticketTypes, asp: computedAsp } }).eq('id', productionId)
      if (zoneErr) console.warn('Zapis stref cenowych pominięty (brak kolumny pricing?):', zoneErr.message)

      // Poziomy kategorii — osobno i tolerancyjnie (gdy brak migracji categories)
      const { error: catErr } = await supabase.from('productions')
        .update({ favourite_level: form.favourite_level, hit_level: form.hit_level }).eq('id', productionId)
      if (catErr) console.warn('Zapis kategorii (favourite_level/hit_level) pominięty — uruchom supabase-migration-categories.sql:', catErr.message)

      // Montaż / demontaż — osobno i tolerancyjnie (gdy brak migracji setup-teardown)
      const { error: stErr } = await supabase.from('productions')
        .update({ setup_days: parseInt(fin.setupDays) || 0, teardown_days: parseInt(fin.teardownDays) || 0 }).eq('id', productionId)
      if (stErr) console.warn('Zapis montażu/demontażu pominięty — uruchom supabase-migration-setup-teardown.sql:', stErr.message)
    }

    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    // Świadome potwierdzenie: tytuł musi być wpisany dokładnie.
    if (!production || delText.trim() !== production.title.trim()) return
    setDeleting(true)
    const pid = production.id
    // Delete child records in order: event_artists → events → artist_productions → production
    const { data: evs } = await supabase.from('events').select('id').eq('production_id', pid)
    if (evs && evs.length > 0) {
      const ids = evs.map((e: { id: string }) => e.id)
      await supabase.from('event_artists').delete().in('event_id', ids)
      await supabase.from('events').delete().eq('production_id', pid)
    }
    await supabase.from('artist_productions').delete().eq('production_id', pid)
    await supabase.from('productions').delete().eq('id', pid)
    setDeleting(false)
    onSaved()
  }

  // Artists with team info for EventModal
  const artistsForEvent = artists.map(a => ({
    id: a.id,
    name: a.name,
    teams: a.teams ?? null,
  }))

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edytuj tytuł' : 'Nowy tytuł'}
          </h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-600 transition-colors text-2xl">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 shrink-0 border-b border-gray-100">
          {([['details', 'Szczegóły'], ['team', 'Zespół'], ['calendar', 'Kalendarz'], ['finance', 'Finanse']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                tab === key ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

         {tab === 'details' && (<>
          {/* ── Basic info ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Tytuł *</label>
              <input
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className={inputCls}
                placeholder="np. Hamlet"
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Kategorie <span className="font-normal text-gray-400">— poziom 1–3 ustawia koordynator</span></label>
              <div className="space-y-2">
                <LevelPicker kind="fav" label="Favourite" hint="prestiżowy tytuł — priorytet w planowaniu"
                  value={form.favourite_level} onChange={v => setForm(f => ({ ...f, favourite_level: v }))} />
                <LevelPicker kind="hit" label="Hit Kasowy" hint="najbardziej dochodowy tytuł"
                  value={form.hit_level} onChange={v => setForm(f => ({ ...f, hit_level: v }))} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Reżyser</label>
              <input
                value={form.director}
                onChange={e => setForm(f => ({ ...f, director: e.target.value }))}
                className={inputCls}
                placeholder="np. Jan Kowalski"
              />
            </div>
            <div>
              <label className={labelCls}>Teatr</label>
              <select
                value={form.theatre_id}
                onChange={e => {
                  const tid = e.target.value
                  setForm(f => ({ ...f, theatre_id: tid }))
                  // Reset sceny do 1. sceny nowego teatru, jeśli obecna nie należy do niego.
                  const scenes = scenesForTheatre(tid || null)
                  setFin(f => scenes.some(s => s.key === f.stage)
                    ? f
                    : { ...f, stage: scenes[0].key, fixedCost: String(scenes[0].fixedCost) })
                }}
                className={inputCls}
              >
                <option value="">Wybierz teatr</option>
                {theatres.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Scena</label>
              <div className="flex p-0.5 bg-gray-100 rounded-xl">
                {scenesForTheatre(form.theatre_id || null).map(sc => (
                  <button
                    key={sc.key}
                    type="button"
                    onClick={() => applyStage(sc.key)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-[10px] transition-colors ${
                      fin.stage === sc.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                Tytuł gra na jednej scenie (unikalna scenografia) — ustawia pojemność widowni i sugerowany koszt.
              </p>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Scenografia — montaż / demontaż <span className="font-normal text-gray-400">(dni robocze)</span></label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="number" min={0} step={1}
                    value={fin.setupDays}
                    onChange={e => setFin(f => ({ ...f, setupDays: e.target.value }))}
                    className={inputCls}
                    placeholder="Montaż"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Montaż — dni na postawienie scenografii przed 1. spektaklem.</p>
                </div>
                <div>
                  <input
                    type="number" min={0} step={1}
                    value={fin.teardownDays}
                    onChange={e => setFin(f => ({ ...f, teardownDays: e.target.value }))}
                    className={inputCls}
                    placeholder="Demontaż"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Demontaż — po ostatnim spektaklu scena zablokowana tyle dni.</p>
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className={inputCls}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Typ produkcji</label>
              <div className="flex p-0.5 bg-gray-100 rounded-xl">
                {(['Na miejscu', 'Na wyjeździe'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, location_type: opt }))}
                    className={`flex-1 py-2 text-xs font-semibold rounded-[10px] transition-colors ${
                      form.location_type === opt
                        ? opt === 'Na wyjeździe'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt === 'Na wyjeździe' ? '✈ Na wyjeździe' : 'Na miejscu'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Premiera</label>
              <input
                type="date"
                value={form.premiere_date}
                onChange={e => setForm(f => ({ ...f, premiere_date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Data rozpoczęcia</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Data zakończenia</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Comment ── */}
          <div>
            <label className={labelCls}>Komentarz / notatki</label>
            <textarea
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              rows={3}
              className={inputCls + ' resize-none'}
              placeholder="Dodatkowe informacje o produkcji..."
            />
          </div>
         </>)}

         {tab === 'team' && (
          artists.length === 0 ? (
            <p className="text-xs text-gray-500 italic">Brak osób w bazie</p>
          ) : (
            <div className="space-y-5">
              {([
                { key: 'Cast',      label: 'Artyści'  },
                { key: 'Technique', label: 'Technika' },
                { key: 'Wardrobe',  label: 'Garderoba'},
              ] as const).map(({ key, label }) => {
                const group     = artists.filter(a => (Array.isArray(a.teams) ? a.teams[0] : a.teams)?.name === key)
                const noTeam    = key === 'Cast' ? artists.filter(a => !(Array.isArray(a.teams) ? a.teams[0] : a.teams)?.name) : []
                const inGroup   = [...group, ...noTeam]
                const inAssigned  = inGroup.filter(a =>  assignedIds.includes(a.id))
                const inAvailable = inGroup.filter(a => !assignedIds.includes(a.id))
                if (inGroup.length === 0) return null
                return (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <div className="flex flex-col gap-1">
                      {inAssigned.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{a.name}</span>
                            {a.role && <span className="ml-2 text-xs text-gray-500">{a.role}</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleActor(a.id)}
                            className="w-5 h-5 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-red-500 transition-colors text-xs font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {inAvailable.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
                          <div>
                            <span className="text-sm text-gray-500">{a.name}</span>
                            {a.role && <span className="ml-2 text-xs text-gray-500">{a.role}</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleActor(a.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold transition-colors"
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
         )}

         {tab === 'calendar' && (
          !isEdit ? (
            <p className="text-xs text-gray-500 italic">Zapisz tytuł, aby dodawać próby, spektakle i wydarzenia.</p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + ' mb-0'}>Spektakle, próby i wydarzenia</label>
                <button
                  type="button"
                  onClick={() => setEventModal(null)}
                  className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                >
                  + Dodaj wydarzenie
                </button>
              </div>

              {events.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-2">Brak wydarzeń. Kliknij „Dodaj wydarzenie", aby zaplanować próbę, spektakl lub inne wydarzenie.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {events.map(ev => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setEventModal(ev)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors text-left w-full"
                    >
                      {/* Type badge */}
                      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${typeBadgeColor(ev.type)}`}>
                        {ev.type ?? 'Wydarzenie'}
                      </span>

                      {/* Date + time */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {ev.title !== ev.type ? ev.title : ''}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {fmtDate(ev.start_time)} · {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </p>
                      </div>

                      {/* Participant count */}
                      {(ev.event_artists?.length ?? 0) > 0 && (
                        <span className="shrink-0 text-[11px] text-gray-500">
                          {ev.event_artists!.length} os.
                        </span>
                      )}

                      <span className="text-gray-500 text-xs shrink-0">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
         )}

         {tab === 'finance' && (
          <div className="space-y-5">
            {/* Ceny biletów wpisuje się wprost — bez podziału na kategorie */}
            <p className="text-[11px] text-gray-400">
              Scena: {stageLabel(fin.stage, form.theatre_id || null)} ({previewCapacity} miejsc) — zmień w „Szczegóły".
            </p>

            {/* Strefy widowni */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls} style={{ marginBottom: 0 }}>Strefy widowni</label>
                <button type="button" onClick={() => setZones(z => [...z, { label: zoneLabel(z.length), share: 0 }])}
                  className="text-[11px] font-medium px-2 py-1 rounded-lg" style={{ border: '1px solid #e4ddd4', color: '#7a2020' }}>
                  + Strefa
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {zones.map((z, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-lg px-2 py-1" style={{ border: '1px solid #e4ddd4' }}>
                    <input value={z.label} onChange={e => setZones(zs => zs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      className="w-24 text-xs bg-transparent focus:outline-none" style={{ color: '#1a1410' }} />
                    <input type="number" min={0} max={100} step={1} value={Math.round((z.share || 0) * 100)}
                      onChange={e => setZones(zs => zs.map((x, j) => j === i ? { ...x, share: (parseFloat(e.target.value) || 0) / 100 } : x))}
                      className="w-12 text-xs text-right bg-transparent focus:outline-none" style={{ color: '#7a7068' }} />
                    <span className="text-[11px]" style={{ color: '#a89e92' }}>%</span>
                    {zones.length > 1 && (
                      <button type="button" title="Usuń strefę"
                        onClick={() => { setZones(zs => zs.filter((_, j) => j !== i)); setTicketTypes(ts => ts.map(t => t.prices ? { ...t, prices: t.prices.filter((_, j) => j !== i) } : t)) }}
                        className="ml-0.5 text-[13px] leading-none" style={{ color: '#c8102e' }}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px]" style={{ color: zoneShareSum === 100 ? '#a89e92' : '#c8102e' }}>
                {zoneShareSum === 100 ? 'Udziały miejsc na widowni — razem 100%.' : `Udziały miejsc sumują się do ${zoneShareSum}% — popraw do 100%.`}
              </p>
            </div>

            {/* Rodzaje biletów */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls} style={{ marginBottom: 0 }}>Rodzaje biletów</label>
                <button type="button"
                  onClick={() => setTicketTypes(ts => [...ts, { id: `t${Date.now()}`, label: 'Nowy bilet', mode: 'flat', price: 0, share: 0 }])}
                  className="text-[11px] font-medium px-2 py-1 rounded-lg" style={{ border: '1px solid #e4ddd4', color: '#7a2020' }}>
                  + Rodzaj biletu
                </button>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e4ddd4' }}>
                {ticketTypes.map((t, i) => {
                  const upd = (patch: Partial<TicketType>) => setTicketTypes(ts => ts.map((x, j) => j === i ? { ...x, ...patch } : x))
                  return (
                    <div key={t.id} className="px-3 py-2" style={{ borderTop: i ? '1px solid #f2ede6' : undefined }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input value={t.label} onChange={e => upd({ label: e.target.value })}
                          className="flex-1 min-w-[130px] text-xs font-medium border border-gray-200 rounded-lg px-2 py-1 bg-white" />
                        <select value={t.mode}
                          onChange={e => {
                            const mode = e.target.value as TicketMode
                            upd({ mode,
                              prices: mode === 'zones' ? (t.prices ?? zones.map(() => baseNormal)) : undefined,
                              price: mode === 'flat' ? (t.price ?? 0) : undefined,
                              discountPct: mode === 'discount' ? (t.discountPct ?? 10) : undefined })
                          }}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white" style={{ color: '#7a7068' }}>
                          <option value="zones">cena wg stref</option>
                          <option value="flat">cena stała</option>
                          <option value="discount">% zniżki</option>
                        </select>
                        <span className="flex items-center gap-1">
                          <input type="number" min={0} max={100} step={1} value={Math.round((t.share || 0) * 100)}
                            onChange={e => upd({ share: (parseFloat(e.target.value) || 0) / 100 })}
                            className="w-14 text-xs text-right border border-gray-200 rounded-lg px-2 py-1 bg-white" />
                          <span className="text-[11px]" style={{ color: '#a89e92' }}>% sprzedaży</span>
                        </span>
                        <span className="text-[11px] tabular-nums" style={{ color: '#7a7068' }}>
                          = {fmtPln(effectivePrice(t, zones, baseNormal))}
                        </span>
                        <button type="button" title="Usuń rodzaj biletu" onClick={() => setTicketTypes(ts => ts.filter((_, j) => j !== i))}
                          className="text-[15px] leading-none" style={{ color: '#c8102e' }}>×</button>
                      </div>

                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        {t.mode === 'zones' && zones.map((z, zi) => (
                          <span key={zi} className="flex items-center gap-1">
                            <span className="text-[11px]" style={{ color: '#a89e92' }}>{z.label}</span>
                            <input type="number" min={0} step={1} value={t.prices?.[zi] ?? 0}
                              onChange={e => upd({ prices: zones.map((_, j) => j === zi ? (parseFloat(e.target.value) || 0) : (t.prices?.[j] ?? 0)) })}
                              className="w-16 text-xs text-right border border-gray-200 rounded-lg px-2 py-1 bg-white" />
                          </span>
                        ))}
                        {t.mode === 'flat' && (
                          <span className="flex items-center gap-1">
                            <span className="text-[11px]" style={{ color: '#a89e92' }}>Cena (zł)</span>
                            <input type="number" min={0} step={1} value={t.price ?? 0}
                              onChange={e => upd({ price: parseFloat(e.target.value) || 0 })}
                              className="w-20 text-xs text-right border border-gray-200 rounded-lg px-2 py-1 bg-white" />
                          </span>
                        )}
                        {t.mode === 'discount' && (
                          <span className="flex items-center gap-1">
                            <span className="text-[11px]" style={{ color: '#a89e92' }}>Zniżka od normalnego (%)</span>
                            <input type="number" min={0} max={100} step={1} value={t.discountPct ?? 0}
                              onChange={e => upd({ discountPct: parseFloat(e.target.value) || 0 })}
                              className="w-16 text-xs text-right border border-gray-200 rounded-lg px-2 py-1 bg-white" />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-1 text-[11px]" style={{ color: typeShareSum === 100 ? '#a89e92' : '#c8102e' }}>
                {typeShareSum === 100
                  ? `Udziały w sprzedaży — razem 100%. Cena normalna (ważona strefami): ${fmtPln(baseNormal)}.`
                  : `Udziały w sprzedaży sumują się do ${typeShareSum}% — popraw do 100%.`}
              </p>
            </div>

            {/* Frekwencja + koszt */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Zakładana frekwencja (%)</label>
                <input
                  type="number" min={0} max={100} step={1}
                  value={fin.attendancePct}
                  onChange={e => setFin(f => ({ ...f, attendancePct: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Koszt na spektakl (zł)</label>
                <input
                  type="number" min={0} step={500}
                  value={fin.fixedCost}
                  onChange={e => setFin(f => ({ ...f, fixedCost: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Podgląd na żywo */}
            <div className="rounded-xl p-4 grid grid-cols-2 gap-3" style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
              <Stat label="Śr. cena (ASP)" value={fmtPln(previewAsp)} />
              <Stat label={`Dochód/spektakl (${previewCapacity} miejsc)`} value={fmtPln(previewMargin)} accent={previewMargin >= 0 ? '#15803d' : '#c8102e'} />
            </div>
            <p className="text-[11px] text-gray-400 -mt-2">
              Podgląd dla reprezentatywnej pojemności sceny ({previewCapacity} miejsc, mix biletów 70/20/10).
              Pełna prognoza miesięczna — w zakładce <b>Finanse</b>.
            </p>
          </div>
         )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}

          {/* Potwierdzenie usunięcia — świadome (wpisz tytuł) */}
          {isEdit && confirmDelete && production && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2.5">
              <p className="text-sm font-semibold text-red-700">Usunąć „{production.title}" na stałe?</p>
              <p className="text-xs text-red-600">
                Usuniesz tytuł wraz z przypisaną obsadą i wszystkimi jego wydarzeniami (próby, spektakle).
                Tej operacji nie można cofnąć. Aby potwierdzić, wpisz dokładny tytuł.
              </p>
              <input
                value={delText}
                onChange={e => setDelText(e.target.value)}
                placeholder={production.title}
                autoFocus
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setDelText('') }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || delText.trim() !== production.title.trim()}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {deleting ? 'Usuwanie…' : 'Usuń na stałe'}
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            {isEdit && !confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 text-sm font-medium text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
              >
                Usuń tytuł
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm font-medium text-white bg-gray-900 rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Nested EventModal (z-60) ── */}
      {eventModal !== undefined && production && (
        <EventModal
          event={eventModal}
          defaultProductionId={production.id}
          artists={artistsForEvent}
          productions={[{ id: production.id, title: production.title ?? '' }]}
          theatres={theatres}
          rooms={rooms}
          zIndex={90}
          onClose={() => setEventModal(undefined)}
          onSaved={() => { setEventModal(undefined); loadEvents() }}
        />
      )}
    </div>
  )
}
