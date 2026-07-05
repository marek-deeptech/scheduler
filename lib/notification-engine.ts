import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { logMessages } from '@/lib/message-log'
import { SHOW_TYPES, REHEARSAL_TYPES } from '@/types'

// Silnik cyklicznych powiadomień — używany przez cron (/api/cron/notifications)
// i podgląd testowy (/api/notifications/run). Idempotentny przez notification_deliveries.

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
const MON_GEN   = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru']

export interface NotificationRule {
  id: string; org_id: string; name: string; active: boolean
  trigger_type: 'weekly' | 'monthly' | 'before_event'
  weekday: number | null; day_of_month: number | null
  event_type: string | null; days_before: number | null
  scope: string; event_types: string[]
  audience: string; audience_ref: any; personalized: boolean
  channel: 'email' | 'sms' | 'both'
  subject: string | null; body: string | null
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
function midnightUTC(now: Date) { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

/** Czy reguła weekly/monthly ma się odpalić dziś. */
export function isDueToday(rule: NotificationRule, now: Date): boolean {
  if (rule.trigger_type === 'weekly')  return now.getUTCDay() === rule.weekday
  if (rule.trigger_type === 'monthly') return now.getUTCDate() === rule.day_of_month
  return false // before_event obsługiwane przez occurrences
}

/** Okno dat (YYYY-MM-DD) dla zakresu treści. */
function windowFor(scope: string, now: Date): { start: string; end: string; label: string } {
  const d = midnightUTC(now)
  if (scope === 'this_week' || scope === 'next_week') {
    const dow = (d.getUTCDay() + 6) % 7 // 0=pon
    const mon = addDays(d, -dow + (scope === 'next_week' ? 7 : 0))
    const sun = addDays(mon, 6)
    return { start: ymd(mon), end: ymd(sun), label: `${mon.getUTCDate()}–${sun.getUTCDate()} ${MON_GEN[sun.getUTCMonth()]}` }
  }
  // month
  const offset = scope === 'next_month' ? 1 : 0
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))
  const last  = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
  return { start: ymd(first), end: ymd(last), label: `${MONTHS_PL[first.getUTCMonth()]} ${first.getUTCFullYear()}` }
}

function matchesCategory(type: string | null, filters: string[]): boolean {
  if (!filters || filters.length === 0) return true
  const t = type ?? ''
  return filters.some(f =>
    (f === 'spektakle' && SHOW_TYPES.has(t)) ||
    (f === 'proby'     && REHEARSAL_TYPES.has(t)) ||
    (f === 'premiery'  && t === 'Premiera'))
}

