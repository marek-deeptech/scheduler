import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://imzdshvbturyiuyeziev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltemRzaHZidHVyeWl1eWV6aWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDExNTQsImV4cCI6MjA5NDYxNzE1NH0.k20sSFYs1bmjwumhI9RNO9HSUPqmUwwwz46-jihSofg'
)

const BLOCKING   = new Set(['Urlop', 'Niedostępny', 'Choroba'])
const WARN_ONLY  = new Set(['Niepewny'])

const THEATRES = {
  POLONIA: {
    id:    '96187687-13eb-4b49-ab60-cc587f58119e',
    rooms: [
      { id: 'b3ac9fa0-be50-4514-b59c-cfdd859f01ad', name: 'Duża Scena' },
      { id: '0643372f-41a1-43ef-bcdc-ce83d9bed98e', name: 'Mała Scena' },
    ],
  },
  OCH: {
    id:    '8ea01433-7d8b-4710-aba3-b5dcd567eb57',
    rooms: [
      { id: '5ef8054a-af85-4acb-9730-160779ace4fd', name: 'Duża Scena' },
      { id: 'f74f6c54-4548-429c-a28d-7f756a86dc7b', name: 'Cafe'       },
    ],
  },
}

// July 2026 week boundaries (Mon–Sun)
const JULY_WEEKS = [
  range('2026-07-01', '2026-07-05'),   // W1 Wed–Sun
  range('2026-07-06', '2026-07-12'),   // W2
  range('2026-07-13', '2026-07-19'),   // W3
  range('2026-07-20', '2026-07-26'),   // W4
  range('2026-07-27', '2026-07-31'),   // W5 Mon–Fri
]

function range(from, to) {
  const days = []
  const cur = new Date(from + 'T12:00:00Z')
  const end = new Date(to   + 'T12:00:00Z')
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}

