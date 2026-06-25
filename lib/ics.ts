/**
 * Generator zaproszeń kalendarzowych (iCalendar) dla aktorów.
 *
 * Model „meeting invite": aplikacja = ORGANIZER, aktor = ATTENDEE.
 *  - METHOD:REQUEST  → dodaj/aktualizuj event (po UID + rosnącym SEQUENCE)
 *  - METHOD:CANCEL   → usuń event z kalendarza aktora
 * Klient pocztowy (Gmail/Apple/Outlook) sam dodaje/aktualizuje/usuwa wpis —
 * aktor nic nie konfiguruje, najwyżej klika „Tak".
 */

// Strefa Warszawy z regułami DST — by godziny były poprawne latem i zimą.
const VTIMEZONE_WARSAW = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Warsaw',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n')

const pad = (n: number) => String(n).padStart(2, '0')

function esc(s: string): string {
  return (s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function dtstampNow(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

/** Lokalny string 'YYYYMMDDTHHMMSS' z surowych części (date='YYYY-MM-DD', time='HH:MM[:SS]'). */
export function localFromParts(date: string, time: string): string {
  const [y, m, d] = date.split('-')
  const [hh = '00', mm = '00', ss = '00'] = (time || '').split(':')
  return `${y}${m}${d}T${pad(+hh)}${pad(+mm)}${pad(+(ss || '0'))}`
}

/** Lokalny string z zapisanej wartości DB — bierze „ścianę zegara" UTC,
 *  zgodnie z konwencją apki (eventy zapisane jako naiwny czas lokalny w UTC). */
export function localFromStored(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

export interface Vevent {
  uid: string
  sequence: number
  startLocal: string   // 'YYYYMMDDTHHMMSS' (Europe/Warsaw)
  endLocal: string
  summary: string
  location?: string
  description?: string
}

export function buildIcs(o: {
  method: 'REQUEST' | 'CANCEL'
  organizer: { name: string; email: string }
  attendee: { name: string; email: string }
  events: Vevent[]
}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Teatr Polonia//Repertuar//PL',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${o.method}`,
    VTIMEZONE_WARSAW,
  ]
  const cancelled = o.method === 'CANCEL'
  for (const e of o.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `SEQUENCE:${e.sequence}`,
      `DTSTAMP:${dtstampNow()}`,
      `DTSTART;TZID=Europe/Warsaw:${e.startLocal}`,
      `DTEND;TZID=Europe/Warsaw:${e.endLocal}`,
      `SUMMARY:${esc(e.summary)}`,
    )
    if (e.location)    lines.push(`LOCATION:${esc(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    lines.push(
      `ORGANIZER;CN=${esc(o.organizer.name)}:mailto:${o.organizer.email}`,
      `ATTENDEE;CN=${esc(o.attendee.name)};RSVP=${cancelled ? 'FALSE' : 'TRUE'};PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${o.attendee.email}`,
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
