import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { sendEmail, emailWrapper } from '@/lib/email'
import { logMessages } from '@/lib/message-log'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Statusy blokujące występ — tylko one generują alarm
const BLOCKING_STATUSES = ['Niedostępny', 'Choroba', 'Urlop']

function fmtPolish(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function dateOf(iso: string) {
  return iso.slice(0, 10)
}

async function coordinatorEmail(orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('org_id', orgId)
    .eq('key', 'coordinator_email')
    .maybeSingle()
  return data?.value || process.env.COORDINATOR_EMAIL || null
}

export async function POST(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })
  const { artistId, days } = await request.json() as {
    artistId: string
    days: { date: string; status: string; note?: string | null }[]
  }

  if (!artistId || !days?.length) {
    return Response.json({ ok: false, error: 'Missing artistId or days' }, { status: 400 })
  }

  const blocking = days.filter(d => BLOCKING_STATUSES.includes(d.status))
  if (blocking.length === 0) {
    return Response.json({ ok: true, affected: 0 })
  }

  const dateSet = new Set(blocking.map(d => d.date))
  const dates = [...dateSet].sort()
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]

  // Wydarzenia w zakresie dat
  const { data: events } = await supabase
    .from('events')
    .select('id, title, type, start_time, end_time, production_id, productions(title)')
    .eq('org_id', orgId)
    .gte('start_time', `${minDate}T00:00:00`)
    .lte('start_time', `${maxDate}T23:59:59`)

  const eventsOnDays = ((events ?? []) as any[]).filter(e => dateSet.has(dateOf(e.start_time)))

  let affectedEvents: any[] = []
  if (eventsOnDays.length > 0) {
    const eventIds = eventsOnDays.map(e => e.id)
    const [{ data: evArtists }, { data: artistProds }] = await Promise.all([
      supabase.from('event_artists').select('event_id, artist_id').eq('org_id', orgId).in('event_id', eventIds),
      supabase.from('artist_productions').select('production_id').eq('org_id', orgId).eq('artist_id', artistId),
    ])

    const prodIds = new Set(((artistProds ?? []) as any[]).map(r => r.production_id))
    const castByEvent: Record<string, string[]> = {}
    for (const r of ((evArtists ?? []) as any[])) {
      ;(castByEvent[r.event_id] ??= []).push(r.artist_id)
    }

    // Jawna obsada wydarzenia nadpisuje obsadę produkcji
    affectedEvents = eventsOnDays.filter(e => {
      const explicit = castByEvent[e.id]
      if (explicit && explicit.length > 0) return explicit.includes(artistId)
      return e.production_id ? prodIds.has(e.production_id) : false
    })
  }

  if (affectedEvents.length === 0) {
    return Response.json({ ok: true, affected: 0 })
  }

  const { data: artist } = await supabase
    .from('artists')
    .select('name')
    .eq('org_id', orgId)
    .eq('id', artistId)
    .single()
  const artistName = artist?.name ?? 'Aktor'

  affectedEvents.sort((a, b) => a.start_time.localeCompare(b.start_time))

  const statusByDate: Record<string, { status: string; note?: string | null }> = {}
  for (const d of blocking) statusByDate[d.date] = d

  const eventLines = affectedEvents.map(e => {
    const prod = Array.isArray(e.productions) ? e.productions[0] : e.productions
    const title = prod?.title ?? e.title
    const day = statusByDate[dateOf(e.start_time)]
    return {
      html: `<div style="border-left:3px solid #ef4444;padding:0 12px;margin:12px 0">
        <p style="font-weight:600;margin:4px 0;font-size:14px">${title}</p>
        <p style="color:#6b7280;font-size:12px;margin:4px 0">${fmtPolish(e.start_time)} · ${fmtTime(e.start_time)}–${fmtTime(e.end_time)}</p>
        <p style="font-size:12px;margin:4px 0;color:#dc2626;font-weight:600">${day?.status ?? ''}${day?.note ? ` — „${day.note}"` : ''}</p>
      </div>`,
      text: `${title}, ${fmtPolish(e.start_time)} ${fmtTime(e.start_time)} — ${day?.status ?? ''}${day?.note ? ` („${day.note}")` : ''}`,
    }
  })

  const isSick = blocking.some(d => d.status === 'Choroba')
  const subject = isSick
    ? `[Alarm] ${artistName} — choroba, ${affectedEvents.length} ${affectedEvents.length === 1 ? 'spektakl zagrożony' : 'spektakli zagrożonych'}`
    : `[Alarm] ${artistName} — zmiana dostępności, ${affectedEvents.length} ${affectedEvents.length === 1 ? 'spektakl zagrożony' : 'spektakli zagrożonych'}`

  const html = emailWrapper(`
    <h2 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#dc2626">Zmiana dostępności: ${artistName}</h2>
    <p style="color:#6b7280;margin:0 0 20px;font-size:14px">
      Aktor zgłosił niedostępność w terminach, w których jest w obsadzie zatwierdzonego repertuaru.
      Sprawdź obsadę i w razie potrzeby wyznacz zastępstwo.
    </p>
    ${eventLines.map(l => l.html).join('')}
  `)

  const to = await coordinatorEmail(orgId)
  let emailOk = false
  if (to) {
    emailOk = await sendEmail(to, subject, html)
  } else {
    console.error('Brak adresu koordynatora (app_settings.coordinator_email / COORDINATOR_EMAIL)')
  }

  await logMessages(supabase, [{
    artist_id: artistId,
    type: emailOk ? 'email' : 'app',
    direction: 'to_coordinator',
    kind: 'availability_change',
    subject,
    body: eventLines.map(l => l.text).join('\n'),
    related_event_id: affectedEvents[0]?.id ?? null,
  }], orgId)

  return Response.json({ ok: true, affected: affectedEvents.length, emailSent: emailOk })
}
