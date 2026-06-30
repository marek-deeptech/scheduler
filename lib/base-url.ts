// Bazowy URL do linków w mailach/SMS. Wyliczany z HOSTA żądania, więc działa
// na produkcji (repertuar.vercel.app) i lokalnie (localhost) bez zależności od
// zmiennej środowiskowej. Fallback: NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost.
export function getBaseUrl(request: Request): string {
  try {
    const h = request.headers
    const host = h.get('x-forwarded-host') ?? h.get('host')
    if (host) {
      const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')
      return `${proto}://${host}`
    }
  } catch {}
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env.replace(/\/+$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
