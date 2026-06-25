import { NextResponse } from 'next/server'
import { buildAuthUrl } from '@/lib/google-calendar'
import { signState } from '@/lib/google-state'

export const runtime = 'nodejs'

/**
 * Start OAuth — przekierowuje na ekran zgody Google.
 * Wywoływany z przycisku w Ustawieniach (bez sekretu w URL) lub ręcznie.
 * Sekret (GOOGLE_SYNC_SECRET) chroni ścieżkę zapisu — webhook /api/google/sync.
 *
 * UWAGA: brak realnego auth w apce — docelowo bramkować po roli koordynatora.
 *
 * Parametry (MVP — domyślnie koordynator „Marek", dostaje wszystkie eventy):
 *   ?owner=marek-mielnicki&all=1
 * Skalowanie per-artysta:  ?owner=<id>&artist=<artistUuid>
 */
export function GET(req: Request) {
  const url = new URL(req.url)
  const owner  = url.searchParams.get('owner') || 'marek-mielnicki'
  const all    = url.searchParams.get('all') === '1' || (!url.searchParams.get('artist'))
  const artist = url.searchParams.get('artist')

  const state = signState({ owner, all, artist })
  return NextResponse.redirect(buildAuthUrl(state))
}
