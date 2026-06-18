'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheatre } from '@/lib/theatre-context'
import {
  DEFAULT_PARAMS, CATEGORY_DEFAULTS, FAVOURITE_ATTENDANCE, forecastEvent, breakEvenAttendance,
  stageCapacity, asp, fmtPln, fmtPct, isWeekend, STAGE_LABEL,
  type FinanceParams, type ProductionFinance, type PriceCategory, type Stage,
} from '@/lib/finance'

/* ── Stałe ─────────────────────────────────────────────────────── */
const SHOW_RX = /spektakl|premiera|gościnny|goscinny/i

/* ── Typy ──────────────────────────────────────────────────────── */
interface EvRow {
  id: string; start_time: string; type: string | null
  production_id: string | null; room_id: string | null; theatre_id: string | null
}

/* ── Helpers ───────────────────────────────────────────────────── */
function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
function monthLabel(key: string) { const [y, m] = key.split('-'); return `${MONTHS_PL[+m - 1]} ${y}` }
function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return monthKey(d)
}
function dayShort(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}

/* ── Strona ────────────────────────────────────────────────────── */
export default function FinancePage() {
  const { selectedTheatreId } = useTheatre()
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [loading, setLoading] = useState(true)
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  const [events, setEvents] = useState<EvRow[]>([])
  const [prods, setProds] = useState<Record<string, ProductionFinance>>({})
  const [params, setParams] = useState<FinanceParams>(DEFAULT_PARAMS)

  // Symulacja
  const [simOn, setSimOn] = useState(false)
  const [simAttendance, setSimAttendance] = useState(0.75)
  const [simWeekend, setSimWeekend] = useState(0.10)

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const [y, m] = month.split('-').map(Number)
    const from = `${month}-01T00:00:00`
    const to   = `${monthKey(new Date(y, m, 1))}-01T00:00:00` // pierwszy dzień kolejnego miesiąca

    // Wydarzenia miesiąca
    const { data: evData } = await supabase
      .from('events')
      .select('id, start_time, type, production_id, room_id, theatre_id')
      .gte('start_time', from).lt('start_time', to)
      .order('start_time')
    const evs = ((evData ?? []) as EvRow[]).filter(e => SHOW_RX.test(e.type ?? '') && e.production_id)
    setEvents(evs)

    // Produkcje — próbujemy z kolumnami finansowymi, fallback gdy brak migracji
    let migration = false
    const prodIds = [...new Set(evs.map(e => e.production_id).filter(Boolean))] as string[]
    const prodMap: Record<string, ProductionFinance> = {}
    if (prodIds.length > 0) {
      let { data: pData, error } = await supabase
        .from('productions')
        .select('id, title, stage, price_category, price_normal, price_reduced, price_last_minute, assumed_attendance, fixed_cost, is_favourite')
        .in('id', prodIds)
      if (error) {
        migration = true
        const res = await supabase.from('productions').select('id, title, is_favourite').in('id', prodIds)
        pData = res.data as any
      }
      for (const p of (pData ?? []) as any[]) {
        const cat: PriceCategory = (p.price_category as PriceCategory) || 'standard'
        const def = CATEGORY_DEFAULTS[cat] ?? CATEGORY_DEFAULTS.standard
        prodMap[p.id] = {
          id: p.id, title: p.title,
          stage: p.stage === 'mala' ? 'mala' : 'duza',
          priceCategory: cat,
          priceNormal:     p.price_normal      ?? def.normal,
          priceReduced:    p.price_reduced     ?? def.reduced,
          priceLastMinute: p.price_last_minute ?? def.lastMinute,
          assumedAttendance: p.assumed_attendance ?? DEFAULT_PARAMS.defaultAttendance,
          fixedCost:         p.fixed_cost          ?? DEFAULT_PARAMS.defaultFixedCost,
          isFavourite:       p.is_favourite        ?? false,
        }
      }
    }
    setProds(prodMap)
    setMigrationNeeded(migration)

    // Globalne parametry
    const { data: settings } = await supabase
      .from('app_settings').select('key, value')
      .in('key', ['finance_ticket_mix', 'finance_weekend_uplift', 'finance_vat_rate', 'finance_default_attendance', 'finance_default_fixed_cost'])
    if (settings && settings.length) {
      const s: Record<string, string> = {}
      for (const row of settings) s[row.key] = row.value ?? ''
      const next: FinanceParams = { ...DEFAULT_PARAMS }
      try { if (s.finance_ticket_mix) next.ticketMix = JSON.parse(s.finance_ticket_mix) } catch {}
      if (s.finance_weekend_uplift) next.weekendUplift = parseFloat(s.finance_weekend_uplift)
      if (s.finance_vat_rate) next.vatRate = parseFloat(s.finance_vat_rate)
      if (s.finance_default_attendance) next.defaultAttendance = parseFloat(s.finance_default_attendance)
      if (s.finance_default_fixed_cost) next.defaultFixedCost = parseFloat(s.finance_default_fixed_cost)
      setParams(next)
      setSimAttendance(next.defaultAttendance)
      setSimWeekend(next.weekendUplift)
    }

    setLoading(false)
  }

  // Efektywne parametry (z symulacją)
  const effParams: FinanceParams = useMemo(() => ({
    ...params,
    weekendUplift: simOn ? simWeekend : params.weekendUplift,
  }), [params, simOn, simWeekend])

  // Prognoza per wydarzenie + agregacja
  const { perEvent, perTitle, totals } = useMemo(() => {
    const visibleEvents = events.filter(e => !selectedTheatreId || e.theatre_id === selectedTheatreId)
    const perEvent = visibleEvents.map(ev => {
      const prodBase = prods[ev.production_id!]
      if (!prodBase) return null
      // Ulubione = pewny komplet (100%), niezależnie od symulacji
      const prod: ProductionFinance = prodBase.isFavourite
        ? { ...prodBase, assumedAttendance: FAVOURITE_ATTENDANCE }
        : simOn
        ? { ...prodBase, assumedAttendance: simAttendance }
        : prodBase
      // Pojemność ze sceny tytułu (kategoria + teatr), nie z sali wydarzenia —
      // tytuł gra na jednej, stałej scenie (unikalna scenografia).
      const capacity = stageCapacity(prod.stage, ev.theatre_id)
      const fc = forecastEvent(prod, capacity, ev.start_time, effParams)
      return { ev, prod, capacity, fc }
    }).filter(Boolean) as { ev: EvRow; prod: ProductionFinance; capacity: number; fc: ReturnType<typeof forecastEvent> }[]

    // Per tytuł
    const titleMap = new Map<string, { prod: ProductionFinance; count: number; revenue: number; cost: number; soldSum: number; capSum: number }>()
    for (const r of perEvent) {
      const t = titleMap.get(r.prod.id) ?? { prod: r.prod, count: 0, revenue: 0, cost: 0, soldSum: 0, capSum: 0 }
      t.count++; t.revenue += r.fc.revenueGross; t.cost += r.fc.cost
      t.soldSum += r.fc.soldTickets; t.capSum += r.capacity
      titleMap.set(r.prod.id, t)
    }
    const perTitle = [...titleMap.values()].map(t => ({
      prod: t.prod, count: t.count, revenue: t.revenue, cost: t.cost,
      margin: t.revenue - t.cost,
      attendance: t.capSum > 0 ? t.soldSum / t.capSum : 0,
      aspGross: asp(t.prod, effParams.ticketMix),
      breakEven: breakEvenAttendance(t.prod, t.capSum / Math.max(1, t.count), effParams.ticketMix),
      isFavourite: t.prod.isFavourite,
    })).sort((a, b) =>
      // Ulubione na górze, potem wg marży
      (Number(b.isFavourite) - Number(a.isFavourite)) || (b.margin - a.margin)
    )

    const totals = perEvent.reduce((acc, r) => ({
      revenue: acc.revenue + r.fc.revenueGross,
      cost: acc.cost + r.fc.cost,
      sold: acc.sold + r.fc.soldTickets,
      cap: acc.cap + r.capacity,
      count: acc.count + 1,
    }), { revenue: 0, cost: 0, sold: 0, cap: 0, count: 0 })

    return { perEvent, perTitle, totals }
  }, [events, prods, effParams, simOn, simAttendance, selectedTheatreId])

  const margin = totals.revenue - totals.cost
  const avgAttendance = totals.cap > 0 ? totals.sold / totals.cap : 0

  return (
    <div className="pb-24">
      {/* Nagłówek */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-4 -mx-4 -mt-4 md:px-8 md:py-5 md:-mx-8 md:-mt-8 mb-6"
           style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
            Finanse
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Prognoza przychodów i frekwencji repertuaru</p>
        </div>
        {/* Wybór miesiąca */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-lg hover:bg-gray-100" style={{ border: '1px solid #e4ddd4', color: '#7a7068' }}>‹</button>
          <span className="text-sm font-semibold px-2 min-w-[130px] text-center" style={{ color: '#1a1410' }}>{monthLabel(month)}</span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-lg hover:bg-gray-100" style={{ border: '1px solid #e4ddd4', color: '#7a7068' }}>›</button>
        </div>
      </div>

      {migrationNeeded && (
        <div className="mb-5 rounded-xl px-4 py-3 text-xs" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <b>Tryb domyślny.</b> Parametry finansowe nie są jeszcze zapisane w bazie — prognoza używa realnych wartości domyślnych (cenniki Polonia/Och 2026).
          Uruchom <code>supabase-migration-finance.sql</code> i <code>scripts/seed-finance.mjs</code>, aby edytować i zapisać własne ceny, pojemności i koszty.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-center py-16" style={{ color: '#a89e92' }}>Ładowanie…</p>
      ) : totals.count === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm font-medium" style={{ color: '#7a7068' }}>Brak spektakli w tym miesiącu</p>
          <p className="text-xs mt-1" style={{ color: '#a89e92' }}>Zatwierdź repertuar, aby zobaczyć prognozę finansową</p>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <KpiTile label="Prognoza przychodu" value={fmtPln(totals.revenue)} accent="#15803d" sub={`${totals.count} spektakli`} />
            <KpiTile label="Koszty (ryczałt)" value={fmtPln(totals.cost)} accent="#b45309" sub={`${fmtPln(totals.count ? totals.cost / totals.count : 0)}/spektakl`} />
            <KpiTile label="Dochód" value={fmtPln(margin)} accent={margin >= 0 ? '#15803d' : '#c8102e'} sub={totals.revenue > 0 ? `${Math.round(margin / totals.revenue * 100)}% przychodu` : '—'} />
            <KpiTile label="Śr. frekwencja" value={fmtPct(avgAttendance)} accent="#1a1410" sub={`${totals.sold} / ${totals.cap} miejsc`} />
          </div>

          {/* Symulacja */}
          <style>{`
            .fin-slider { -webkit-appearance: none; appearance: none; height: 3px; border-radius: 9999px; outline: none; cursor: pointer; }
            .fin-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 13px; height: 13px; border-radius: 9999px; background: #fff; border: 1.5px solid #c8102e; box-shadow: 0 1px 2px rgba(0,0,0,.12); transition: transform .12s ease, box-shadow .12s ease; }
            .fin-slider::-webkit-slider-thumb:hover { transform: scale(1.18); box-shadow: 0 2px 5px rgba(200,16,46,.28); }
            .fin-slider::-moz-range-thumb { width: 13px; height: 13px; border-radius: 9999px; background: #fff; border: 1.5px solid #c8102e; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
            .fin-slider::-moz-range-thumb:hover { transform: scale(1.18); }
          `}</style>
          <div className="mb-6 rounded-2xl p-4" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: '#1a1410' }}>Symulacja scenariusza</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#f2ede6', color: '#7a7068' }}>co-jeśli</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs" style={{ color: '#7a7068' }}>{simOn ? 'Włączona' : 'Wyłączona'}</span>
                <button onClick={() => setSimOn(v => !v)}
                  className="relative w-10 h-6 rounded-full transition-colors"
                  style={{ background: simOn ? '#15803d' : '#d6d0c8' }}>
                  <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                    style={{ transform: simOn ? 'translateX(16px)' : 'none' }} />
                </button>
              </label>
            </div>
            <div className={`grid md:grid-cols-2 gap-4 ${simOn ? '' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: '#7a7068' }}>
                  <span>Założona frekwencja (♥ Favourites zawsze 100%)</span><b style={{ color: '#1a1410' }}>{fmtPct(simAttendance)}</b>
                </div>
                <input type="range" min={0.3} max={1} step={0.05} value={simAttendance}
                  onChange={e => setSimAttendance(parseFloat(e.target.value))} className="fin-slider w-full"
                  style={{ background: `linear-gradient(to right, #c8102e 0%, #c8102e ${(simAttendance - 0.3) / 0.7 * 100}%, #ece7df ${(simAttendance - 0.3) / 0.7 * 100}%, #ece7df 100%)` }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: '#7a7068' }}>
                  <span>Dopałka weekendowa (pt/sob/nd)</span><b style={{ color: '#1a1410' }}>+{Math.round(simWeekend * 100)}%</b>
                </div>
                <input type="range" min={0} max={0.4} step={0.05} value={simWeekend}
                  onChange={e => setSimWeekend(parseFloat(e.target.value))} className="fin-slider w-full"
                  style={{ background: `linear-gradient(to right, #c8102e 0%, #c8102e ${simWeekend / 0.4 * 100}%, #ece7df ${simWeekend / 0.4 * 100}%, #ece7df 100%)` }} />
              </div>
            </div>
          </div>

          {/* Tabela per tytuł */}
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #f2ede6' }}>
              <span className="text-sm font-semibold" style={{ color: '#1a1410' }}>Prognoza wg tytułu</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 680 }}>
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ color: '#a89e92' }}>
                    <th className="text-left font-medium px-4 py-2">Tytuł</th>
                    <th className="text-right font-medium px-3 py-2">Spektakle</th>
                    <th className="text-right font-medium px-3 py-2">Śr. frekw.</th>
                    <th className="text-right font-medium px-3 py-2">ASP</th>
                    <th className="text-right font-medium px-3 py-2">Przychód</th>
                    <th className="text-right font-medium px-3 py-2">Dochód</th>
                    <th className="text-right font-medium px-4 py-2">Próg rent.</th>
                  </tr>
                </thead>
                <tbody>
                  {perTitle.map(t => (
                    <tr key={t.prod.id} style={{ borderTop: '1px solid #f7f4ef' }}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium" style={{ color: '#1a1410' }}>{t.prod.title}</span>
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                          style={t.prod.stage === 'mala' ? { background: '#eef2ff', color: '#4338ca' } : { background: '#f2ede6', color: '#7a7068' }}
                          title={`${STAGE_LABEL[t.prod.stage]} Scena`}>
                          {STAGE_LABEL[t.prod.stage]}
                        </span>
                        {t.isFavourite ? (
                          <span className="ml-2 text-[11px]" style={{ color: '#ef4444' }} title="Favourite">♥</span>
                        ) : (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#f2ede6', color: '#7a7068' }}>
                            {CATEGORY_DEFAULTS[t.prod.priceCategory]?.label ?? t.prod.priceCategory}
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-2.5" style={{ color: '#7a7068' }}>{t.count}</td>
                      <td className="text-right px-3 py-2.5 font-medium" style={{ color: t.isFavourite ? '#15803d' : '#1a1410' }}>{fmtPct(t.attendance)}</td>
                      <td className="text-right px-3 py-2.5" style={{ color: '#7a7068' }}>{fmtPln(t.aspGross)}</td>
                      <td className="text-right px-3 py-2.5 font-medium" style={{ color: '#1a1410' }}>{fmtPln(t.revenue)}</td>
                      <td className="text-right px-3 py-2.5 font-semibold" style={{ color: t.margin >= 0 ? '#15803d' : '#c8102e' }}>{fmtPln(t.margin)}</td>
                      <td className="text-right px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{
                          background: t.attendance >= t.breakEven ? '#f0fdf4' : '#fff5f5',
                          color: t.attendance >= t.breakEven ? '#15803d' : '#c8102e',
                        }}>{fmtPct(t.breakEven)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lista per spektakl */}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #f2ede6' }}>
              <span className="text-sm font-semibold" style={{ color: '#1a1410' }}>Spektakle ({perEvent.length})</span>
            </div>
            <div className="divide-y" style={{ borderColor: '#f7f4ef' }}>
              {perEvent.map(({ ev, prod, capacity, fc }) => (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#1a1410' }}>
                      {prod.isFavourite && <span style={{ color: '#ef4444' }}>♥ </span>}{prod.title}
                    </p>
                    <p className="text-[11px]" style={{ color: '#a89e92' }}>
                      {dayShort(ev.start_time)}{fc.weekend && ' · weekend'} · {fc.soldTickets}/{capacity} miejsc
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium" style={{ color: fc.margin >= 0 ? '#15803d' : '#c8102e' }}>{fmtPln(fc.margin)}</p>
                    <p className="text-[11px]" style={{ color: '#a89e92' }}>{fmtPct(fc.attendance)} · {fmtPln(fc.revenueGross)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
      <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: '#a89e92' }}>{label}</p>
      <p className="text-xl font-bold leading-tight" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: '#a89e92' }}>{sub}</p>}
    </div>
  )
}
