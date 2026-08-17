// Dane ekranu powitalnego KPA: data, słońce, pogoda, imieniny, kartka z kalendarza.
// Pogoda z Open-Meteo (bez klucza API); gdy niedostępna — reszta i tak wraca.
import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { sunTimes, fmtWarsawTime, weatherText, nameDay, warsawFact, longDatePl, WARSAW } from '@/lib/daily-brief'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const orgId = await sessionOrgId(request)
  const now = new Date()

  // Imię koordynatora do powitania (Ustawienia → „Imię koordynatora")
  let name = ''
  if (orgId) {
    const { data } = await supabase.from('app_settings')
      .select('value').eq('org_id', orgId).eq('key', 'coordinator_name').maybeSingle()
    name = ((data as any)?.value ?? '').trim()
  }

  const { sunrise, sunset } = sunTimes(now)

  let weather: string | null = null
  let temperature: number | null = null
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${WARSAW.lat}&longitude=${WARSAW.lon}`
      + `&current=temperature_2m,weather_code&timezone=${encodeURIComponent(WARSAW.tz)}`
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 1800 } })
    if (r.ok) {
      const j = await r.json()
      const code = j?.current?.weather_code
      const temp = j?.current?.temperature_2m
      if (typeof code === 'number') weather = weatherText(code)
      if (typeof temp === 'number') temperature = Math.round(temp)
    }
  } catch { /* pogoda opcjonalna — brak sieci nie psuje ekranu */ }

  return Response.json({
    name,
    date: longDatePl(now),
    sunrise: fmtWarsawTime(sunrise),
    sunset: fmtWarsawTime(sunset),
    weather,
    temperature,
    nameday: nameDay(now),
    fact: warsawFact(now),
  })
}
