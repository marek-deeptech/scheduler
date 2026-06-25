import { NextResponse } from 'next/server'
import { buildAuthUrl } from '@/lib/google-calendar'
import { signState } from '@/lib/google-state'

export const runtime = 'nodejs'

/**
 * Start OAuth — przekierowuje na ekran zgody Google.
 * Bramka: ?token=GOOGLE_SYNC_SECRET (żeby nikt obcy nie podpiął swojego konta).
 *
 * Parametry (MVP — domyślnie koordynator „Marek", dostaje wszystkie eventy):
 *   ?token=...&owner=marek-mielnicki&all=1
 * Skalowanie per-artysta:  ?token=...&owner=<id>&artist=<artistUuid>
 */
export function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('token') !== (process.env.GOOGLE_SYNC_SECRET || '')) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const owner  = url.searchParams.get('owner') || 'marek-mielnicki'
  const all    = url.searchParams.get('all') === '1' || (!url.searchParams.get('artist'))
  const artist = url.searchParams.get('artist')

  const state = signState({ owner, all, artist })
  return NextResponse.redirect(buildAuthUrl(state))
}
