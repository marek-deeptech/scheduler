import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { getBaseUrl } from '@/lib/base-url'
import { randomUUID } from 'node:crypto'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { logMessages, type MessageLogRow } from '@/lib/message-log'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
  const e = new Date(end + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${s} – ${e}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(request: Request) {
  const APP_URL = getBaseUrl(request)
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })
  const { slotId, artistId, message } = await request.json() as { slotId: string; artistId?: string; message?: string }
  if (!slotId) return Response.json({ ok: false, error: 'Missing slotId' }, { status: 400 })

  // Własna treść ankiety (edytowalna w modalu); pusta → domyślna.
  const customMessage = (message ?? '').trim() || null

  const { data: slot } = await supabase
    .from('repertoire_slots')
    .select('id, window_start, window_end, target_performances, production_id, productions(title)')
    .eq('org_id', orgId)
    .eq('id', slotId)
    .single()
  if (!slot) return Response.json({ ok: false, error: 'Slot not found' }, { status: 404 })

  const prod = Array.isArray((slot as any).productions) ? (slot as any).productions[0] : (slot as any).productions
  const title = prod?.title ?? 'Spektakl'
  const rangeLabel = fmtRange((slot as any).window_start, (slot as any).window_end)

  // Obsada tytułu
  const { data: cast } = await supabase
    .from('artist_productions')
    .select('artists(id, name, email, phone)')
    .eq('org_id', orgId)
    .eq('production_id', (slot as any).production_id)

  let members = ((cast ?? []) as any[])
    .map(r => (Array.isArray(r.artists) ? r.artists[0] : r.artists))
    .filter(Boolean) as { id: string; name: string; email: string | null; phone: string | null }[]

  // Ponowienie do jednego aktora
  if (artistId) members = members.filter(m => m.id === artistId)

  if (members.length === 0) return Response.json({ ok: true, sent: 0, total: 0 })

  // Istniejące zaproszenia (by nie dublować tokenów)
  const { data: existing } = await supabase
    .from('slot_invites')
    .select('artist_id, token')
    .eq('org_id', orgId)
    .eq('slot_id', slotId)
  const tokenByArtist: Record<string, string> = {}
  for (const e of (existing ?? []) as any[]) tokenByArtist[e.artist_id] = e.token

  // Utwórz brakujące zaproszenia
  const toCreate = members
    .filter(m => !tokenByArtist[m.id])
    .map(m => ({ org_id: orgId, slot_id: slotId, artist_id: m.id, token: randomUUID() }))
  if (toCreate.length > 0) {
    const { data: created } = await supabase.from('slot_invites').insert(toCreate).select('artist_id, token')
    for (const c of (created ?? []) as any[]) tokenByArtist[c.artist_id] = c.token
  }

  const logRows: MessageLogRow[] = []
  let sent = 0

  for (const m of members) {
    const token = tokenByArtist[m.id]
    if (!token) continue
    const link = `${APP_URL}/slot/${token}`
    let notified = false

    if (m.email) {
      const intro = customMessage
        ? `<p style="color:#374151;margin:0 0 16px;font-size:14px;white-space:pre-wrap">${escapeHtml(customMessage)}</p>`
        : `<p style="color:#6b7280;margin:0 0 16px;font-size:14px">
            Cześć ${m.name}, planujemy <b>${title}</b> w oknie <b>${rangeLabel}</b>.
            Zaznacz dni, w które możesz zagrać (max ${(slot as any).target_performances} grań).
          </p>`
      const html = emailWrapper(`
        <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Dostępność na spektakl — ${title}</h2>
        ${intro}
        <div style="margin:8px 0 20px">
          <a href="${link}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#c8102e;color:#fff;font-size:15px;font-weight:700;text-decoration:none">Podaj dostępność</a>
        </div>
        <p style="font-size:12px;color:#9ca3af;margin:0">Lub otwórz: <a href="${link}" style="color:#4b5563">${link}</a></p>
      `)
      const ok = await sendEmail(m.email, `[Dostępność] ${title} — ${rangeLabel}`, html)
      if (ok) {
        notified = true
        logRows.push({ artist_id: m.id, type: 'email', kind: 'message', subject: `Ankieta dostępności: ${title}`, body: customMessage ?? `Podaj dni, w które możesz zagrać w „${title}" (${rangeLabel}).`, related_production_id: (slot as any).production_id })
      }
    }
    if (m.phone) {
      const sms = customMessage
        ? `${customMessage} ${link}`
        : `Dostepnosc na "${title}" (${rangeLabel}). Zaznacz dni, w ktore mozesz zagrac: ${link}`
      const ok = await sendSms(m.phone, sms)
      if (ok) {
        notified = true
        logRows.push({ artist_id: m.id, type: 'sms', kind: 'message', subject: `Ankieta dostępności: ${title}`, body: sms, related_production_id: (slot as any).production_id })
      }
    }
    if (notified) sent++
  }

  await logMessages(supabase, logRows, orgId)
  return Response.json({ ok: true, sent, total: members.length })
}
