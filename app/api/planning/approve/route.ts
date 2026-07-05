import { createClient } from '@supabase/supabase-js'
import { getBaseUrl } from '@/lib/base-url'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { logMessages, type MessageLogRow } from '@/lib/message-log'
import { bumpInviteSeqs, inviteAttachment } from '@/lib/calendar-invite'
import { sessionOrgId } from '@/lib/session-org'
import { localFromStored, type Vevent } from '@/lib/ics'
import { googleCalendarUrl } from '@/lib/gcal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


const MONTH_NAMES = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
const MONTH_NOM = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']

// Miejscownik: „grasz w 1 spektaklu" / „grasz w N spektaklach"
function pluralSpektakl(n: number): string {
  return n === 1 ? 'spektaklu' : 'spektaklach'
}

function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month ?? '')
  if (!m) return month ?? ''
  return `${MONTH_NOM[parseInt(m[2], 10) - 1]} ${m[1]}`
}

function fmtDay(iso: string) {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('pl-PL', { weekday: 'short' })
  return `${weekday} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface InsertedEvent {
  id: string
  production_id: string | null
  title: string
  type: string | null
  start_time: string
  end_time: string
}

/** Po zatwierdzeniu: każdy aktor z obsady dostaje zestawienie swoich dat
 *  + prośby o potwierdzenie (event_confirmations) w jednym mailu. */
async function notifyCastAfterApproval(insertedEvents: InsertedEvent[], month: string, APP_URL: string, orgId: string) {
  const productionIds = [...new Set(insertedEvents.map(e => e.production_id).filter(Boolean))] as string[]
  if (productionIds.length === 0) return { notified: 0 }

  const { data: castRows } = await supabase
    .from('artist_productions')
    .select('artist_id, production_id, artists(id, name, email, phone)')
    .eq('org_id', orgId)
    .in('production_id', productionIds)

  // artist -> jego wydarzenia
  const artistEvents: Record<string, InsertedEvent[]> = {}
  const artistInfo: Record<string, { name: string; email: string | null; phone: string | null }> = {}
  for (const row of (castRows ?? []) as any[]) {
    const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists
    if (!artist) continue
    artistInfo[row.artist_id] = { name: artist.name, email: artist.email, phone: artist.phone }
    const evs = insertedEvents.filter(e => e.production_id === row.production_id)
    if (evs.length === 0) continue
    ;(artistEvents[row.artist_id] ??= []).push(...evs)
  }

  // Prośby o potwierdzenie dla wszystkich par (wydarzenie, aktor)
  const confirmationPayload: { org_id: string; event_id: string; artist_id: string; status: string; sent_at: string }[] = []
  const sentAt = new Date().toISOString()
  for (const [artistId, evs] of Object.entries(artistEvents)) {
    for (const ev of evs) {
      confirmationPayload.push({ org_id: orgId, event_id: ev.id, artist_id: artistId, status: 'pending', sent_at: sentAt })
    }
  }

  const tokenMap: Record<string, string> = {} // `${event_id}:${artist_id}` -> token
  if (confirmationPayload.length > 0) {
    const { data: confs } = await supabase
      .from('event_confirmations')
      .upsert(confirmationPayload, { onConflict: 'event_id,artist_id' })
      .select('event_id, artist_id, token')
    for (const c of (confs ?? []) as any[]) {
      tokenMap[`${c.event_id}:${c.artist_id}`] = c.token
    }
  }

  const label = monthLabel(month)
  const logRows: MessageLogRow[] = []
  let notified = 0

  // ⚠️ TEST: wyślij powiadomienia tylko do pierwszych N aktorów (0 = bez limitu).
  // Ustaw 0 (lub usuń ten blok) przed realnym wdrożeniem.
  const TEST_MAX_NOTIFY = 5
  const notifyEntries = TEST_MAX_NOTIFY > 0
    ? Object.entries(artistEvents).slice(0, TEST_MAX_NOTIFY)
    : Object.entries(artistEvents)

  // Zaproszenia kalendarzowe (.ics) — SEQUENCE per (event, aktor), doklejane do maili.
  const invitePairs = notifyEntries.flatMap(([aid, evs]) =>
    evs.map(e => ({ event_id: e.id, artist_id: aid })))
  const seqMap = await bumpInviteSeqs(supabase, invitePairs, false, orgId)

  for (const [artistId, evsRaw] of notifyEntries) {
    const info = artistInfo[artistId]
    if (!info) continue
    const evs = [...evsRaw].sort((a, b) => a.start_time.localeCompare(b.start_time))

    const listText = evs
      .map(e => `${fmtDay(e.start_time)}, ${fmtTime(e.start_time)} — ${e.title}`)
      .join('\n')

    let artistNotified = false

    if (info.email) {
      const rows = evs.map(e => {
        const token = tokenMap[`${e.id}:${artistId}`]
        const link = token
          ? `<a href="${APP_URL}/confirm/${token}" style="display:inline-block;padding:6px 14px;border-radius:8px;background:#16a34a;color:#fff;font-size:12px;font-weight:700;text-decoration:none">Potwierdź</a>`
          : ''
        const gcal = googleCalendarUrl({
          title: e.title,
          start: e.start_time,
          end: e.end_time,
          location: (e as any).room ?? undefined,
          details: 'Repertuar zatwierdzony — Teatr.',
        })
        return `<tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;font-size:13px;font-weight:600">${fmtDay(e.start_time)}</td>
          <td style="padding:10px 8px;font-size:13px">${fmtTime(e.start_time)}–${fmtTime(e.end_time)}</td>
          <td style="padding:10px 8px;font-size:13px">${e.title}</td>
          <td style="padding:10px 0;text-align:right">${link}<div style="margin-top:6px"><a href="${gcal}" style="font-size:11px;color:#6b7280;text-decoration:underline">+ Google Calendar</a></div></td>
        </tr>`
      }).join('')

      const html = emailWrapper(`
        <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Repertuar ${label} zatwierdzony</h2>
        <p style="color:#6b7280;margin:0 0 20px;font-size:14px">
          Cześć ${info.name}, repertuar na ${label} został zatwierdzony.
          Grasz w ${evs.length} ${evs.length === 1 ? 'spektaklu' : 'spektaklach'} — prosimy o potwierdzenie każdego terminu.
        </p>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
      `)

      const vevents: Vevent[] = evs.map(e => {
        const seq = seqMap.get(`${e.id}:${artistId}`)
        return {
          uid: seq?.uid ?? `${e.id}.${artistId}@repertuar.vercel.app`,
          sequence: seq?.sequence ?? 0,
          startLocal: localFromStored(e.start_time),
          endLocal: localFromStored(e.end_time),
          summary: e.title,
          description: `Spektakl — repertuar ${label}. Potwierdź udział w aplikacji.`,
        }
      })
      const ok = await sendEmail(
        info.email,
        `[Repertuar] ${label} — Twoje spektakle (${evs.length})`,
        html,
        { attachments: [inviteAttachment('REQUEST', { name: info.name, email: info.email }, vevents)] },
      )
      if (ok) {
        artistNotified = true
        logRows.push({
          artist_id: artistId,
          type: 'email',
          kind: 'repertoire_approved',
          subject: `Repertuar ${label} zatwierdzony — ${evs.length} spektakli`,
          body: listText,
        })
      }
    }

    if (info.phone) {
      const sms = `Repertuar ${label} zatwierdzony. Grasz w ${evs.length} ${pluralSpektakl(evs.length)} — szczegóły i potwierdzenia w mailu lub aplikacji.`
      const ok = await sendSms(info.phone, sms)
      if (ok) {
        artistNotified = true
        logRows.push({
          artist_id: artistId,
          type: 'sms',
          kind: 'repertoire_approved',
          subject: `Repertuar ${label} zatwierdzony`,
          body: sms,
        })
      }
    }

    if (artistNotified) notified++
  }

  await logMessages(supabase, logRows, orgId)
  return { notified }
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/** Odtwarza wydarzenia zatwierdzonego miesiąca (do powiadomień w etapie Konsultacje).
 *  Dopasowanie: org + teatr + zakres miesiąca + production_id z propozycji. */
async function eventsForProposal(proposal: any, orgId: string): Promise<InsertedEvent[]> {
  const prodIds = [...new Set(((proposal.proposal_data ?? []) as any[])
    .map(e => e.production_id).filter(Boolean))] as string[]
  const month = proposal.month as string
  let q = supabase.from('events')
    .select('id, production_id, title, type, start_time, end_time')
    .eq('org_id', orgId)
    .gte('start_time', `${month}-01T00:00:00`)
    .lte('start_time', `${lastDayOfMonth(month)}T23:59:59`)
  if (proposal.theatre_id) q = (q as any).eq('theatre_id', proposal.theatre_id)
  if (prodIds.length > 0) q = (q as any).in('production_id', prodIds)
  const { data } = await q
  return (data ?? []) as InsertedEvent[]
}

/** Etap Konsultacje powiadamia też dział Techniki i dział Sprzedaży (informacyjnie).
 *  Technika = członkowie zespołu „Technique" + skrzynka `technique_email`.
 *  Sprzedaż = skrzynka `sales_email` (fallback: `coordinator_email`). */
async function notifyDepartments(monthEvents: InsertedEvent[], month: string, orgId: string): Promise<{ technique: number; sales: number }> {
  const label = monthLabel(month)
  const count = monthEvents.length
  const dates = monthEvents.map(e => e.start_time).filter(Boolean).sort()
  const fmtD = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
  const range = dates.length ? `${fmtD(dates[0])}–${fmtD(dates[dates.length - 1])}` : '—'

  const { data: settingsRows } = await supabase.from('app_settings')
    .select('key, value').eq('org_id', orgId)
    .in('key', ['technique_email', 'sales_email', 'coordinator_email'])
  const settings: Record<string, string> = {}
  for (const r of (settingsRows ?? []) as any[]) if (r.value) settings[r.key] = r.value

  // Technika: zespół „Technique" + technique_email
  const techRecipients = new Set<string>()
  const { data: techTeam } = await supabase.from('teams').select('id').eq('name', 'Technique').maybeSingle()
  if (techTeam?.id) {
    const { data: members } = await supabase.from('artists')
      .select('email').eq('org_id', orgId).eq('team_id', techTeam.id)
    for (const m of (members ?? []) as any[]) if (m.email) techRecipients.add(m.email)
  }
  if (settings.technique_email) techRecipients.add(settings.technique_email)

  // Sprzedaż: sales_email (fallback coordinator_email)
  const salesRecipients = new Set<string>()
  if (settings.sales_email) salesRecipients.add(settings.sales_email)
  else if (settings.coordinator_email) salesRecipients.add(settings.coordinator_email)

  async function sendDept(recipients: Set<string>, deptLabel: string, ask: string): Promise<number> {
    if (recipients.size === 0) return 0
    const subject = `[Repertuar ${label}] Konsultacje — ${deptLabel}`
    const html = emailWrapper(`
      <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Repertuar ${label} — wejście w konsultacje</h2>
      <p style="color:#6b7280;margin:0 0 8px;font-size:14px">
        Repertuar na ${label} został zatwierdzony i wszedł w etap konsultacji.
        Zaplanowano <b>${count}</b> ${count === 1 ? 'spektakl' : 'spektakli'}${dates.length ? ` (${range})` : ''}.
      </p>
      <p style="color:#374151;margin:0;font-size:14px">${ask}</p>
    `)
    let sent = 0
    for (const to of recipients) {
      const ok = await sendEmail(to, subject, html)
      if (ok) sent++
    }
    return sent
  }

  const technique = await sendDept(techRecipients, 'Technika', 'Prosimy o przygotowanie obsługi technicznej scen na zaplanowane terminy.')
  const sales     = await sendDept(salesRecipients, 'Sprzedaż', 'Prosimy o przygotowanie puli biletów do sprzedaży na zaplanowane terminy.')
  return { technique, sales }
}

/** Pełny raport repertuaru na koniec konsultacji — wszystkie spektakle i próby
 *  z datami, godzinami, scenami i obsadą. Wysyłany do obsady, Techniki i Sprzedaży. */
async function sendFullReport(month: string, orgId: string, theatreId: string | null): Promise<{ actors: number; technique: number; sales: number }> {
  const label = monthLabel(month)

  // Wydarzenia miesiąca (org, teatr)
  let evq = supabase.from('events')
    .select('id, title, type, start_time, end_time, room_id, production_id')
    .eq('org_id', orgId)
    .gte('start_time', `${month}-01T00:00:00`)
    .lte('start_time', `${lastDayOfMonth(month)}T23:59:59`)
    .order('start_time', { ascending: true })
  if (theatreId) evq = (evq as any).eq('theatre_id', theatreId)
  const { data: events } = await evq
  const evList = (events ?? []) as any[]
  if (evList.length === 0) return { actors: 0, technique: 0, sales: 0 }
  const eventIds = evList.map(e => e.id)

  // Sale, aktorzy, obsada (jawna + z produkcji), ustawienia działów
  const [{ data: rooms }, { data: arts }, { data: eaRows }, { data: apRows }, { data: settingsRows }, { data: techTeam }] = await Promise.all([
    supabase.from('rooms').select('id, name').eq('org_id', orgId),
    supabase.from('artists').select('id, name, email, team_id').eq('org_id', orgId),
    supabase.from('event_artists').select('event_id, artist_id').in('event_id', eventIds),
    supabase.from('artist_productions').select('artist_id, production_id').eq('org_id', orgId),
    supabase.from('app_settings').select('key, value').eq('org_id', orgId).in('key', ['technique_email', 'sales_email', 'coordinator_email']),
    supabase.from('teams').select('id').eq('name', 'Technique').maybeSingle(),
  ])
  const roomName = new Map<string, string>((rooms ?? []).map((r: any) => [r.id, r.name ?? '']))
  const artName = new Map<string, string>((arts ?? []).map((a: any) => [a.id, a.name]))
  const artEmail = new Map<string, string>()
  for (const a of (arts ?? []) as any[]) if (a.email) artEmail.set(a.id, a.email)
  const settings: Record<string, string> = {}
  for (const r of (settingsRows ?? []) as any[]) if (r.value) settings[r.key] = r.value

  const prodToArtists: Record<string, string[]> = {}
  for (const ap of (apRows ?? []) as any[]) (prodToArtists[ap.production_id] ??= []).push(ap.artist_id)
  const explicitByEvent: Record<string, string[]> = {}
  for (const ea of (eaRows ?? []) as any[]) (explicitByEvent[ea.event_id] ??= []).push(ea.artist_id)
  const castOf = (e: any): string[] => {
    const ids = explicitByEvent[e.id]?.length ? explicitByEvent[e.id] : (prodToArtists[e.production_id] ?? [])
    return ids
  }

  // HTML — pogrupowane po dacie
  const dayLabel = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const byDate = new Map<string, any[]>()
  for (const e of evList) {
    const d = String(e.start_time).slice(0, 10)
    ;(byDate.get(d) ?? byDate.set(d, []).get(d)!).push(e)
  }
  let bodyHtml = ''
  for (const [date, evs] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    bodyHtml += `<tr><td colspan="4" style="padding:14px 0 4px;font-size:13px;font-weight:700;color:#1a1410;text-transform:capitalize;border-top:2px solid #e5e7eb">${dayLabel(date)}</td></tr>`
    for (const e of evs) {
      const time = `${String(e.start_time).slice(11, 16)}–${String(e.end_time).slice(11, 16)}`
      const scene = e.room_id ? (roomName.get(e.room_id) || '') : ''
      const cast = castOf(e).map(id => artName.get(id)).filter(Boolean).join(', ')
      bodyHtml += `<tr style="border-top:1px solid #f3f4f6">
        <td style="padding:7px 8px 7px 0;font-size:12px;white-space:nowrap;color:#374151">${time}</td>
        <td style="padding:7px 8px;font-size:12px;font-weight:600;color:#1a1410">${e.title ?? ''}${e.type ? `<div style="font-weight:400;color:#9ca3af;font-size:11px">${e.type}</div>` : ''}</td>
        <td style="padding:7px 8px;font-size:12px;color:#6b7280;white-space:nowrap">${scene}</td>
        <td style="padding:7px 0;font-size:11px;color:#6b7280">${cast}</td>
      </tr>`
    }
  }
  const spektakle = evList.filter(e => /spekt|premiera/i.test(e.type ?? '')).length
  const proby = evList.filter(e => /prób|prob/i.test(e.type ?? '')).length
  const html = emailWrapper(`
    <h2 style="font-size:18px;font-weight:700;margin:0 0 6px">Repertuar ${label} — pełny harmonogram</h2>
    <p style="color:#6b7280;margin:0 0 16px;font-size:14px">
      Konsultacje zakończone — repertuar przechodzi do sprzedaży. Poniżej komplet: <b>${evList.length}</b> pozycji
      (${spektakle} spektakli, ${proby} prób) z terminami, scenami i obsadą.
    </p>
    <table style="width:100%;border-collapse:collapse">
      <tr><th style="text-align:left;padding:0 8px 4px 0;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af">Godz.</th><th style="text-align:left;padding:0 8px 4px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af">Tytuł / typ</th><th style="text-align:left;padding:0 8px 4px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af">Scena</th><th style="text-align:left;padding:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af">Obsada</th></tr>
      ${bodyHtml}
    </table>
  `)
  const subject = `[Repertuar ${label}] Pełny harmonogram — spektakle, próby, sceny`

  // Odbiorcy: obsada (z limitem testowym), Technika, Sprzedaż
  const TEST_MAX_ACTORS = 5 // 0 = bez limitu; ustaw 0 przed realnym wdrożeniem
  const actorIds = new Set<string>()
  for (const e of evList) for (const id of castOf(e)) actorIds.add(id)
  let actorEmails = [...actorIds].map(id => artEmail.get(id)).filter(Boolean) as string[]
  actorEmails = [...new Set(actorEmails)]
  if (TEST_MAX_ACTORS > 0) actorEmails = actorEmails.slice(0, TEST_MAX_ACTORS)

  const techEmails = new Set<string>()
  if (techTeam?.id) for (const a of (arts ?? []) as any[]) if (a.team_id === techTeam.id && a.email) techEmails.add(a.email)
  if (settings.technique_email) techEmails.add(settings.technique_email)
  const salesEmails = new Set<string>()
  if (settings.sales_email) salesEmails.add(settings.sales_email)
  else if (settings.coordinator_email) salesEmails.add(settings.coordinator_email)

  async function blast(recipients: Iterable<string>): Promise<number> {
    let n = 0
    for (const to of recipients) { if (await sendEmail(to, subject, html)) n++ }
    return n
  }
  const actors = await blast(actorEmails)
  const technique = await blast(techEmails)
  const sales = await blast(salesEmails)
  return { actors, technique, sales }
}

export async function POST(request: Request) {
  const APP_URL = getBaseUrl(request)
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ error: 'Brak sesji organizacji' }, { status: 401 })
  const { proposalId, action } = await request.json() as {
    proposalId: string
    action: 'approve' | 'reject' | 'consult' | 'sell'
  }

  if (!proposalId) return Response.json({ error: 'Missing proposalId' }, { status: 400 })

  // ── Reject ───────────────────────────────────────────────────────────────
  if (action === 'reject') {
    const { error } = await supabase
      .from('repertoire_proposals')
      .update({ status: 'rejected' })
      .eq('org_id', orgId)
      .eq('id', proposalId)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  const { data: proposal, error: fetchErr } = await supabase
    .from('repertoire_proposals')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', proposalId)
    .single()

  if (fetchErr || !proposal) {
    return Response.json({ error: 'Proposal not found' }, { status: 404 })
  }

  const stats = (proposal.stats ?? {}) as Record<string, any>

  // ── Konsultacje: powiadom obsadę + zbieraj potwierdzenia ───────────────────
  if (action === 'consult') {
    if (proposal.status !== 'approved') {
      return Response.json({ error: 'Repertuar musi być najpierw zatwierdzony.' }, { status: 400 })
    }
    if (stats.consultations_started_at) {
      return Response.json({ error: 'Konsultacje już rozpoczęto.' }, { status: 409 })
    }
    const monthEvents = await eventsForProposal(proposal, orgId)
    let notified = 0
    try {
      const result = await notifyCastAfterApproval(monthEvents, proposal.month, APP_URL, orgId)
      notified = result.notified
    } catch (err) {
      console.error('Cast notification error:', err)
    }
    // Powiadom dział Techniki i dział Sprzedaży (informacyjnie)
    let departments = { technique: 0, sales: 0 }
    try {
      departments = await notifyDepartments(monthEvents, proposal.month, orgId)
    } catch (err) {
      console.error('Department notification error:', err)
    }
    await supabase
      .from('repertoire_proposals')
      .update({ stats: { ...stats, consultations_started_at: new Date().toISOString() } })
      .eq('org_id', orgId)
      .eq('id', proposalId)
    return Response.json({ ok: true, actorsNotified: notified, departments })
  }

  // ── Sprzedaż: koniec konsultacji → 2 raporty, potem sprzedaż biletów ───────
  if (action === 'sell') {
    if (proposal.status !== 'approved' || !stats.consultations_started_at) {
      return Response.json({ error: 'Najpierw przeprowadź konsultacje z obsadą.' }, { status: 400 })
    }
    if (stats.sales_started_at) {
      return Response.json({ error: 'Sprzedaż już uruchomiona.' }, { status: 409 })
    }

    // Raport 1 — pełny harmonogram do obsady, Techniki, Sprzedaży
    const reports: { full: { actors: number; technique: number; sales: number }; finance: boolean } =
      { full: { actors: 0, technique: 0, sales: 0 }, finance: false }
    try {
      reports.full = await sendFullReport(proposal.month, orgId, proposal.theatre_id ?? null)
    } catch (err) {
      console.error('Full report error:', err)
    }
    // Raport 2 — finansowy do Dyrektora Finansowego (jeśli jeszcze nie wysłany)
    if (stats.report_sent_at) {
      reports.finance = true
    } else {
      try {
        const r = await fetch(`${APP_URL}/api/planning/send-finance-report`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: proposal.month, theatreId: proposal.theatre_id ?? undefined, orgId }),
        })
        const j = await r.json()
        reports.finance = !!j.ok
      } catch (err) {
        console.error('Finance report error:', err)
      }
    }

    // Odśwież stats (send-finance-report mógł ustawić report_sent_at) i dopisz sales_started_at
    const { data: fresh } = await supabase.from('repertoire_proposals')
      .select('stats').eq('org_id', orgId).eq('id', proposalId).single()
    const freshStats = ((fresh?.stats ?? stats) as Record<string, any>)
    await supabase
      .from('repertoire_proposals')
      .update({ stats: { ...freshStats, sales_started_at: new Date().toISOString() } })
      .eq('org_id', orgId)
      .eq('id', proposalId)
    return Response.json({ ok: true, reports })
  }

  // ── Zatwierdzenie: dodaj wydarzenia do kalendarza (BEZ powiadamiania obsady) ─
  const events = ((proposal.proposal_data ?? []) as any[]).map(e => ({
    org_id: orgId,
    theatre_id: proposal.theatre_id ?? null,
    title: e.production_title,
    type: e.type ?? 'spektakl',
    start_time: `${e.date}T${e.start_time ?? '19:00:00'}`,
    end_time:   `${e.date}T${e.end_time   ?? '21:30:00'}`,
    production_id: e.production_id ?? null,
    room_id:       e.room_id       ?? null,
  }))

  if (events.length > 0) {
    const { error: insertErr } = await supabase
      .from('events')
      .insert(events)
      .select('id')
    if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
  }

  // Mark this proposal approved
  await supabase
    .from('repertoire_proposals')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', proposalId)

  // Reject other drafts for same month (w tej org, tego teatru)
  await supabase
    .from('repertoire_proposals')
    .update({ status: 'rejected' })
    .eq('org_id', orgId)
    .eq('month', proposal.month)
    .eq('theatre_id', proposal.theatre_id)
    .neq('id', proposalId)
    .eq('status', 'draft')

  // UWAGA: powiadomienia obsady NIE są już wysyłane przy zatwierdzeniu —
  // przeniesione do etapu „Konsultacje" (action='consult').
  return Response.json({ ok: true, eventsCreated: events.length })
}
