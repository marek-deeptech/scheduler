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

// Tabele globalne (wspólna taksonomia, bez org_id) — NIE scopujemy.
const GLOBAL_TABLES = new Set(['teams', 'event_types'])

async function handle(req: NextRequest, path: string[]) {
  if (!SUPA || !SERVICE) {
    return NextResponse.json({ error: 'Proxy bazy nie jest skonfigurowane (brak SUPABASE_SERVICE_ROLE_KEY).' }, { status: 500 })
  }
  // Defense in depth — wymagaj ważnej sesji.
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET || '')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const method = req.method
  const table  = path[0] ?? ''
  // Izolacja najemcy: scopujemy wszystko poza RPC i tabelami globalnymi.
  const scope  = table !== 'rpc' && !GLOBAL_TABLES.has(table)
  const orgId  = session.orgId

  // Query: dla odczytów i PATCH/DELETE doklej filtr org_id=eq.<org>.
  const search = new URLSearchParams(req.nextUrl.searchParams)
  if (scope && (method === 'GET' || method === 'HEAD' || method === 'PATCH' || method === 'DELETE')) {
    search.append('org_id', `eq.${orgId}`)
  }
  const qs = search.toString()
  const target = `${SUPA}/rest/v1/${path.map(encodeURIComponent).join('/')}${qs ? `?${qs}` : ''}`

  const headers = new Headers()
  for (const h of REQ_HEADERS) { const v = req.headers.get(h); if (v) headers.set(h, v) }
  headers.set('apikey', SERVICE)
  headers.set('authorization', `Bearer ${SERVICE}`)

  // Body: dla zapisów wstrzyknij org_id (POST/PUT) albo usuń go (PATCH — nie pozwól
  // przenieść wiersza do cudzej org). Filtr org_id=eq.<org> wyżej i tak blokuje cudze.
  let body: ArrayBuffer | string | undefined
  if (method === 'GET' || method === 'HEAD') {
    body = undefined
  } else {
    const raw = await req.arrayBuffer()
    if (scope && raw.byteLength && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      try {
        const json = JSON.parse(new TextDecoder().decode(raw))
        const stamp = (row: any) => {
          if (!row || typeof row !== 'object') return row
          if (method === 'PATCH') { const { org_id: _drop, ...rest } = row; return rest }
          return { ...row, org_id: orgId }
        }
        body = JSON.stringify(Array.isArray(json) ? json.map(stamp) : stamp(json))
        headers.set('content-type', 'application/json')
      } catch {
        body = raw   // nie-JSON — przekaż jak jest (NOT NULL org_id i tak zablokuje wstawienie bez org)
      }
    } else {
      body = raw
    }
  }

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
