// Deterministyczny generator repertuaru — Etap 3–4.
// Zatwierdzone dni Favourites = twarda zajętość; nie-Favourites dokładane
// greedy pod jeden z 4 celów finansowych. Bloki (montaż/demontaż raz)
// premiowane przez bonus za kontynuację tytułu na sąsiednim dniu.

import {
  stageCapacity, asp, isWeekend,
  type PriceCategory, type FinanceParams,
} from './finance'

export type Objective = 'max_revenue' | 'max_attendance' | 'min_cost' | 'balanced'

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  max_revenue:    'Maks. przychód',
  max_attendance: 'Maks. frekwencja',
  min_cost:       'Min. koszt',
  balanced:       'Zbalansowana',
}

export interface OptProduction {
  id: string
  title: string
  theatreId: string
  category: PriceCategory
  isFavourite: boolean
  castIds: string[]
  priceNormal: number
  priceReduced: number
  priceLastMinute: number
  assumedAttendance: number
  fixedCost: number
}

export interface OptInputs {
  days: string[]                              // 'YYYY-MM-DD' całego miesiąca
  theatres: string[]                          // theatre ids
  prods: OptProduction[]
  lockedByProd: Record<string, string[]>      // production_id -> zatwierdzone daty (Favourites)
  unavailByDate: Record<string, Set<string>>  // data -> artistId niedostępni (urlop/choroba)
  finance: FinanceParams
  stageRoom: (theatreId: string, stage: 'duza' | 'mala') => string | null // -> room_id
}

export interface Perf {
  date: string
  production_id: string
  production_title: string
  theatre_id: string
  room_id: string | null
  type: string
  start_time: string
  end_time: string
}

export interface OptionResult {
  objective: Objective
  performances: Perf[]
  totals: { revenue: number; cost: number; margin: number; sold: number; capacity: number; count: number }
  byProduction: Record<string, number>
}

const NONFAV_CAP_DEFAULT = 8
const NONFAV_CAP_MINCOST = 4

function stageOf(cat: PriceCategory): 'duza' | 'mala' {
  return cat === 'mala' ? 'mala' : 'duza'
}

function perfFinance(p: OptProduction, date: string, fp: FinanceParams) {
  const cap = stageCapacity(p.category, p.theatreId)
  const attendance = p.isFavourite
    ? 1
    : Math.min(1, p.assumedAttendance * (isWeekend(date + 'T12:00:00') ? 1 + fp.weekendUplift : 1))
  const sold = Math.round(cap * attendance)
  const aspG = asp(p, fp.ticketMix)
  const revenue = sold * aspG
  const cost = p.fixedCost
  return { cap, attendance, sold, revenue, cost, margin: revenue - cost }
}

export function generateOption(objective: Objective, inp: OptInputs): OptionResult {
  const cellUsed = new Set<string>()                 // `${date}|${theatre}|${stage}`
  const castBusy = new Map<string, Set<string>>()    // date -> artistId zajęci
  const titleCount = new Map<string, number>()
  const perfs: Perf[] = []
  const prodById: Record<string, OptProduction> = {}
  inp.prods.forEach(p => prodById[p.id] = p)

  const cap = objective === 'min_cost' ? NONFAV_CAP_MINCOST : NONFAV_CAP_DEFAULT

  function busyOf(date: string): Set<string> {
    let s = castBusy.get(date)
    if (!s) { s = new Set<string>(); castBusy.set(date, s) }
    return s
  }
  function markBusy(date: string, ids: string[]) {
    const s = busyOf(date)
    ids.forEach(i => s.add(i))
  }
  function place(p: OptProduction, date: string) {
    const stage = stageOf(p.category)
    perfs.push({
      date, production_id: p.id, production_title: p.title,
      theatre_id: p.theatreId, room_id: inp.stageRoom(p.theatreId, stage),
      type: 'spektakl', start_time: `${date}T19:00:00`, end_time: `${date}T21:30:00`,
    })
    cellUsed.add(`${date}|${p.theatreId}|${stage}`)
    markBusy(date, p.castIds)
    titleCount.set(p.id, (titleCount.get(p.id) ?? 0) + 1)
  }

  // 1) Zablokowane Favourites — twarda zajętość
  for (const [pid, dates] of Object.entries(inp.lockedByProd)) {
    const p = prodById[pid]
    if (!p) continue
    for (const date of dates) place(p, date)
  }

  // 2) Dokładanie nie-Favourites greedy
  // śledzenie ostatnio postawionego tytułu w (theatre,stage) dla bonusu blokowego
  const lastInCell: Record<string, { date: string; prodId: string }> = {}

  for (const date of inp.days) {
    const busy = busyOf(date)
    const unav = inp.unavailByDate[date] ?? new Set<string>()
    for (const theatre of inp.theatres) {
      for (const stage of ['duza', 'mala'] as const) {
        const key = `${date}|${theatre}|${stage}`
        if (cellUsed.has(key)) continue

        const cands = inp.prods.filter(p =>
          !p.isFavourite &&
          p.theatreId === theatre &&
          stageOf(p.category) === stage &&
          p.castIds.length > 0 &&
          (titleCount.get(p.id) ?? 0) < cap &&
          p.castIds.every(a => !busy.has(a)) &&        // brak konfliktu tego dnia
          p.castIds.every(a => !unav.has(a))           // pełna obsada dostępna
        )
        if (cands.length === 0) continue

        const cellKey = `${theatre}|${stage}`
        const prev = lastInCell[cellKey]
        const scored = cands.map(p => {
          const fin = perfFinance(p, date, inp.finance)
          let base =
            objective === 'max_revenue'    ? fin.revenue :
            objective === 'max_attendance' ? fin.attendance * 100000 :
            objective === 'min_cost'       ? -fin.cost :
                                             fin.margin
          // bonus blokowy: kontynuacja tego samego tytułu z poprzedniego dnia
          if (prev && prev.prodId === p.id) base *= 1.25
          return { p, fin, score: base }
        })

        let pool = scored
        if (objective === 'min_cost') pool = pool.filter(s => s.fin.margin > 0)
        if (pool.length === 0) continue
        pool.sort((a, b) => b.score - a.score)
        const chosen = pool[0].p
        place(chosen, date)
        lastInCell[cellKey] = { date, prodId: chosen.id }
      }
    }
  }

  // Totals
  const totals = { revenue: 0, cost: 0, margin: 0, sold: 0, capacity: 0, count: 0 }
  const byProduction: Record<string, number> = {}
  for (const perf of perfs) {
    const p = prodById[perf.production_id]
    if (!p) continue
    const fin = perfFinance(p, perf.date, inp.finance)
    totals.revenue += fin.revenue; totals.cost += fin.cost
    totals.sold += fin.sold; totals.capacity += fin.cap; totals.count++
    byProduction[perf.production_title] = (byProduction[perf.production_title] ?? 0) + 1
  }
  totals.margin = totals.revenue - totals.cost

  // sort chronologicznie
  perfs.sort((a, b) => a.date.localeCompare(b.date) || a.theatre_id.localeCompare(b.theatre_id))

  return { objective, performances: perfs, totals, byProduction }
}
