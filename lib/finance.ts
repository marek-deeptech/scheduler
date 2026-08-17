// Silnik prognozy finansowej — model uproszczony, planistyczny.
// Przychód = sprzedane bilety × średnia cena (ASP); marża = przychód − koszt ryczałtowy.

export type PriceCategory = 'premium' | 'standard' | 'mala'

// Scena, na której gra tytuł — twardy atrybut (unikalna scenografia).
// Klucz sceny (`stage`) jest teraz per teatr: dwuscenowe teatry Fundacji używają
// 'duza'/'mala', TD ma 3 sceny o własnych kluczach. Wartości (pojemność, koszt,
// etykieta, mapowanie na salę) pochodzą z rejestru THEATRE_SCENES poniżej.
export type Stage = string
export const STAGE_LABEL: Record<'duza' | 'mala', string> = { duza: 'Duża', mala: 'Mała' }

/** Definicja sceny teatru — jednostka pojemności/kosztu/etykiety w prognozie. */
export interface Scene {
  key: string                    // wartość productions.stage
  label: string                  // etykieta w UI (np. „Duża", „Kameralna")
  capacity: number               // pojemność widowni
  fixedCost: number              // domyślny koszt ryczałtowy per spektakl (zł)
  priceCategory?: PriceCategory  // sugerowana kategoria cenowa
  short?: string                 // krótka etykieta do plakietek (np. „Mikołajska")
  roomMatch?: string[]           // fragmenty nazwy sali → mapowanie stage→room_id
}

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
  stage: Stage
  theatreId?: string | null   // teatr tytułu — kontekst dla sceny (pojemność/etykieta)
  priceCategory: PriceCategory
  priceNormal: number
  priceReduced: number
  priceLastMinute: number
  assumedAttendance: number
  fixedCost: number
  aspOverride?: number   // ASP policone z rodzajów biletów (pricing.asp) — ma pierwszeństwo
  isFavourite: boolean
  favLevel?: number
  hitLevel?: number
}

// Tytuły ulubione traktujemy jako pewny komplet — frekwencja 100%.
export const FAVOURITE_ATTENDANCE = 1.0

// Domyślny koszt ryczałtowy per spektakl wg skali sceny (zł).
// Duża scena: większa obsada + technika; mała scena: kameralna, dużo taniej.
export const STAGE_FIXED_COST: Record<'duza' | 'mala', number> = {
  duza: 12000,
  mala: 3000,
}

// Teatry i pojemności scen (wg strony WWW: Polonia Duża 266 / Mała 90,
// Och Duża 450 / Och-Cafe 100). Tytuł gra na JEDNEJ scenie (unikalna scenografia),
// więc pojemność i koszt wynikają z kategorii (= sceny), nie z sali wydarzenia.
export const THEATRE_ID = {
  polonia: '96187687-13eb-4b49-ab60-cc587f58119e',
  och:     '8ea01433-7d8b-4710-aba3-b5dcd567eb57',
  // Teatr Dramatyczny — jeden teatr, trzy sceny (państwowy). UUID stały (seed TD).
  td:      '22222222-0000-0000-0000-000000000010',
} as const

// Sceny generyczne — dla teatru spoza rejestru (dwuscenowy fallback).
const DEFAULT_SCENES: Scene[] = [
  { key: 'duza', label: 'Duża', capacity: 266, fixedCost: STAGE_FIXED_COST.duza, priceCategory: 'standard' },
  { key: 'mala', label: 'Mała', capacity: 90,  fixedCost: STAGE_FIXED_COST.mala, priceCategory: 'mala', roomMatch: ['mała', 'mala', 'cafe'] },
]

