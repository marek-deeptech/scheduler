import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signSession, SESSION_COOKIE, type Role } from '@/lib/auth'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Logowanie nie jest skonfigurowane (brak AUTH_SECRET).' }, { status: 500 })
  }

  let orgId = ''
  let password = ''
  try {
    const b = await req.json()
    orgId = b?.orgId ?? ''
    password = b?.password ?? ''
  } catch { /* noop */ }
  if (!orgId)   return NextResponse.json({ error: 'Wybierz teatr.' }, { status: 400 })
  if (!password) return NextResponse.json({ error: 'Podaj hasło.' }, { status: 400 })

  const { data: org } = await supabase
    .from('organizations')
    .select('id, coord_password, actor_password, active')
    .eq('id', orgId)
    .single()
  if (!org || org.active === false) {
    return NextResponse.json({ error: 'Nieprawidłowy teatr.' }, { status: 401 })
  }

  // Siatka bezpieczeństwa rollout: dla org bazowej (Fundacja) akceptuj też hasła z
  // env (COORD_PASSWORD/ACTOR_PASSWORD), by nie zablokować prod. Inne org — tylko DB.
  const FUNDACJA_ID = '11111111-1111-1111-1111-111111111111'
  const envCoord = org.id === FUNDACJA_ID ? process.env.COORD_PASSWORD : undefined
  const envActor = org.id === FUNDACJA_ID ? process.env.ACTOR_PASSWORD : undefined

  let role: Role | null = null
  if ((org.coord_password && password === org.coord_password) || (envCoord && password === envCoord)) role = 'coordinator'
  else if ((org.actor_password && password === org.actor_password) || (envActor && password === envActor)) role = 'actor'
  if (!role) return NextResponse.json({ error: 'Nieprawidłowe hasło.' }, { status: 401 })

  const token = await signSession(role, org.id, secret)
  const res = NextResponse.json({ ok: true, role, orgId: org.id })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return res
}