// Fetch all rows from a table with pagination
async function fetchAll(query) {
  const PAGE = 1000
  let from = 0
  let all  = []
  while (true) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    all = all.concat(data ?? [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  console.log('Fetching data…')

  // 1. All artist_productions
  const apRows = await fetchAll((f, t) =>
    sb.from('artist_productions').select('artist_id, production_id').range(f, t)
  )
  // production → Set<artist_id>
  const prodActors = {}
  for (const r of apRows) {
    if (!prodActors[r.production_id]) prodActors[r.production_id] = new Set()
    prodActors[r.production_id].add(r.artist_id)
  }
  console.log(`  artist_productions: ${apRows.length} rows, ${Object.keys(prodActors).length} productions with cast`)

  // 2. All actor_day_status for July (with pagination)
  const dsRows = await fetchAll((f, t) =>
    sb.from('actor_day_status')
      .select('artist_id, date, status')
      .gte('date', '2026-07-01')
      .lte('date', '2026-07-31')
      .range(f, t)
  )
  // { artistId → { date → status } }
  const dayStatus = {}
  for (const r of dsRows) {
    if (!dayStatus[r.artist_id]) dayStatus[r.artist_id] = {}
    dayStatus[r.artist_id][r.date] = r.status
  }
  console.log(`  actor_day_status:   ${dsRows.length} rows`)

  // 3. Productions
  const { data: allProds } = await sb.from('productions').select('id, title, theatre_id').order('title')
  console.log(`  productions:        ${allProds.length}`)

  // ── Build feasibility map ────────────────────────────────────────────────────
  // feasibility[prodId][date] = { ok: bool, warn: [actorIds with Niepewny] }
  const JULY_DAYS = JULY_WEEKS.flat()
  const feasibility = {}

  for (const prod of allProds) {
    feasibility[prod.id] = {}
    const actors = prodActors[prod.id] ?? new Set()

    for (const date of JULY_DAYS) {
      const warnActors = []
      let blocked = false

      if (actors.size === 0) {
        // No cast assigned → treat as always available, no warning
        feasibility[prod.id][date] = { ok: true, warn: [] }
        continue
      }

      for (const actorId of actors) {
        const status = dayStatus[actorId]?.[date] ?? 'Dostępny'
        if (BLOCKING.has(status))  { blocked = true; break }
        if (WARN_ONLY.has(status)) warnActors.push(actorId)
      }

      feasibility[prod.id][date] = { ok: !blocked, warn: warnActors }
    }
  }

  // ── Schedule per theatre ─────────────────────────────────────────────────────
  const allEvents  = []
  const warnings   = []   // { date, prodTitle, warnCount }

  for (const [theatreName, theatre] of Object.entries(THEATRES)) {
    const prods = allProds.filter(p => p.theatre_id === theatre.id)
    console.log(`\n${theatreName}: ${prods.length} productions, ${theatre.rooms.length} rooms`)

    let skipped = 0

    for (const week of JULY_WEEKS) {
      const weekCount = {}   // prodId → count this week

      for (const date of week) {
        // For each room, pick a production
        // Feasible productions for this date (not blocked, not over weekly limit)
        const availableForDay = prods.filter(p => {
          const f = feasibility[p.id]?.[date]
          return f?.ok && (weekCount[p.id] ?? 0) < 4
        })

        if (availableForDay.length === 0) {
          // No feasible productions for any room this day
          skipped += theatre.rooms.length
          continue
        }

        // Assign one production per room, prefer different productions per room
        const usedToday = new Set()

        for (const room of theatre.rooms) {
          // Sort by: fewest times this week first (rotation), then alphabetical
          const candidates = availableForDay
            .filter(p => !usedToday.has(p.id))
            .sort((a, b) => (weekCount[a.id] ?? 0) - (weekCount[b.id] ?? 0))

          if (candidates.length === 0) {
            skipped++
            continue
          }

          const prod = candidates[0]
          usedToday.add(prod.id)
          weekCount[prod.id] = (weekCount[prod.id] ?? 0) + 1

          const f = feasibility[prod.id][date]
          if (f.warn.length > 0) {
            warnings.push({ date, theatre: theatreName, room: room.name, prod: prod.title, warnCount: f.warn.length })
          }

          allEvents.push({
            production_id: prod.id,
            title:         `Spektakl – ${prod.title}`,
            type:          'Spektakl',
            start_time:    `${date}T19:00:00`,
            end_time:      `${date}T21:30:00`,
            theatre_id:    theatre.id,
            room_id:       room.id,
          })
        }
      }
    }

    const theatreEvents = allEvents.filter(e => e.theatre_id === theatre.id)
    console.log(`  → ${theatreEvents.length} events scheduled, ${skipped} slots skipped (actors unavailable)`)
  }

  // ── Validate ─────────────────────────────────────────────────────────────────
  console.log('\nValidating…')
  let ok = true

  // All at 19:00
  const notAt19 = allEvents.filter(e => !e.start_time.endsWith('T19:00:00'))
  if (notAt19.length) { console.error('  ✗ Not at 19:00:', notAt19.length); ok = false }
  else console.log('  ✓ All events at 19:00')

  // Max 4/week per production
  const weekProdCount = {}
  for (const e of allEvents) {
    const day = parseInt(e.start_time.slice(8, 10))
    const w   = day <= 5 ? 1 : day <= 12 ? 2 : day <= 19 ? 3 : day <= 26 ? 4 : 5
    const key = `W${w}:${e.production_id}`
    weekProdCount[key] = (weekProdCount[key] ?? 0) + 1
  }
  const overLimit = Object.entries(weekProdCount).filter(([, n]) => n > 4)
  if (overLimit.length) { console.error('  ✗ Over 4/week:', overLimit); ok = false }
  else console.log('  ✓ No production exceeds 4×/week')

  // No room conflict
  const roomDaySet = new Set()
  const conflicts  = []
  for (const e of allEvents) {
    const key = `${e.room_id}|${e.start_time.slice(0, 10)}`
    if (roomDaySet.has(key)) conflicts.push(key)
    roomDaySet.add(key)
  }
  if (conflicts.length) { console.error('  ✗ Room conflicts:', conflicts); ok = false }
  else console.log('  ✓ No room conflicts')

  if (!ok) process.exit(1)

  // ── Save to DB ────────────────────────────────────────────────────────────────
  console.log('\nClearing existing July events…')
  const { error: delErr } = await sb.from('events').delete()
    .gte('start_time', '2026-07-01T00:00:00')
    .lt('start_time',  '2026-08-01T00:00:00')
  if (delErr) { console.error('Delete error:', delErr.message); process.exit(1) }

  console.log(`Inserting ${allEvents.length} events…`)
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < allEvents.length; i += BATCH) {
    const { error: insErr } = await sb.from('events').insert(allEvents.slice(i, i + BATCH))
    if (insErr) { console.error('Insert error:', insErr.message); process.exit(1) }
    inserted += Math.min(BATCH, allEvents.length - i)
    process.stdout.write(`\r  ${inserted}/${allEvents.length}…`)
  }
  console.log(`\n  Done.`)

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════')
  console.log(`LIPIEC 2026 — REPERTUAR`)
  console.log(`  Spektakli zaplanowanych: ${allEvents.length}`)
  console.log(`  Slotów pustych (brak obsady): ${31 * 4 - allEvents.length}`)
  console.log(`══════════════════════════════════════════`)

  // Per-week
  for (let w = 1; w <= 5; w++) {
    const wEvents = allEvents.filter(e => {
      const d = parseInt(e.start_time.slice(8, 10))
      return w===1?d<=5 : w===2?d>=6&&d<=12 : w===3?d>=13&&d<=19 : w===4?d>=20&&d<=26 : d>=27
    })
    const uniqueProds = new Set(wEvents.map(e => e.production_id)).size
    console.log(`  W${w}: ${wEvents.length} spektakli, ${uniqueProds} unikalnych produkcji`)
  }

  // Warnings
  if (warnings.length > 0) {
    console.log(`\n⚠️  OSTRZEŻENIA (status "Niepewny" wśród aktorów): ${warnings.length}`)
    for (const w of warnings) {
      console.log(`  ${w.date} | ${w.theatre} – ${w.room} | ${w.prod} | ${w.warnCount} aktor(ów) niepewnych`)
    }
  } else {
    console.log('\n✓ Brak ostrzeżeń (żaden aktor z "Niepewny")')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