// Rejestr scen per teatr (klucz = theatre_id). Pojemności wg stron WWW:
// Polonia Duża 266 / Mała 90; Och Duża 450 / Och-Cafe 100.
// TD (im. G. Holoubka) — 4 realne sceny wg teatrdramatyczny.pl (repertuar IX–XII 2026 + strony spektakli):
// 3 sceny operacyjne: Duża Scena (Holoubka) 650, Mała Scena ~120, Scena im. Haliny Mikołajskiej ~90.
// (Scena Przodownik nieoperacyjna → scalona do Mikołajskiej; legacy roomMatch 'przodownik'.)
export const THEATRE_SCENES: Record<string, Scene[]> = {
  [THEATRE_ID.polonia]: [
    { key: 'duza', label: 'Duża', capacity: 266, fixedCost: 12000, priceCategory: 'standard' },
    { key: 'mala', label: 'Mała', capacity: 90,  fixedCost: 3000,  priceCategory: 'mala', roomMatch: ['mała', 'mala', 'cafe'] },
  ],
  [THEATRE_ID.och]: [
    { key: 'duza', label: 'Duża',     capacity: 450, fixedCost: 12000, priceCategory: 'standard' },
    { key: 'mala', label: 'Och-Cafe', capacity: 100, fixedCost: 3000,  priceCategory: 'mala', roomMatch: ['mała', 'mala', 'cafe'] },
  ],
  [THEATRE_ID.td]: [
    { key: 'duza',       label: 'Duża Scena',       short: 'Duża', capacity: 650, fixedCost: 18000, priceCategory: 'standard', roomMatch: ['duża', 'duza', 'holoubk'] },
    { key: 'mala',       label: 'Mała Scena',       short: 'Mała', capacity: 120, fixedCost: 6000,  priceCategory: 'mala',     roomMatch: ['mała', 'mala'] },
    { key: 'mikolajska', label: 'Scena im. Haliny Mikołajskiej', short: 'Mikołajska', capacity: 90, fixedCost: 4000, priceCategory: 'mala', roomMatch: ['mikołaj', 'mikolaj', 'haliny', 'przodownik'] },
  ],
}

/** Lista scen teatru — do pickera i mapowania sal. Fallback: sceny generyczne. */
export function scenesForTheatre(theatreId: string | null): Scene[] {
  return (theatreId && THEATRE_SCENES[theatreId]) || DEFAULT_SCENES
}

/** Scena danego tytułu (po kluczu `stage`) w kontekście teatru; fallback = 1. scena. */
export function sceneOf(stage: Stage, theatreId: string | null): Scene {
  const scenes = scenesForTheatre(theatreId)
  return scenes.find(s => s.key === stage) ?? scenes[0]
}

/** Pojemność sceny, na której gra tytuł — wg sceny i teatru. */
export function stageCapacity(stage: Stage, theatreId: string | null): number {
  return sceneOf(stage, theatreId).capacity
}

/** Domyślny koszt ryczałtowy wynikający ze sceny. */
export function costForStage(stage: Stage, theatreId: string | null = null): number {
  return sceneOf(stage, theatreId).fixedCost
}

/** Etykieta sceny (np. „Duża", „Kameralna") w kontekście teatru. */
export function stageLabel(stage: Stage, theatreId: string | null): string {
  return sceneOf(stage, theatreId).label
}

/** Krótka etykieta sceny do plakietek — „Duża", „Mała", „Mikołajska". */
export function stageShort(stage: Stage, theatreId: string | null): string {
  const sc = sceneOf(stage, theatreId)
  if (sc.short) return sc.short
  // Fallback: z pełnej nazwy zdejmij słowo „scena" i „im.", zostaw wyróżnik.
  return sc.label.replace(/\bscen[ay]\b/gi, '').replace(/\bim\.\s*/gi, '').trim() || sc.label
}

/** Mapa scena→room_id: dopasowanie sal teatru do scen po fragmencie nazwy. */
export function mapRoomsToScenes(
  scenes: Scene[],
  rooms: { id: string; name: string | null }[],
): Record<string, string | null> {
  const map: Record<string, string | null> = {}
  for (const s of scenes) map[s.key] = null
  // Scena bez roomMatch = domyślna (łapie sale nieprzypisane do żadnej innej sceny).
  const fallback = scenes.find(s => !s.roomMatch) ?? scenes[0]
  for (const r of rooms) {
    const n = (r.name ?? '').toLowerCase()
    const sc = scenes.find(s => s.roomMatch?.some(t => n.includes(t))) ?? fallback
    if (sc && map[sc.key] == null) map[sc.key] = r.id
  }
  return map
}