function fill(tpl: string | null, vars: Record<string, string>): string {
  return (tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}

interface EvRow { id: string; title: string; type: string | null; start_time: string; end_time: string; room_id: string | null; production_id: string | null; castIds: string[] }

async function fetchWindowEvents(supabase: SupabaseClient, orgId: string, start: string, end: string, filters: string[]): Promise<EvRow[]> {
  const { data: evs } = await supabase.from('events')
    .select('id, title, type, start_time, end_time, room_id, production_id, event_artists(artist_id)')
    .eq('org_id', orgId)
    .gte('start_time', `${start}T00:00:00`).lte('start_time', `${end}T23:59:59`)
    .order('start_time', { ascending: true })
  const list = (evs ?? []).filter((e: any) => matchesCategory(e.type, filters)) as any[]
  const needProd = [...new Set(list.filter(e => !(e.event_artists?.length)).map(e => e.production_id).filter(Boolean))] as string[]
  const prodCast = new Map<string, string[]>()
  if (needProd.length) {
    const { data: aps } = await supabase.from('artist_productions').select('artist_id, production_id').eq('org_id', orgId).in('production_id', needProd)
    for (const r of (aps ?? []) as any[]) { const a = prodCast.get(r.production_id) ?? []; a.push(r.artist_id); prodCast.set(r.production_id, a) }
  }
  return list.map(e => ({
    id: e.id, title: e.title, type: e.type, start_time: e.start_time, end_time: e.end_time, room_id: e.room_id, production_id: e.production_id,
    castIds: (e.event_artists?.length ? e.event_artists.map((x: any) => x.artist_id) : (prodCast.get(e.production_id) ?? [])),
  }))
}

interface Recipient { artistId: string | null; name: string; email: string | null; phone: string | null; key: string }

async function settingsMap(supabase: SupabaseClient, orgId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('app_settings').select('key, value').eq('org_id', orgId)
    .in('key', ['technique_email', 'sales_email', 'coordinator_email'])
  const m: Record<string, string> = {}
  for (const r of (data ?? []) as any[]) if (r.value) m[r.key] = r.value
  return m
}

async function resolveRecipients(supabase: SupabaseClient, rule: NotificationRule, eventProductionId: string | null): Promise<Recipient[]> {
  const orgId = rule.org_id
  const aud = rule.audience
  if (aud === 'technique' || aud === 'sales') {
    const s = await settingsMap(supabase, orgId)
    const email = aud === 'technique' ? s.technique_email : (s.sales_email || s.coordinator_email)
    return email ? [{ artistId: null, name: aud === 'technique' ? 'Technika' : 'Sprzedaż', email, phone: null, key: email }] : []
  }
  // zbiór aktorów wg audience → potem dane kontaktowe
  let artistIds: string[] | null = null
  if (aud === 'core') {
    const { data } = await supabase.from('artists').select('id').eq('org_id', orgId).eq('is_core', true)
    artistIds = (data ?? []).map((a: any) => a.id)
  } else if (aud === 'team' && rule.audience_ref?.team_id) {
    const { data } = await supabase.from('artists').select('id').eq('org_id', orgId).eq('team_id', rule.audience_ref.team_id)
    artistIds = (data ?? []).map((a: any) => a.id)
  } else if (aud === 'production' && rule.audience_ref?.production_id) {
    const { data } = await supabase.from('artist_productions').select('artist_id').eq('org_id', orgId).eq('production_id', rule.audience_ref.production_id)
    artistIds = [...new Set((data ?? []).map((a: any) => a.artist_id))] as string[]
  } else if (aud === 'event_cast' && eventProductionId) {
    const { data } = await supabase.from('artist_productions').select('artist_id').eq('org_id', orgId).eq('production_id', eventProductionId)
    artistIds = [...new Set((data ?? []).map((a: any) => a.artist_id))] as string[]
  } else if (aud === 'custom' && Array.isArray(rule.audience_ref?.artist_ids)) {
    artistIds = rule.audience_ref.artist_ids
  }
  // all_cast (domyślnie) lub zawężenie do wyznaczonych id
  const { data: arts } = await supabase.from('artists')
    .select('id, name, email, phone, teams!inner(name)').eq('org_id', orgId).eq('teams.name', 'Cast')
  let rows = (arts ?? []) as any[]
  if (artistIds) { const set = new Set(artistIds); rows = rows.filter(a => set.has(a.id)) }
  return rows.map(a => ({ artistId: a.id, name: a.name, email: a.email, phone: a.phone, key: a.id }))
}

/** Tabela HTML harmonogramu (pogrupowana po dacie). */
function scheduleHtml(events: EvRow[], roomName: Map<string, string>): string {
  if (events.length === 0) return '<p style="color:#9ca3af;font-size:13px">Brak pozycji w tym okresie.</p>'
  const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const byDate = new Map<string, EvRow[]>()
  for (const e of events) { const d = e.start_time.slice(0, 10); const a = byDate.get(d) ?? []; a.push(e); byDate.set(d, a) }
  let rows = ''
  for (const [date, evs] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows += `<tr><td colspan="3" style="padding:12px 0 3px;font-size:12px;font-weight:700;color:#1a1410;text-transform:capitalize;border-top:2px solid #e5e7eb">${dayLabel(date)}</td></tr>`
    for (const e of evs) {
      const time = `${e.start_time.slice(11, 16)}–${e.end_time.slice(11, 16)}`
      const scene = e.room_id ? (roomName.get(e.room_id) || '') : ''
      rows += `<tr style="border-top:1px solid #f3f4f6"><td style="padding:6px 8px 6px 0;font-size:12px;white-space:nowrap;color:#374151">${time}</td><td style="padding:6px 8px;font-size:12px;color:#1a1410">${e.title ?? ''}${e.type ? `<span style="color:#9ca3af;font-size:11px"> · ${e.type}</span>` : ''}</td><td style="padding:6px 0;font-size:11px;color:#6b7280;white-space:nowrap">${scene}</td></tr>`
    }
  }
  return `<table style="width:100%;border-collapse:collapse">${rows}</table>`
}

interface Occurrence { key: string; start: string; end: string; label: string; eventTitle?: string; eventProductionId?: string | null; date?: string }

async function occurrencesFor(supabase: SupabaseClient, rule: NotificationRule, now: Date): Promise<Occurrence[]> {
  if (rule.trigger_type === 'before_event') {
    const target = ymd(addDays(midnightUTC(now), rule.days_before ?? 0))
    const { data: evs } = await supabase.from('events')
      .select('id, title, production_id, start_time')
      .eq('org_id', rule.org_id).eq('type', rule.event_type ?? 'Premiera')
      .gte('start_time', `${target}T00:00:00`).lte('start_time', `${target}T23:59:59`)
    return (evs ?? []).map((e: any) => ({
      key: e.id, start: ymd(midnightUTC(now)), end: target, label: '',
      eventTitle: e.title, eventProductionId: e.production_id, date: e.start_time.slice(0, 10),
    }))
  }
  const w = windowFor(rule.scope, now)
  const [y, m, d] = w.start.split('-')
  const key = rule.trigger_type === 'monthly' ? `${y}-${m}` : `${w.start}` // tydzień = data poniedziałku okna
  return [{ key, start: w.start, end: w.end, label: w.label }]
}

export async function runRule(
  supabase: SupabaseClient,
  rule: NotificationRule,
  now: Date,
  opts: { test?: boolean; testEmail?: string | null } = {},
): Promise<{ sent: number; skipped: number }> {
  const test = !!opts.test
  const occs = await occurrencesFor(supabase, rule, now)
  const { data: roomsData } = await supabase.from('rooms').select('id, name').eq('org_id', rule.org_id)
  const roomName = new Map<string, string>((roomsData ?? []).map((r: any) => [r.id, r.name ?? '']))
  const channels: ('email' | 'sms')[] = rule.channel === 'both' ? ['email', 'sms'] : [rule.channel]

  let sent = 0, skipped = 0
  for (const occ of occs) {
    const events = await fetchWindowEvents(supabase, rule.org_id, occ.start, occ.end, rule.event_types)
    const allRecipients = await resolveRecipients(supabase, rule, occ.eventProductionId ?? null)
    const vars0 = { weekLabel: occ.label, monthLabel: occ.label, eventTitle: occ.eventTitle ?? '', date: occ.date ?? ymd(now), count: String(events.length) }

    // Tryb testowy: jeden reprezentatywny odbiorca (najlepiej z pozycjami)
    let recipients = allRecipients
    if (test) {
      const withEv = rule.personalized
        ? allRecipients.find(r => r.artistId && events.some(e => e.castIds.includes(r.artistId!)))
        : allRecipients[0]
      recipients = withEv ? [withEv] : allRecipients.slice(0, 1)
    }

    for (const r of recipients) {
      const evs = rule.personalized && r.artistId ? events.filter(e => e.castIds.includes(r.artistId!)) : events
      if (rule.personalized && evs.length === 0 && !test) { skipped++; continue }

      const vars = { ...vars0, name: r.name, count: String(evs.length) }
      const subject = fill(rule.subject || rule.name, vars)
      const bodyText = fill(rule.body, vars)
      const html = emailWrapper(`<p style="font-size:14px;color:#374151;margin:0 0 14px">${bodyText}</p>${scheduleHtml(evs, roomName)}`)
      const smsText = `${bodyText} (${evs.length} poz.) — szczegóły w mailu/aplikacji.`

      for (const ch of channels) {
        const to = ch === 'email' ? (test ? (opts.testEmail || r.email) : r.email) : r.phone
        if (!to) { continue }
        if (!test) {
          const { data: dup } = await supabase.from('notification_deliveries').select('id')
            .eq('rule_id', rule.id).eq('occurrence_key', occ.key).eq('recipient', r.key).eq('channel', ch).maybeSingle()
          if (dup) { skipped++; continue }
        }
        const ok = ch === 'email' ? await sendEmail(to, subject, html) : await sendSms(to, smsText)
        if (!ok) continue
        sent++
        if (!test) {
          await supabase.from('notification_deliveries').insert({
            org_id: rule.org_id, rule_id: rule.id, occurrence_key: occ.key, recipient: r.key, artist_id: r.artistId, channel: ch, status: 'sent',
          })
          if (r.artistId) {
            await logMessages(supabase, [{ artist_id: r.artistId, type: ch, kind: 'message', subject, body: smsText }], rule.org_id)
          }
        }
      }
    }
  }
  if (!test) await supabase.from('notification_rules').update({ last_run_at: now.toISOString() }).eq('id', rule.id)
  return { sent, skipped }
}
