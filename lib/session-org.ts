import { verifySession, SESSION_COOKIE } from '@/lib/auth'

// Odczyt org bieżącej sesji w trasach API (które używają service_role i omijają
// proxy). Zwraca org_id z podpisanego cookie sesji lub null.
export async function sessionOrgId(request: Request): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? ''
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
  const token = m ? decodeURIComponent(m[1]) : null
  const s = await verifySession(token, process.env.AUTH_SECRET || '')
  return s?.orgId ?? null
}
