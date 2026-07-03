// „Dodaj do Google Calendar" — link otwierający Google Calendar z gotowym wydarzeniem
// do zapisania jednym kliknięciem. Bez OAuth/logowania (osobne od pushu OAuth koordynatora
// i od zaproszeń iCal). Czas wg konwencji apki: eventy zapisane jako „ściana zegara" w UTC
// (np. 19:00:00+00:00 = 19:00 w Warszawie) → bierzemy getUTC* i oznaczamy ctz=Europe/Warsaw,
// spójnie z iCal (lib/ics.ts localFromStored).

const pad = (n: number) => String(n).padStart(2, '0')

// YYYYMMDDTHHMMSS z UTC clock-face (bez „Z") — interpretowane w strefie ctz.
function wallClock(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

export function googleCalendarUrl(o: {
  title: string
  start: string
  end: string
  details?: string
  location?: string
}): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: o.title,
    dates: `${wallClock(o.start)}/${wallClock(o.end)}`,
    ctz: 'Europe/Warsaw',
  })
  if (o.details) p.set('details', o.details)
  if (o.location) p.set('location', o.location)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
