import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'
import { logMessages } from '@/lib/message-log'

function fmtPolish(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

interface ConflictItem {
  eventA: { title: string; start_time: string; end_time: string }
  eventB: { title: string; start_time: string; end_time: string }
  reasons: string[]
  artistNames: string[]
  roomName: string | null
}

export async function POST(request: Request) {
  const { conflicts } = await request.json() as { conflicts: ConflictItem[] }

  const coordinatorEmail = process.env.COORDINATOR_EMAIL
  if (!coordinatorEmail) {
    console.error('COORDINATOR_EMAIL not set')
    return Response.json({ ok: false, error: 'COORDINATOR_EMAIL not set' }, { status: 500 })
  }

  const today = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  const count = conflicts.length

  const conflictCards = conflicts.map(c => {
    const dateLabel = fmtPolish(c.eventA.start_time)
    const artistLine = c.artistNames.length > 0
      ? `<p style="margin:4px 0;font-size:13px">Osoba: ${c.artistNames.join(', ')}</p>`
      : ''
    const roomLine = c.roomName
      ? `<p style="margin:4px 0;font-size:13px">Sala: ${c.roomName}</p>`
      : ''
    return `
      <div style="border-left:3px solid #ef4444;padding:0 12px;margin:12px 0">
        <p style="font-weight:600;margin:4px 0;font-size:14px">${c.eventA.title} vs ${c.eventB.title}</p>
        <p style="color:#6b7280;font-size:12px;margin:4px 0">${dateLabel} · ${fmtTime(c.eventA.start_time)}–${fmtTime(c.eventA.end_time)} / ${fmtTime(c.eventB.start_time)}–${fmtTime(c.eventB.end_time)} · ${c.reasons.join(', ')}</p>
        ${artistLine}
        ${roomLine}
      </div>
    `
  }).join('')

  const html = emailWrapper(`
    <h2 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#dc2626">Konflikty grafiku</h2>
    <p style="color:#6b7280;margin:0 0 20px">Wykryto ${count} ${count === 1 ? 'konflikt' : 'konfliktów'} w grafiku na najbliższy tydzień.</p>
    ${conflictCards}
  `)

  const subject = `[Konflikty] ${count} konfliktów grafiku — ${today}`
  const ok = await sendEmail(coordinatorEmail, subject, html)

  if (ok) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const summary = conflicts
      .map(c => `${c.eventA.title} vs ${c.eventB.title} (${fmtPolish(c.eventA.start_time)})${c.artistNames.length ? ` — ${c.artistNames.join(', ')}` : ''}`)
      .join('\n')
    await logMessages(supabase, [{
      artist_id: null,
      type: 'email',
      direction: 'to_coordinator',
      kind: 'conflict_alert',
      subject,
      body: summary,
    }])
  }

  return Response.json({ ok })
}
