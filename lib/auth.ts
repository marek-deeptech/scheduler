// Wspólne-hasło: sesja jako podpisane (HMAC-SHA256) httpOnly cookie.
// Działa zarówno w edge runtime (middleware), jak i w node (API routes) —
// używa wyłącznie Web Crypto (globalne `crypto.subtle`).

export type Role = 'coordinator' | 'actor'
export interface Session { role: Role; exp: number }

export const SESSION_COOKIE = 'tp_session'

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret) as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

// Web Crypto oczekuje BufferSource; nowe typy TS dla Uint8Array bywają z tym
// niezgodne, więc rzutujemy jawnie w jednym miejscu.
const src = (u: Uint8Array): BufferSource => u as unknown as BufferSource

export async function signSession(role: Role, secret: string, ttlDays = 30): Promise<string> {
  const payload: Session = { role, exp: Date.now() + ttlDays * 86_400_000 }
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const key = await hmacKey(secret)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, src(enc.encode(body))))
  return `${body}.${b64url(sig)}`
}

export async function verifySession(token: string | undefined | null, secret: string): Promise<Session | null> {
  if (!token || !secret) return null
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const key = await hmacKey(secret)
    const ok = await crypto.subtle.verify('HMAC', key, src(fromB64url(sig)), src(enc.encode(body)))
    if (!ok) return null
    const s = JSON.parse(dec.decode(fromB64url(body))) as Session
    if (!s.exp || s.exp < Date.now()) return null
    if (s.role !== 'coordinator' && s.role !== 'actor') return null
    return s
  } catch {
    return null
  }
}