/** Średnia cena biletu (ASP) wg mixu typów — wartość brutto. */
export function asp(
  p: Pick<ProductionFinance, 'priceNormal' | 'priceReduced' | 'priceLastMinute'> & { aspOverride?: number },
  mix: TicketMix,
): number {
  // Gdy tytuł ma zdefiniowane rodzaje biletów, ich ważona średnia jest dokładniejsza
  // niż uproszczony mix 70/20/10 na trzech cenach.
  if (p.aspOverride && p.aspOverride > 0) return p.aspOverride
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

/* ── Strefy widowni i rodzaje biletów ────────────────────────────────────────
   Model odwzorowuje realne cenniki teatrów:
   • STREFY — podział widowni (Strefa I–III); każda ma udział miejsc.
     Teatr bez stref ma po prostu jedną strefę 100%.
   • RODZAJE BILETÓW — wyceniane na trzy sposoby:
       'zones'    cena osobna dla każdej strefy   (Normalne, Ulgowe)
       'flat'     jedna cena niezależna od strefy (Otwarte 2026/2027, Ostatni dzwonek, Wejściówka)
       'discount' procent zniżki od ceny normalnej (Grupowe, Karta Warszawiaka)
     Każdy rodzaj ma udział w sprzedaży — z nich liczy się ASP.
   Wszystko trzymamy w `productions.pricing`; wyliczone ASP i ceny reprezentatywne
   trafiają do istniejących kolumn, więc reszta prognozy działa bez zmian.        */

export interface PriceZone {
  label: string
  share: number      // udział miejsc na widowni (0–1)
}

export type TicketMode = 'zones' | 'flat' | 'discount'

export interface TicketType {
  id: string
  label: string
  mode: TicketMode
  prices?: number[]     // mode 'zones' — cena per strefa
  price?: number        // mode 'flat'
  discountPct?: number  // mode 'discount' — % zniżki od ceny normalnej
  share: number         // udział w sprzedaży (0–1)
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
/** Domyślna nazwa strefy: „Strefa I", „Strefa II"… */
export const zoneLabel = (i: number) => `Strefa ${ROMAN[i] ?? i + 1}`

export const DEFAULT_ZONES: PriceZone[] = [
  { label: 'Strefa I',   share: 0.4 },
  { label: 'Strefa II',  share: 0.4 },
  { label: 'Strefa III', share: 0.2 },
]

/** Katalog wzorowany na cenniku Teatru Dramatycznego. */
export function defaultTicketTypes(normal: number, reduced: number, lastMinute: number): TicketType[] {
  const z = (base: number) => [base, Math.round(base * 0.8), Math.round(base * 0.62)]
  return [
    { id: 'normalne',  label: 'Normalne',          mode: 'zones',    prices: z(normal),  share: 0.55 },
    { id: 'ulgowe',    label: 'Ulgowe',            mode: 'zones',    prices: z(reduced), share: 0.20 },
    { id: 'otwarte',   label: 'Otwarte 2026/2027', mode: 'flat',     price: 130,         share: 0.05 },
    { id: 'dzwonek',   label: 'Ostatni dzwonek',   mode: 'flat',     price: 35,          share: 0.08 },
    { id: 'grupowe',   label: 'Grupowe',           mode: 'discount', discountPct: 15,    share: 0.07 },
    { id: 'wejsciowka', label: 'Wejściówka',       mode: 'flat',     price: lastMinute,  share: 0.05 },
  ]
}

const norm = (arr: { share: number }[]) => {
  const t = arr.reduce((s, x) => s + (x.share || 0), 0)
  return t > 0 ? t : 1
}

/** Cena rodzaju biletu uśredniona po strefach (dla 'zones') lub wprost. */
export function effectivePrice(t: TicketType, zones: PriceZone[], baseNormal: number): number {
  if (t.mode === 'flat')     return t.price ?? 0
  if (t.mode === 'discount') return Math.round(baseNormal * (1 - (t.discountPct ?? 0) / 100))
  const total = norm(zones)
  return Math.round(zones.reduce((s, z, i) => s + (t.prices?.[i] ?? 0) * (z.share || 0), 0) / total)
}

/** Cena normalna ważona strefami — podstawa dla rodzajów zniżkowych i kolumny price_normal. */
export function baseNormalPrice(types: TicketType[], zones: PriceZone[]): number {
  const base = types.find(t => t.mode === 'zones')
  if (!base) return types[0]?.price ?? 0
  return effectivePrice(base, zones, 0)
}

/** Średnia cena biletu (ASP) — po rodzajach biletów ważonych udziałem w sprzedaży. */
export function aspFromTypes(types: TicketType[], zones: PriceZone[]): number {
  if (!types.length) return 0
  const base = baseNormalPrice(types, zones)
  const total = norm(types)
  return Math.round(types.reduce((s, t) => s + effectivePrice(t, zones, base) * (t.share || 0), 0) / total)
}

/** Strefy z zapisanego cennika; brak → domyślne (albo jedna strefa 100%). */
export function zonesFromPricing(pricing: unknown): PriceZone[] {
  const p = (pricing ?? {}) as Record<string, unknown>
  const saved = p.zones
  if (Array.isArray(saved) && saved.length) {
    return saved.map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>
      return { label: String(o.label ?? zoneLabel(i)), share: Number(o.share) || 0 }
    })
  }
  const nom = Array.isArray(p.normalne) ? (p.normalne as unknown[]).length : 0
  return nom >= 2 ? DEFAULT_ZONES.map(z => ({ ...z })) : [{ label: 'Cała widownia', share: 1 }]
}

