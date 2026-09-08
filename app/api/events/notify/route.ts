import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSmsDetailed } from '@/lib/sms'
import { logMessages, type MessageLogRow } from '@/lib/message-log'
import { bumpInviteSeqs, inviteAttachment } from '@/lib/calendar-invite'
import { localFromStored, type Vevent } from '@/lib/ics'
import { googleCalendarUrl } from '@/lib/gcal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']
function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]}, ${d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}, godz. ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Powiadomienie przypisanych osób o wydarzeniu: e-mail (z zaproszeniem .ics
// i linkiem „dodaj do Google Calendar") + SMS. Wywoływane z panelu wydarzenia.
export async function POST(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })

  const { eventId, message } = await request.json().catch(() => ({}))
  if (!eventId) return Response.json({ ok: false, error: 'Brak eventId' }, { status: 400 })

  const { data: ev } = await supabase
    .from('events')
    .select('id, title, type, start_time, end_time, location, description, rooms(name), event_artists(artists(id, name, email, phone))')
    .eq('org_id', orgId)
    .eq('id', eventId)
    .single()
  if (!ev) return Response.json({ ok: false, error: 'Nie znaleziono wydarzenia' }, { status: 404 })

  const room = (Array.isArray((ev as any).rooms) ? (ev as any).rooms[0] : (ev as any).rooms)?.name ?? null
  const place = [room, (ev as any).location].filter(Boolean).join(', ')
  const members = ((ev as any).event_artists ?? [])
    .map((r: any) => (Array.isArray(r.artists) ? r.artists[0] : r.artists))
    .filter(Boolean) as { id: string; name: string; email: string | null; phone: string | null }[]
  if (members.length === 0) return Response.json({ ok: false, error: 'Do wydarzenia nie przypisano żadnych osób' }, { status: 400 })

  // SEQUENCE dla zaproszeń .ics — aktualizacja wydarzenia podbija numer,
  // więc kalendarze aktorów nadpisują starą wersję zamiast dublować wpis.
  const seqMap = await bumpInviteSeqs(supabase, members.map(m => ({ event_id: ev.id, artist_id: m.id })), false, orgId)

  const when = fmtWhen((ev as any).start_time)
  const custom = typeof message === 'string' && message.trim() ? message.trim() : null
  const gcal = googleCalendarUrl({
    title: (ev as any).title,
    start: (ev as any).start_time,
    end: (ev as any).end_time,
    details: (ev as any).description ?? undefined,
    location: place || undefined,
  })

  const logRows: MessageLogRow[] = []
  let sent = 0, emailsSent = 0, smsSent = 0
  const smsErrors: string[] = []

  for (const m of members) {
    let notified = false
    const intro = custom ?? `Zapraszamy na wydarzenie „${(ev as any).title}".`

    if (m.email) {
      const seq = seqMap.get(`${ev.id}:${m.id}`)
      if (!seq) continue
      const vevent: Vevent = {
        uid: seq.uid,
        sequence: seq.sequence,
        startLocal: localFromStored((ev as any).start_time),
        endLocal: localFromStored((ev as any).end_time),
        summary: (ev as any).title,
        location: place || undefined,
        description: (ev as any).description ?? undefined,
      }
      const attachment = inviteAttachment('REQUEST', { name: m.name, email: m.email }, [vevent])
      const html = emailWrapper(`
        <h2 style="font-size:18px;font-weight:700;margin:0 0 12px">${escapeHtml((ev as any).title)}</h2>
        <p style="color:#374151;margin:0 0 16px;font-size:14px;white-space:pre-wrap">${escapeHtml(intro)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;margin:0 0 16px">
          <tr><td style="padding:2px 12px 2px 0;color:#9ca3af">Termin</td><td style="text-transform:capitalize">${when}</td></tr>
          ${(ev as any).type ? `<tr><td style="padding:2px 12px 2px 0;color:#9ca3af">Rodzaj</td><td>${escapeHtml((ev as any).type)}</td></tr>` : ''}
          ${place ? `<tr><td style="padding:2px 12px 2px 0;color:#9ca3af">Miejsce</td><td>${escapeHtml(place)}</td></tr>` : ''}
        </table>
        <p style="font-size:13px;color:#6b7280;margin:0 0 8px">Zaproszenie do kalendarza jest w załączniku — otwórz je, aby dodać termin. Możesz też użyć linku:</p>
        <div style="margin:0 0 6px"><a href="${gcal}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#1a1410;color:#fff;font-size:13px;font-weight:700;text-decoration:none">Dodaj do Google Calendar</a></div>
      `)
      const ok = await sendEmail(m.email, `Wydarzenie: ${(ev as any).title} — ${when}`, html, { attachments: [attachment] })
      if (ok) {
        notified = true; emailsSent++
        logRows.push({ artist_id: m.id, type: 'email', kind: 'message', subject: `Wydarzenie: ${(ev as any).title}`, body: `${intro}\n${when}${place ? `\n${place}` : ''}`, related_event_id: ev.id })
      }
    }
    if (m.phone) {
      const sms = `${custom ?? `Wydarzenie: ${(ev as any).title}`}. ${when}${place ? `, ${place}` : ''}. Szczegoly i zaproszenie na mailu.`
      const { ok, error } = await sendSmsDetailed(m.phone, sms)
      if (ok) {
        notified = true; smsSent++
        logRows.push({ artist_id: m.id, type: 'sms', kind: 'message', subject: `Wydarzenie: ${(ev as any).title}`, body: sms, related_event_id: ev.id })
      } else if (error && smsErrors.length < 3) smsErrors.push(`${m.name}: ${error}`)
      await new Promise(r => setTimeout(r, 400))
    }
    if (notified) sent++
  }

  await logMessages(supabase, logRows, orgId)
  return Response.json({ ok: true, sent, total: members.length, emailsSent, smsSent, smsErrors })
}
