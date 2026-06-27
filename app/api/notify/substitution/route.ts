import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { logMessages, type MessageLogRow } from '@/lib/message-log'
import { bumpInviteSeqs, inviteAttachment } from '@/lib/calendar-invite'
import { localFromStored, type Vevent } from '@/lib/ics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function fmtPolish(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export async function POST(request: Request) {
  const { removedArtistId, substituteId, eventIds, productionTitle } = await request.json() as {
    removedArtistId: string
    substituteId: string
    eventIds: string[]
    productionTitle: string
  }

  if (!substituteId || !eventIds?.length) {
    return Response.json({ ok: false, error: 'Missing substituteId or eventIds' }, { status: 400 })
  }

  const { data: artists } = await supabase
    .from('artists')
    .select('id, name, email, phone')
    .in('id', [removedArtistId, substituteId].filter(Boolean))

  const byId: Record<string, { name: string; email: string | null; phone: string | null }> = {}
  for (const a of (artists ?? []) as any[]) {
    byId[a.id] = { name: a.name, email: a.email, phone: a.phone }
  }

  const { data: events } = await supabase
    .from('events')
    .select('id, title, type, start_time, end_time, production_id')
    .in('id', eventIds)

  const evs = ((events ?? []) as any[]).sort((a, b) => a.start_time.localeCompare(b.start_time))
  if (evs.length === 0) return Response.json({ ok: true, sent: 0 })

  const firstEv = evs[0]
  const dateLabel = fmtPolish(firstEv.start_time)
  const timeLabel = `${fmtTime(firstEv.start_time)}–${fmtTime(firstEv.end_time)}`
  const logRows: MessageLogRow[] = []
  let sent = 0

  // ── Substitute: prośba o potwierdzenie ──────────────────────────────────────
  const sub = byId[substituteId]
  if (sub) {
    // Utwórz potwierdzenia dla wydarzeń zastępcy
    const sentAt = new Date().toISOString()
    const payload = eventIds.map(event_id => ({ event_id, artist_id: substituteId, status: 'pending', sent_at: sentAt }))
    const { data: confs } = await supabase
      .from('event_confirmations')
      .upsert(payload, { onConflict: 'event_id,artist_id' })
      .select('event_id, token')
    const tokenByEvent: Record<string, string> = {}
    for (const c of (confs ?? []) as any[]) tokenByEvent[c.event_id] = c.token

    if (sub.email) {
      const token = tokenByEvent[firstEv.id]
      const link = token
        ? `<a href="${APP_URL}/confirm/${token}" style="display:inline-block;padding:10px 22px;border-radius:10px;background:#16a34a;color:#fff;font-size:14px;font-weight:700;text-decoration:none">Potwierdź udział</a>`
        : ''
      const html = emailWrapper(`
        <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Zastępstwo — prośba o potwierdzenie</h2>
        <p style="color:#6b7280;margin:0 0 20px;font-size:14px">
          Cześć ${sub.name}, zostałeś wyznaczony jako zastępstwo w spektaklu <b>${productionTitle}</b>.
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;width:120px">Spektakl</td><td style="padding:8px 0;font-size:13px;font-weight:600">${productionTitle}</td></tr>
          <tr style="border-top:1px solid #f3f4f6"><td style="padding:8px 0;font-size:13px;color:#6b7280">Termin</td><td style="padding:8px 0;font-size:13px;font-weight:600">${dateLabel}, ${timeLabel}</td></tr>
        </table>
        <div>${link}</div>
      `)
      const seqMap = await bumpInviteSeqs(supabase, eventIds.map(id => ({ event_id: id, artist_id: substituteId })))
      const vevents: Vevent[] = evs.map(e => {
        const s = seqMap.get(`${e.id}:${substituteId}`)!
        return {
          uid: s.uid, sequence: s.sequence,
          startLocal: localFromStored(e.start_time), endLocal: localFromStored(e.end_time),
          summary: `${productionTitle} (zastępstwo)`,
          description: 'Zastępstwo — potwierdź udział w aplikacji.',
        }
      })
      const ok = await sendEmail(sub.email, `[Zastępstwo] ${productionTitle} — ${dateLabel}`, html,
        { attachments: [inviteAttachment('REQUEST', { name: sub.name, email: sub.email }, vevents)] })
      if (ok) {
        sent++
        logRows.push({
          artist_id: substituteId,
          type: 'email',
          kind: 'substitution',
          subject: `Zastępstwo: ${productionTitle} — ${dateLabel}`,
          body: `Wyznaczono Cię jako zastępstwo: ${productionTitle}, ${dateLabel}, ${timeLabel}. Prosimy o potwierdzenie.`,
          related_event_id: firstEv.id,
          related_production_id: firstEv.production_id ?? null,
        })
      }
    }
    if (sub.phone) {
      const smsText = `Zastępstwo: grasz w „${productionTitle}", ${dateLabel}, godz. ${fmtTime(firstEv.start_time)}. Potwierdź w aplikacji lub mailu.`
      const ok = await sendSms(sub.phone, smsText)
      if (ok) {
        sent++
        logRows.push({
          artist_id: substituteId,
          type: 'sms',
          kind: 'substitution',
          subject: `Zastępstwo: ${productionTitle}`,
          body: smsText,
          related_event_id: firstEv.id,
        })
      }
    }
  }

  // ── Removed actor: informacja o zwolnieniu z obsady ──────────────────────────
  const removed = removedArtistId ? byId[removedArtistId] : null
  if (removed) {
    const subName = sub?.name ?? 'inny aktor'
    if (removed.email) {
      const html = emailWrapper(`
        <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Zmiana obsady</h2>
        <p style="color:#6b7280;margin:0 0 16px;font-size:14px">
          Cześć ${removed.name}, w związku z konfliktem terminów zostałeś zdjęty z obsady spektaklu
          <b>${productionTitle}</b> w terminie ${dateLabel}, ${timeLabel}. Zastąpi Cię ${subName}.
        </p>
        <p style="font-size:12px;color:#9ca3af;margin:0">W razie pytań skontaktuj się z koordynatorem.</p>
      `)
      const seqMap = await bumpInviteSeqs(supabase, eventIds.map(id => ({ event_id: id, artist_id: removedArtistId! })), true)
      const vevents: Vevent[] = evs.map(e => {
        const s = seqMap.get(`${e.id}:${removedArtistId}`)!
        return {
          uid: s.uid, sequence: s.sequence,
          startLocal: localFromStored(e.start_time), endLocal: localFromStored(e.end_time),
          summary: productionTitle,
        }
      })
      const ok = await sendEmail(removed.email, `[Zmiana obsady] ${productionTitle} — ${dateLabel}`, html,
        { attachments: [inviteAttachment('CANCEL', { name: removed.name, email: removed.email }, vevents)] })
      if (ok) {
        sent++
        logRows.push({
          artist_id: removedArtistId,
          type: 'email',
          kind: 'substitution',
          subject: `Zmiana obsady: ${productionTitle} — ${dateLabel}`,
          body: `Zdjęto Cię z obsady: ${productionTitle}, ${dateLabel}, ${timeLabel}. Zastępuje: ${subName}.`,
          related_event_id: firstEv.id,
        })
      }
    }
    if (removed.phone) {
      const smsText = `Zmiana obsady: zdjęto Cię z „${productionTitle}", ${dateLabel}, godz. ${fmtTime(firstEv.start_time)}. Zastępuje: ${subName}.`
      const ok = await sendSms(removed.phone, smsText)
      if (ok) {
        sent++
        logRows.push({
          artist_id: removedArtistId,
          type: 'sms',
          kind: 'substitution',
          subject: `Zmiana obsady: ${productionTitle}`,
          body: smsText,
          related_event_id: firstEv.id,
        })
      }
    }
  }

  await logMessages(supabase, logRows)
  return Response.json({ ok: true, sent })
}
