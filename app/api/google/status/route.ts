import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

/** Lista połączonych kont Google (bez tokenów) — do podglądu/diagnostyki. */
export async function GET() {
  try {
    const admin = supabaseAdmin()
    const { data } = await admin.from('google_accounts')
      .select('owner_key, email, receive_all, artist_id, calendar_id, updated_at')
      .order('updated_at', { ascending: false })
    const { count } = await admin.from('gcal_event_map').select('*', { count: 'exact', head: true })
    return NextResponse.json({ connected: data ?? [], mappedEvents: count ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
