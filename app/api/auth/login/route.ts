import { NextRequest, NextResponse } from 'next/server'
import { signSession, SESSION_COOKIE, type Role } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET
  const coordPw = process.env.COORD_PASSWORD
  const actorPw = process.env.ACTOR_PASSWORD
  if (!secret || (!coordPw && !actorPw)) {
    return NextResponse.json({ error: 'Logowanie nie jest skonfigurowane (brak AUTH_SECRET / haseł).' }, { status: 500 })
  }

  let password = ''
  try { password = (await req.json())?.password ?? '' } catch { /* noop */ }
  if (!password) return NextResponse.json({ error: 'Podaj hasło.' }, { status: 400 })

  let role: Role | null = null
  if (coordPw && password === coordPw) role = 'coordinator'
  else if (actorPw && password === actorPw) role = 'actor'

  if (!role) return NextResponse.json({ error: 'Nieprawidłowe hasło.' }, { status: 401 })

  const token = await signSession(role, secret)
  const res = NextResponse.json({ ok: true, role })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return res
}