/** Rodzaje biletów z cennika; brak → katalog domyślny zasilony cenami tytułu. */
export function ticketTypesFromPricing(
  pricing: unknown, zones: PriceZone[], normal: number, reduced: number, lastMinute: number,
): TicketType[] {
  const p = (pricing ?? {}) as Record<string, unknown>
  const saved = p.ticketTypes
  if (Array.isArray(saved) && saved.length) {
    return saved.map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>
      return {
        id: String(o.id ?? `t${i}`),
        label: String(o.label ?? 'Bilet'),
        mode: (['zones', 'flat', 'discount'].includes(String(o.mode)) ? o.mode : 'flat') as TicketMode,
        prices: Array.isArray(o.prices) ? (o.prices as unknown[]).map(Number) : undefined,
        price: o.price != null ? Number(o.price) : undefined,
        discountPct: o.discountPct != null ? Number(o.discountPct) : undefined,
        share: Number(o.share) || 0,
      }
    })
  }
  // Migracja z cennika teatru: tablice normalne/ulgowe zwijamy do liczby stref.
  const toZones = (arr: unknown): number[] | null => {
    const v = Array.isArray(arr) ? (arr as unknown[]).map(Number).filter(n => n > 0) : []
    if (v.length < 2) return null
    return zones.map((_, i) => {
      const from = Math.floor((i * v.length) / zones.length)
      const to = Math.max(from + 1, Math.floor(((i + 1) * v.length) / zones.length))
      const slice = v.slice(from, to)
      return Math.round(slice.reduce((s, n) => s + n, 0) / slice.length)
    })
  }
  const types = defaultTicketTypes(normal, reduced, lastMinute)
  const nz = toZones(p.normalne), uz = toZones(p.ulgowe)
  if (nz) types[0].prices = nz
  if (uz) types[1].prices = uz
  if (!nz) types[0].prices = zones.map(() => normal)
  if (!uz) types[1].prices = zones.map(() => reduced)
  return types
}
