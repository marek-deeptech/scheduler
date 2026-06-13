// Silnik prognozy finansowej — model uproszczony, planistyczny.
// Przychód = sprzedane bilety × średnia cena (ASP); marża = przychód − koszt ryczałtowy.

export type PriceCategory = 'premium' | 'standard' | 'mala'

export interface TicketMix {
  normal: number       // udział biletów normalnych (0–1)
  reduced: number      // udział ulgowych
  last_minute: number  // udział wejściówek
}

export interface FinanceParams {
  ticketMix: TicketMix
  weekendUplift: number   // dopałka frekwencji w weekend, np. 0.10
  vatRate: number         // np. 0.08
  defaultAttendance: number
  defaultFixedCost: number
}

export const DEFAULT_PARAMS: FinanceParams = {
  ticketMix: { normal: 0.7, reduced: 0.2, last_minute: 0.1 },
  weekendUplift: 0.10,
  vatRate: 0.08,
  defaultAttendance: 0.75,
  defaultFixedCost: 8000,
}

// Domyślne ceny per kategoria (blended ze stref cennika Polonia/Och 2026)
export const CATEGORY_DEFAULTS: Record<PriceCategory, { normal: number; reduced: number; lastMinute: number; label: string }> = {
  premium:  { normal: 142, reduced: 128, lastMinute: 50, label: 'Premium' },
  standard: { normal: 117, reduced: 105, lastMinute: 35, label: 'Standard' },
  mala:     { normal: 80,  reduced: 72,  lastMinute: 35, label: 'Mała Scena' },
}

export interface ProductionFinance {
  id: string
  title: string
  priceCategory: PriceCategory
  priceNormal: number
  priceReduced: number
  priceLastMinute: number
  assumedAttendance: number
  fixedCost: number
  isFavourite: boolean
}

// Tytuły ulubione traktujemy jako pewny komplet — frekwencja 100%.
export const FAVOURITE_ATTENDANCE = 1.0

/** Średnia cena biletu (ASP) wg mixu typów — wartość brutto. */
export function asp(p: Pick<ProductionFinance, 'priceNormal' | 'priceReduced' | 'priceLastMinute'>, mix: TicketMix): number {
  return p.priceNormal * mix.normal + p.priceReduced * mix.reduced + p.priceLastMinute * mix.last_minute
}

export function isWeekend(iso: string): boolean {
  const day = new Date(iso).getDay() // 0 = niedziela, 6 = sobota
  return day === 0 || day === 5 || day === 6 // pt/sob/nd traktujemy jako weekend
}

export interface EventForecast {
  capacity: number
  attendance: number   // efektywna frekwencja 0–1 (po dopałce weekendowej, cap 1)
  soldTickets: number
  aspGross: number
  revenueGross: number
  revenueNet: number
  cost: number
  margin: number       // brutto − koszt
  weekend: boolean
}

/** Prognoza dla jednego spektaklu (wydarzenia). */
export function forecastEvent(
  prod: ProductionFinance,
  capacity: number,
  startIso: string,
  params: FinanceParams,
): EventForecast {
  const weekend = isWeekend(startIso)
  const attendance = Math.min(1, prod.assumedAttendance * (weekend ? 1 + params.weekendUplift : 1))
  const cap = capacity > 0 ? capacity : 0
  const soldTickets = Math.round(cap * attendance)
  const aspGross = asp(prod, params.ticketMix)
  const revenueGross = soldTickets * aspGross
  const revenueNet = revenueGross / (1 + params.vatRate)
  const cost = prod.fixedCost
  return {
    capacity: cap,
    attendance,
    soldTickets,
    aspGross,
    revenueGross,
    revenueNet,
    cost,
    margin: revenueGross - cost,
    weekend,
  }
}

/** Próg rentowności: jaka frekwencja (0–1) pokrywa koszt ryczałtowy. */
export function breakEvenAttendance(prod: ProductionFinance, capacity: number, mix: TicketMix): number {
  const denom = capacity * asp(prod, mix)
  if (denom <= 0) return 0
  return prod.fixedCost / denom
}

export function fmtPln(n: number): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(n || 0)
}

export function fmtPct(n: number): string {
  return `${Math.round((n || 0) * 100)}%`
}
