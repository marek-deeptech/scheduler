// ── Etapy cyklu życia repertuaru miesiąca ────────────────────────────────────
// Proces: Planowanie → Zatwierdzenie → Konsultacje → Sprzedaż
//
//  planowanie    — propozycja robocza (repertoire_proposals.status = 'draft')
//  zatwierdzenie — repertuar zaakceptowany, wydarzenia w kalendarzu, BEZ powiadamiania obsady
//                  (status = 'approved', brak markera consultations_started_at)
//  konsultacje   — obsada powiadomiona, trwa zbieranie potwierdzeń udziału
//                  (stats.consultations_started_at ustawiony)
//  sprzedaz      — repertuar puszczony do sprzedaży biletów (finał)
//                  (stats.sales_started_at ustawiony)
//
// Etap trzymamy na markerach w `stats` (jsonb) — bez zmiany schematu, spójnie z
// istniejącym `report_sent_at` (raport finansowy, obecnie NIEzależny od etapu).

//  przerwa       — miesiąc bez grania (przerwa wakacyjna/remontowa); ustawiany
//                  z listy miesięcy przerwy organizacji, nie z propozycji
export type RepStage = 'brak' | 'przerwa' | 'planowanie' | 'zatwierdzenie' | 'konsultacje' | 'sprzedaz'

export interface StageStats {
  consultations_started_at?: string | null
  sales_started_at?: string | null
  report_sent_at?: string | null
  [k: string]: unknown
}

/** Wyznacza etap na podstawie statusu propozycji + markerów w stats. */
export function proposalStage(
  p: {
    status?: string | null
    stats?: { consultations_started_at?: string | null; sales_started_at?: string | null } | null
  } | null | undefined,
): RepStage {
  if (!p) return 'brak'
  if (p.status !== 'approved') return 'planowanie' // draft / (rejected filtrujemy wcześniej)
  const s = p.stats ?? {}
  if (s.sales_started_at) return 'sprzedaz'
  if (s.consultations_started_at) return 'konsultacje'
  return 'zatwierdzenie'
}

export const STAGE_META: Record<RepStage, { label: string; bg: string; color: string; dot: string }> = {
  brak:          { label: 'Do zaplanowania', bg: '#f2ede6', color: '#7a7068', dot: '#b8b0a4' },
  przerwa:       { label: 'Przerwa',         bg: '#eef2f7', color: '#5b6b7f', dot: '#94a3b8' },
  planowanie:    { label: 'Planowanie',      bg: '#e6efff', color: '#1d4ed8', dot: '#3b82f6' },
  zatwierdzenie: { label: 'Zatwierdzenie',   bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
  konsultacje:   { label: 'Konsultacje',     bg: '#ede9fe', color: '#6d28d9', dot: '#8b5cf6' },
  sprzedaz:      { label: 'Sprzedaż',        bg: '#dcfce7', color: '#15803d', dot: '#22c55e' },
}

// Kolejność do sortowania (najbardziej zaawansowany etap pierwszy)
export const STAGE_ORDER: Record<RepStage, number> = {
  sprzedaz: 0, konsultacje: 1, zatwierdzenie: 2, planowanie: 3, brak: 4, przerwa: 5,
}

/** Czy miesiąc jest już zaakceptowany (dowolny etap ≥ zatwierdzenie). */
export function isApprovedStage(stage: RepStage): boolean {
  return stage === 'zatwierdzenie' || stage === 'konsultacje' || stage === 'sprzedaz'
}
