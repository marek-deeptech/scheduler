import crypto from 'node:crypto'

/** Podpisany state dla OAuth — chroni przed manipulacją owner_key/artist_id i CSRF. */
export interface OAuthState { owner: string; all: boolean; artist: string | null }

function secret() { return process.env.GOOGLE_SYNC_SECRET || 'dev-secret' }

export function signState(s: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(s)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyState(token: string): OAuthState | null {
  const [payload, sig] = (token || '').split('.')
  if (!payload || !sig) return null
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch { return null }
}
