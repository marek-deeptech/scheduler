import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://imzdshvbturyiuyeziev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltemRzaHZidHVyeWl1eWV6aWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDExNTQsImV4cCI6MjA5NDYxNzE1NH0.k20sSFYs1bmjwumhI9RNO9HSUPqmUwwwz46-jihSofg'
)

// June 2026 days (30 days)
const JUNE_DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = i + 1
  return `2026-06-${String(d).padStart(2, '0')}`
})

// Day of week: Mon=0 … Sun=6  (June 1 2026 = Monday = 0)
function dow(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return (d.getDay() + 6) % 7
}

function seededRand(seed) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function buildActorSchedule(artistId, rand) {
  const schedule = {}

  // Vacation block: 4–8 consecutive days
  const vacLen   = 4 + Math.floor(rand() * 5)
  const vacStart = Math.floor(rand() * (30 - vacLen))
  for (let i = vacStart; i < vacStart + vacLen; i++) {
    schedule[JUNE_DAYS[i]] = 'Urlop'
  }

  // Niedostępny: 2–5 weekdays
  const unavailCount = 2 + Math.floor(rand() * 4)
  for (let u = 0; u < unavailCount; u++) {
    const idx = Math.floor(rand() * 30)
    const day = JUNE_DAYS[idx]
    if (!schedule[day] && dow(day) < 5) schedule[day] = 'Niedostępny'
  }

  // Niepewny: 2–4 days
  const unsureCount = 2 + Math.floor(rand() * 3)
  for (let un = 0; un < unsureCount; un++) {
    const idx = Math.floor(rand() * 30)
    const day = JUNE_DAYS[idx]
    if (!schedule[day]) schedule[day] = 'Niepewny'
  }

  // Dostępny tylko w Warszawie: 2–5 days
  const wawCount = 2 + Math.floor(rand() * 4)
  for (let w = 0; w < wawCount; w++) {
    const idx = Math.floor(rand() * 30)
    const day = JUNE_DAYS[idx]
    if (!schedule[day]) schedule[day] = 'Dostępny tylko w Warszawie'
  }

  // Fill rest — no Choroba
  for (const day of JUNE_DAYS) {
    if (!schedule[day]) {
      if (dow(day) === 6 && rand() < 0.25) {
        schedule[day] = 'Niedostępny'
      } else {
        schedule[day] = 'Dostępny'
      }
    }
  }

  return schedule
}

async function main() {
  const { data: artists, error } = await sb.from('artists').select('id, name').order('name')
  if (error) { console.error('Error:', error.message); process.exit(1) }

  console.log(`Found ${artists.length} artists. Generating June schedules…`)

  // Clear existing June rows
  const { error: delErr } = await sb
    .from('actor_day_status')
    .delete()
    .gte('date', '2026-06-01')
    .lte('date', '2026-06-30')
  if (delErr) console.warn('Delete warning:', delErr.message)
  else console.log('Cleared existing June rows.')

  const allRows = []

  for (const artist of artists) {
    const seed = artist.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 2147483647 || 12345
    // Offset seed from July run so patterns differ
    const rand = seededRand((seed * 31337 + 7) % 2147483647 || 99991)
    const schedule = buildActorSchedule(artist.id, rand)
    for (const [date, status] of Object.entries(schedule)) {
      allRows.push({ artist_id: artist.id, date, status, note: null })
    }
  }

  const BATCH = 200
  let totalInserted = 0
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH)
    const { error: insErr } = await sb.from('actor_day_status').insert(batch)
    if (insErr) console.error(`Batch error:`, insErr.message)
    else {
      totalInserted += batch.length
      process.stdout.write(`\r  Inserted ${totalInserted}/${allRows.length}…`)
    }
  }

  console.log(`\nDone. Inserted ${totalInserted} actor_day_status rows for June 2026.`)

  const statusCounts = {}
  for (const row of allRows) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1
  }
  console.log('\nStatus distribution:')
  for (const [s, n] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${n}`)
  }
}

main()
