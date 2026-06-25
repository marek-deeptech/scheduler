/**
 * Integracja Google Calendar (Opcja B) — czysty fetch do Google REST API,
 * bez zależności `googleapis` (lżejsze dla serverless).
 *
 * Env wymagane:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 */

const TOKEN_URL    = 'https://oauth2.googleapis.com/token'
const AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const CAL_BASE     = 'https://www.googleapis.com/calendar/v3'

// Zapis + odczyt eventów w kalendarzu użytkownika + jego email (do identyfikacji konta).
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
]

function clientId()     { return process.env.GOOGLE_CLIENT_ID! }
function clientSecret() { return process.env.GOOGLE_CLIENT_SECRET! }
function redirectUri()  { return process.env.GOOGLE_REDIRECT_URI! }

/** URL ekranu zgody Google (access_type=offline + prompt=consent → dostajemy refresh_token). */
export function buildAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${p.toString()}`
}

/** Wymiana authorization code → tokeny (zawiera refresh_token przy pierwszej zgodzie). */
export async function exchangeCode(code: string): Promise<{ refresh_token?: string; access_token: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error('exchangeCode failed: ' + (await res.text()))
  return res.json()
}

/** refresh_token → świeży access_token. */
export async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('token refresh failed: ' + (await res.text()))
  return (await res.json()).access_token
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  return (await res.json()).email ?? null
}

// ── Mapowanie eventu apki → ciało eventu Google ──────────────────────────────

export interface AppEvent {
  id: string
  title: string | null
  type: string | null
  start_time: string
  end_time: string | null
  location?: string | null
  room_name?: string | null
  theatre_name?: string | null
  production_title?: string | null
  cast_names?: string[]
}

export function toGoogleEvent(ev: AppEvent): Record<string, unknown> {
  // Założenie: start_time/end_time to POPRAWNE instanty UTC (z offsetem),
  // więc wysyłamy je wprost — Google pokaże je w strefie kalendarza użytkownika.
  // timeZone podajemy informacyjnie (Europe/Warsaw).
  const start = new Date(ev.start_time)
  const end   = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 2 * 60 * 60 * 1000)
  const loc = ev.room_name
    ? `${ev.theatre_name ? ev.theatre_name + ' — ' : ''}${ev.room_name}`
    : (ev.location ?? ev.theatre_name ?? undefined)
  const descLines: string[] = []
  if (ev.type) descLines.push(`Typ: ${ev.type}`)
  if (ev.production_title) descLines.push(`Tytuł: ${ev.production_title}`)
  if (ev.cast_names?.length) descLines.push(`Obsada: ${ev.cast_names.join(', ')}`)
  descLines.push('— Repertuar (Teatr Polonia / Och-Teatr)')

  return {
    summary: ev.title ?? ev.production_title ?? 'Wydarzenie',
    location: loc,
    description: descLines.join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Warsaw' },
    end:   { dateTime: end.toISOString(),   timeZone: 'Europe/Warsaw' },
    // Stabilny powrót do źródła — pomocne przy diagnostyce.
    extendedProperties: { private: { appEventId: ev.id } },
  }
}

// ── Operacje na kalendarzu ───────────────────────────────────────────────────

async function calRequest(accessToken: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${CAL_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res
}

/** Tworzy event w Google, zwraca jego google_event_id. */
export async function gcalInsert(accessToken: string, calendarId: string, body: Record<string, unknown>): Promise<string> {
  const res = await calRequest(accessToken, 'POST', `/calendars/${encodeURIComponent(calendarId)}/events`, body)
  if (!res.ok) throw new Error('gcalInsert failed: ' + (await res.text()))
  return (await res.json()).id
}

/** Aktualizuje istniejący event Google. Zwraca true; przy 404/410 (skasowany) zwraca false. */
export async function gcalPatch(accessToken: string, calendarId: string, googleEventId: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await calRequest(accessToken, 'PATCH', `/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`, body)
  if (res.status === 404 || res.status === 410) return false
  if (!res.ok) throw new Error('gcalPatch failed: ' + (await res.text()))
  return true
}

/** Usuwa event z Google. 404/410 traktujemy jako sukces (już go nie ma). */
export async function gcalDelete(accessToken: string, calendarId: string, googleEventId: string): Promise<void> {
  const res = await calRequest(accessToken, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`)
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error('gcalDelete failed: ' + (await res.text()))
  }
}
