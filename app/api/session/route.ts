import { createClient } from '@supabase/supabase-js'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Kontekst bieżącej sesji dla klienta: organizacja (nazwa, horyzont planowania,
// logo) + rola. Zasila OrgContext (nagłówek, długość osi planowania).
export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') ?? ''
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
  const token = m ? decodeURIComponent(m[1]) : null
  const s = await verifySession(token, process.env.AUTH_SECRET || '')
  if (!s) return Response.json({ error: 'Brak sesji' }, { status: 401 })

  // Tolerancyjnie na brak kolumny logo_url (migracja brandingu może jeszcze nie być).
  const sel = (withLogo: boolean) =>
    `id, name, slug, planning_horizon_months${withLogo ? ', logo_url' : ''}`
  let { data, error } = await supabase.from('organizations').select(sel(true)).eq('id', s.orgId).single()
  if (error) { const r = await supabase.from('organizations').select(sel(false)).eq('id', s.orgId).single(); data = r.data as any }
  if (!data) return Response.json({ error: 'Organizacja nieznana' }, { status: 404 })

  const org = data as any
  return Response.json({
    role: s.role,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      planningHorizonMonths: org.planning_horizon_months ?? 2,
      logoUrl: org.logo_url ?? null,
    },
  })
}
