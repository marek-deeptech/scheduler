import { createClient } from '@supabase/supabase-js'

// Klient przeglądarki NIE łączy się już bezpośrednio z Supabase publicznym
// kluczem anon. Wszystkie zapytania idą przez nasz serwerowy proxy /rest/v1
// (same-origin), który dokłada klucz service_role i wymaga ważnej sesji
// (httpOnly cookie). Dzięki temu publiczny klucz anon nie jest już potrzebny
// w przeglądarce, a po włączeniu RLS baza jest zamknięta od zewnątrz.

const base =
  typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')

export const supabase = createClient(base, 'browser-proxy', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    // credentials: 'same-origin' → przeglądarka dołącza httpOnly cookie sesji.
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, credentials: 'same-origin' }),
  },
})
