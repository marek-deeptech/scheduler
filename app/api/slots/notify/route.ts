// Powiadomienie obsady o ZATWIERDZONYCH terminach slotu Favourite.
// Świadomie osobny krok od zatwierdzania dni: ustawienie slotu niczego nie wysyła,
// dopiero CTA „Powiadom aktorów o fav slots" w edytorze slotów wywołuje tę trasę.
import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { logMessages, type MessageLogRow } from '@/lib/message-log'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function fmtDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })

  const { slotId, message } = await request.json() as { slotId: string; message?: string }
  if (!slotId) return Response.json({ ok: false, error: 'Missing slotId' }, { status: 400 })
  const customMessage = (message ?? '').trim() || null

  const { data: slot } = await supabase
    .from('repertoire_slots')
    .select('id, locked_dates, production_id, productions(title)')
    .eq('org_id', orgId)
    .eq('id', slotId)
    .single()
  if (!slot) return Response.json({ ok: false, error: 'Slot not found' }, { status: 404 })

  const dates: string[] = Array.isArray((slot as any).locked_dates) ? [...(slot as any).locked_dates].sort() : []
  if (dates.length === 0) {
    return Response.json({ ok: false, error: 'Slot nie ma zatwierdzonych dni' }, { status: 400 })
  }

  const prod = Array.isArray((slot as any).productions) ? (slot as any).productions[0] : (slot as any).productions
  const title = prod?.title ?? 'Spektakl'
  const datesLabel = dates.map(fmtDay).join(', ')

  const { data: cast } = await supabase
    .from('artist_productions')
    .select('artists(id, name, email, phone)')
    .eq('org_id', orgId)
    .eq('production_id', (slot as any).production_id)

  const members = ((cast ?? []) as any[])
    .map(r => (Array.isArray(r.artists) ? r.artists[0] : r.artists))
    .filter(Boolean) as { id: string; name: string; email: string | null; phone: string | null }[]

  if (members.length === 0) return Response.json({ ok: true, sent: 0, total: 0 })

  const logRows: MessageLogRow[] = []
  let sent = 0

  for (const m of members) {
    let notified = false

    if (m.email) {
      const intro = customMessage
        ? `<p style="color:#374151;margin:0 0 16px;font-size:14px;white-space:pre-wrap">${escapeHtml(customMessage)}</p>`
        : `<p style="color:#6b7280;margin:0 0 16px;font-size:14px">
            Cześć ${m.name}, ustaliliśmy terminy grania <b>${title}</b>. Prosimy o rezerwację tych dni.
          </p>`
      const html = emailWrapper(`
        <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Terminy spektaklu — ${title}</h2>
        ${intro}
        <ul style="margin:0 0 20px;padding-left:18px;color:#111827;font-size:14px">
          ${dates.map(d => `<li style="margin:4px 0">${fmtDay(d)}</li>`).join('')}
        </ul>
      `)
      const ok = await sendEmail(m.email, `[Terminy] ${title} — ${dates.length} ${dates.length === 1 ? 'granie' : 'grania'}`, html)
      if (ok) {
        notified = true
        logRows.push({
          artist_id: m.id, type: 'email', kind: 'message',
          subject: `Terminy spektaklu: ${title}`,
          body: customMessage ?? `Ustalone terminy „${title}": ${datesLabel}.`,
          related_production_id: (slot as any).production_id,
        })
      }
    }
    if (m.phone) {
      const sms = customMessage ?? `Terminy "${title}": ${datesLabel}. Prosimy o rezerwacje tych dni.`
      const ok = await sendSms(m.phone, sms)
      if (ok) {
        notified = true
        logRows.push({
          artist_id: m.id, type: 'sms', kind: 'message',
          subject: `Terminy spektaklu: ${title}`, body: sms,
          related_production_id: (slot as any).production_id,
        })
      }
    }
    if (notified) sent++
  }

  await logMessages(supabase, logRows, orgId)

  // Slot pozostaje „zaplanowany" dla generatora, ale odnotowujemy powiadomienie obsady.
  await supabase.from('repertoire_slots').update({ status: 'notified' }).eq('org_id', orgId).eq('id', slotId)

  return Response.json({ ok: true, sent, total: members.length })
}
