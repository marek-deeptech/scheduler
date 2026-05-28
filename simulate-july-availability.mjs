import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://imzdshvbturyiuyeziev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltemRzaHZidHVyeWl1eWV6aWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDExNTQsImV4cCI6MjA5NDYxNzE1NH0.k20sSFYs1bmjwumhI9RNO9HSUPqmUwwwz46-jihSofg'
)

// July 2026 days
const JULY_DAYS = Array.from({ length: 31 }, (_, i) => {
  const d = i + 1
  return `2026-07-${String(d).padStart(2, '0')}`
})

// Day of week: 0=Mon … 6=Sun (July 1 2026 = Wednesday = 2)
function dow(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return (d.getDay() + 6) % 7  // Mon=0, Sun=6
}

const STATUSES = ['Dostępny', 'Dostępny tylko w Warszawie', 'Niepewny', 'Niedostępny', 'Urlop', 'Choroba']

// Seeded pseudo-random (deterministic per artist)
function seededRand(seed) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)]
}

function buildActorSchedule(artistId, rand) {
  const schedule = {}

  // Vacation block: 5–10 consecutive days somewhere in July
  const vacLen  = 5 + Math.floor(rand() * 6)          // 5–10
  const vacStart = Math.floor(rand() * (31 - vacLen))  // day index 0–25
  for (let i = vacStart; i < vacStart + vacLen; i++) {
    schedule[JULY_DAYS[i]] = 'Urlop'
  }

  // Sick days: 0–2 isolated days (skip vacation overlap)
  const sickCount = Math.floor(rand() * 3)
  for (let s = 0; s < sickCount; s++) {
    const idx = Math.floor(rand() * 31)
    if (!schedule[JULY_DAYS[idx]]) schedule[JULY_DAYS[idx]] = 'Choroba'
  }

  // Niedostępny: 2–5 weekday blocks
  const unavailCount = 2 + Math.floor(rand() * 4)
  for (let u = 0; u < unavailCount; u++) {
    const idx = Math.floor(rand() * 31)
    const day = JULY_DAYS[idx]
    if (!schedule[day] && dow(day) < 5) schedule[day] = 'Niedostępny'
  }

  // Niepewny: 2–4 days
  const unsureCount = 2 + Math.floor(rand() * 3)
  for (let un = 0; un < unsureCount; un++) {
    const idx = Math.floor(rand() * 31)
    const day = JULY_DAYS[idx]
    if (!schedule[day]) schedule[day] = 'Niepewny'
  }

  // "Dostępny tylko w Warszawie": 2–5 days (occasional)
  const wawCount = 2 + Math.floor(rand() * 4)
  for (let w = 0; w < wawCount; w++) {
    const idx = Math.floor(rand() * 31)
    const day = JULY_DAYS[idx]
    if (!schedule[day]) schedule[day] = 'Dostępny tylko w Warszawie'
  }

  // Fill the rest
  for (const day of JULY_DAYS) {
    if (!schedule[day]) {
      const d = dow(day)
      // Sundays slightly more likely to be unavailable
      if (d === 6 && rand() < 0.3) {
        schedule[day] = 'Niedostępny'
      } else {
        schedule[day] = 'Dostępny'
      }
    }
  }

  return schedule
}

async function main() {
  // Get all artists
  const { data: artists, error } = await sb.from('artists').select('id, name').order('name')
  if (error) { console.error('Error fetching artists:', error.message); process.exit(1) }

  console.log(`Found ${artists.length} artists. Generating July schedules…`)

  // Clear existing July actor_day_status
  const { error: delErr } = await sb
    .from('actor_day_status')
    .delete()
    .gte('date', '2026-07-01')
    .lte('date', '2026-07-31')
  if (delErr) console.warn('Delete warning:', delErr.message)

  let totalInserted = 0
  const BATCH = 200

  let allRows = []

  for (const artist of artists) {
    // Use a deterministic seed based on artist id
    const seed = artist.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 2147483647 || 12345
    const rand = seededRand(seed)
    const schedule = buildActorSchedule(artist.id, rand)

    for (const [date, status] of Object.entries(schedule)) {
      allRows.push({ artist_id: artist.id, date, status, note: null })
    }
  }

  // Insert in batches
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH)
    const { error: insErr } = await sb.from('actor_day_status').insert(batch)
    if (insErr) {
      console.error(`Batch ${Math.floor(i/BATCH)+1} error:`, insErr.message)
    } else {
      totalInserted += batch.length
      process.stdout.write(`\r  Inserted ${totalInserted}/${allRows.length}…`)
    }
  }

  console.log(`\nDone. Inserted ${totalInserted} actor_day_status rows for July 2026.`)

  // Quick summary
  const statusCounts = {}
  for (const row of allRows) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1
  }
  console.log('\nStatus distribution:')
  for (const [s, n] of Object.entries(statusCounts).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${s}: ${n}`)
  }
}

main()
