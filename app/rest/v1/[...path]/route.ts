import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'

// Serwerowy proxy do Supabase REST (PostgREST).
// Klient przeglądarki celuje w /rest/v1/* (same-origin), a my przekazujemy
// żądanie do prawdziwego Supabase z kluczem service_role — NIGDY nie wysyłając
// tego klucza do przeglądarki. Dostęp wymaga ważnej sesji (cookie).
//
// proxy.ts już blokuje /rest/* bez sesji, ale weryfikujemy też tutaj (defense in depth).

export const runtime = 'nodejs'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const REQ_HEADERS = ['content-type', 'prefer', 'range', 'range-unit', 'accept', 'accept-profile', 'content-profile', 'x-client-info']
const RES_HEADERS = ['content-type', 'content-range', 'range-unit', 'content-profile', 'preference-applied']

async function handle(req: NextRequest, path: string[]) {
  if (!SUPA || !SERVICE) {
    return NextResponse.json({ error: 'Proxy bazy nie jest skonfigurowane (brak SUPABASE_SERVICE_ROLE_KEY).' }, { status: 500 })
  }
  // Defense in depth — wymagaj ważnej sesji.
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET || '')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const target = `${SUPA}/rest/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`

  const headers = new Headers()
  for (const h of REQ_HEADERS) { const v = req.headers.get(h); if (v) headers.set(h, v) }
  headers.set('apikey', SERVICE)
  headers.set('authorization', `Bearer ${SERVICE}`)

  const method = req.method
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer()

  const upstream = await fetch(target, { method, headers, body, redirect: 'manual', cache: 'no-store' })

  const resHeaders = new Headers()
  for (const h of RES_HEADERS) { const v = upstream.headers.get(h); if (v) resHeaders.set(h, v) }
  // 204/205/304 (np. DELETE albo Prefer: return=minimal) NIE mogą mieć ciała —
  // inaczej konstruktor Response rzuca i całe żądanie kończy się 500.
  const noBody = [101, 204, 205, 304].includes(upstream.status)
  const buf = noBody ? null : await upstream.arrayBuffer()
  return new NextResponse(buf, { status: upstream.status, headers: resHeaders })
}

type Ctx = { params: Promise<{ path: string[] }> }
const run = (m: string) => async (req: NextRequest, ctx: Ctx) => handle(req, (await ctx.params).path)

export const GET = run('GET')
export const POST = run('POST')
export const PATCH = run('PATCH')
export const PUT = run('PUT')
export const DELETE = run('DELETE')
export const HEAD = run('HEAD')
export const OPTIONS = run('OPTIONS')
