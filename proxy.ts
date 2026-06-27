import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'

// Ścieżki dostępne BEZ logowania:
// - strona logowania i jej API
// - publiczne linki tokenowe z maili (potwierdzenia dostępności / sloty)
const PUBLIC = [
  '/login',
  '/api/auth',
  '/confirm',
  '/slot',
  '/api/confirmations/respond',
  '/api/slots/respond',
]

function isPublic(path: string): boolean {
  return PUBLIC.some(p => path === p || path.startsWith(p + '/'))
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySession(token, process.env.AUTH_SECRET || '')
  if (session) return NextResponse.next()

  // Brak ważnej sesji
  if (pathname.startsWith('/api/') || pathname.startsWith('/rest/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

// Pomijamy zasoby statyczne i obrazy.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|ico|webp|gif|css|js|txt|woff2?)$).*)'],
}
