import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://imzdshvbturyiuyeziev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltemRzaHZidHVyeWl1eWV6aWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDExNTQsImV4cCI6MjA5NDYxNzE1NH0.k20sSFYs1bmjwumhI9RNO9HSUPqmUwwwz46-jihSofg'
)

// ── Config ────────────────────────────────────────────────────────────────────

const THEATRES = {
  POLONIA: {
    id:    '96187687-13eb-4b49-ab60-cc587f58119e',
    rooms: [
      'b3ac9fa0-be50-4514-b59c-cfdd859f01ad', // Duża Scena
      '0643372f-41a1-43ef-bcdc-ce83d9bed98e', // Mała Scena
    ],
  },
  OCH: {
    id:    '8ea01433-7d8b-4710-aba3-b5dcd567eb57',
    rooms: [
      '5ef8054a-af85-4acb-9730-160779ace4fd', // Duża Scena
      'f74f6c54-4548-429c-a28d-7f756a86dc7b', // Cafe
    ],
  },
}

// July 2026: 31 days, starts Wed July 1
// Weeks (Mon–Sun, ISO):
//   W1: Jul 1–5   (Wed–Sun) → 5 days, 10 slots/theatre
//   W2: Jul 6–12  (Mon–Sun) → 7 days, 14 slots/theatre
//   W3: Jul 13–19 (Mon–Sun) → 7 days, 14 slots/theatre
//   W4: Jul 20–26 (Mon–Sun) → 7 days, 14 slots/theatre
//   W5: Jul 27–31 (Mon–Fri) → 5 days, 10 slots/theatre
// Total: 31 days × 2 rooms × 2 theatres = 124 events

const JULY_WEEKS = [
  range('2026-07-01', '2026-07-05'),
  range('2026-07-06', '2026-07-12'),
  range('2026-07-13', '2026-07-19'),
  range('2026-07-20', '2026-07-26'),
  range('2026-07-27', '2026-07-31'),
]

