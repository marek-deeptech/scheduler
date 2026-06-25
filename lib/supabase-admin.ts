import { createClient } from '@supabase/supabase-js'

/**
 * Serwerowy klient Supabase z kluczem service-role.
 * Używany WYŁĄCZNIE w route handlerach (nigdy w kodzie klienta) — omija RLS,
 * więc ma dostęp do tabel z tokenami Google (google_accounts, gcal_event_map).
 *
 * Wymaga env: SUPABASE_SERVICE_ROLE_KEY (ustaw na Vercel + w .env.local).
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Brak SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL — wymagane do integracji Google Calendar.')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
