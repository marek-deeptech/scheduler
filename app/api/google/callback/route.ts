import { NextResponse } from 'next/server'
import { exchangeCode, accessTokenFromRefresh, fetchUserEmail } from '@/lib/google-calendar'
import { verifyState } from '@/lib/google-state'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

/** Callback OAuth — wymienia code na tokeny i zapisuje konto Google. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code  = url.searchParams.get('code')
  const state = verifyState(url.searchParams.get('state') || '')
  if (!code || !state) return new NextResponse('Nieprawidłowy state lub brak code.', { status: 400 })

  try {
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) {
      // Brak refresh_token = konto było już wcześniej połączone. Odłącz w koncie Google
      // (myaccount.google.com → Bezpieczeństwo → aplikacje firm trzecich) i spróbuj ponownie.
      return new NextResponse('Brak refresh_token — odłącz aplikację w ustawieniach konta Google i połącz ponownie.', { status: 400 })
    }
    const email = tokens.access_token ? await fetchUserEmail(tokens.access_token) : null

    const admin = supabaseAdmin()
    const { error } = await admin.from('google_accounts').upsert({
      owner_key: state.owner,
      email,
      artist_id: state.artist,
      receive_all: state.all,
      refresh_token: tokens.refresh_token,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_key' })
    if (error) throw error

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin
    return NextResponse.redirect(`${appUrl}/settings?google=connected`)
  } catch (e: any) {
    return new NextResponse('Błąd połączenia z Google: ' + (e?.message ?? e), { status: 500 })
  }
}