function range(from, to) {
  const days = []
  const cur = new Date(from + 'T12:00:00')
  const end = new Date(to   + 'T12:00:00')
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

// ── Scheduling logic ──────────────────────────────────────────────────────────

function scheduleTheatre(theatreId, rooms, productions) {
  const events = []
  let prodCursor = 0   // global rotation pointer

  for (const weekDays of JULY_WEEKS) {
    const slots = weekDays.length          // days in this week
    const maxSlots = slots * rooms.length  // total (date,room) pairs this week
    const maxPerProd = 4

    // How many productions can we fit this week?
    // Each can appear max 4 times → if maxSlots ≤ productions.length × maxPerProd → we're fine
    // With 22 prods and 14 slots, each shown ≤1 time; constraint is always met.

    // Build ordered slot list: alternate rooms per day so each room gets 1 show/day
    const slotList = []  // [ { date, roomId } ]
    for (const date of weekDays) {
      for (const roomId of rooms) {
        slotList.push({ date, roomId })
      }
    }

    // Count per-production appearances this week
    const weekCount = {}
    const usedRoomDay = new Set()  // "roomId|date" → guarantee 1 per room per day

    for (const { date, roomId } of slotList) {
      const key = `${roomId}|${date}`
      if (usedRoomDay.has(key)) continue  // room already used this day (shouldn't happen, but safe)
      usedRoomDay.add(key)

      // Advance cursor until we find a production not exceeding 4/week
      let tried = 0
      while (tried < productions.length) {
        const prod = productions[prodCursor % productions.length]
        const cnt  = weekCount[prod.id] ?? 0
        if (cnt < maxPerProd) {
          weekCount[prod.id] = cnt + 1
          events.push({
            production_id: prod.id,
            title:         `Spektakl – ${prod.title}`,
            type:          'Spektakl',
            start_time:    `${date}T19:00:00`,
            end_time:      `${date}T21:30:00`,
            theatre_id:    theatreId,
            room_id:       roomId,
          })
          prodCursor++
          break
        }
        prodCursor++
        tried++
      }
    }
  }

  return events
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch productions grouped by theatre
  const { data: allProds } = await sb.from('productions').select('id, title, theatre_id').order('title')

  const poloniaProds = allProds.filter(p => p.theatre_id === THEATRES.POLONIA.id)
  const ochProds     = allProds.filter(p => p.theatre_id === THEATRES.OCH.id)

  console.log(`Teatr Polonia: ${poloniaProds.length} productions`)
  console.log(`Och-Teatr:     ${ochProds.length} productions`)

  // Generate events
  const poloniaEvents = scheduleTheatre(THEATRES.POLONIA.id, THEATRES.POLONIA.rooms, poloniaProds)
  const ochEvents     = scheduleTheatre(THEATRES.OCH.id,     THEATRES.OCH.rooms,     ochProds)
  const allEvents     = [...poloniaEvents, ...ochEvents]

  console.log(`\nGenerated ${poloniaEvents.length} Polonia + ${ochEvents.length} Och = ${allEvents.length} total events`)

  // Validate: no production > 4×/week
  const violations = []
  for (const [theatreName, events] of [['Polonia', poloniaEvents], ['Och', ochEvents]]) {
    const weekProdCount = {}
    for (const e of events) {
      const date = new Date(e.start_time + 'Z')
      // ISO week number within July
      const day = date.getUTCDate()
      const week = day <= 5 ? 1 : day <= 12 ? 2 : day <= 19 ? 3 : day <= 26 ? 4 : 5
      const key  = `${week}:${e.production_id}`
      weekProdCount[key] = (weekProdCount[key] ?? 0) + 1
    }
    for (const [key, n] of Object.entries(weekProdCount)) {
      if (n > 4) violations.push(`[${theatreName}] ${key} → ${n}×`)
    }
  }
  if (violations.length) {
    console.error('VIOLATIONS:', violations)
    process.exit(1)
  }
  console.log('✓ No weekly violations (all productions ≤4×/week)')

  // Validate: all at 19:00
  const notAt19 = allEvents.filter(e => !e.start_time.endsWith('T19:00:00'))
  if (notAt19.length) { console.error('NOT AT 19:00:', notAt19.length); process.exit(1) }
  console.log('✓ All events start at 19:00')

  // Validate: no room conflict on same day
  const roomDaySet = new Set()
  for (const e of allEvents) {
    const key = `${e.room_id}|${e.start_time.slice(0,10)}`
    if (roomDaySet.has(key)) violations.push('Room conflict: ' + key)
    roomDaySet.add(key)
  }
  if (violations.length) { console.error('ROOM CONFLICTS:', violations); process.exit(1) }
  console.log('✓ No room conflicts')

  // Clear old July events
  const { error: delErr } = await sb.from('events').delete()
    .gte('start_time', '2026-07-01T00:00:00')
    .lt('start_time',  '2026-08-01T00:00:00')
  if (delErr) { console.error('Delete error:', delErr.message); process.exit(1) }
  console.log('\nCleared existing July events.')

  // Insert in batches of 50
  let inserted = 0
  const BATCH = 50
  for (let i = 0; i < allEvents.length; i += BATCH) {
    const { error: insErr } = await sb.from('events').insert(allEvents.slice(i, i + BATCH))
    if (insErr) { console.error('Insert error:', insErr.message); process.exit(1) }
    inserted += Math.min(BATCH, allEvents.length - i)
    process.stdout.write(`\r  Inserted ${inserted}/${allEvents.length}…`)
  }

  console.log(`\n\nDone! ${allEvents.length} events scheduled for July 2026.`)

  // Summary by week
  console.log('\nWeekly breakdown:')
  for (let w = 1; w <= 5; w++) {
    const we = allEvents.filter(e => {
      const day = parseInt(e.start_time.slice(8,10))
      return w===1?day<=5 : w===2?day<=12 : w===3?day<=19 : w===4?day<=26 : true
    })
    // Count unique productions this week
    const uniqueProds = new Set(we.map(e => e.production_id)).size
    console.log(`  W${w}: ${we.length} shows, ${uniqueProds} unique productions`)
  }
}

main()
