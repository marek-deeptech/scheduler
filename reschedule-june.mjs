import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://imzdshvbturyiuyeziev.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltemRzaHZidHVyeWl1eWV6aWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDExNTQsImV4cCI6MjA5NDYxNzE1NH0.k20sSFYs1bmjwumhI9RNO9HSUPqmUwwwz46-jihSofg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const THEATRES = [
  {
    id: '96187687-13eb-4b49-ab60-cc587f58119e',
    name: 'Teatr Polonia',
    rooms: [
      'b3ac9fa0-be50-4514-b59c-cfdd859f01ad', // Duża Scena
      '0643372f-41a1-43ef-bcdc-ce83d9bed98e', // Mała Scena
    ],
  },
  {
    id: '8ea01433-7d8b-4710-aba3-b5dcd567eb57',
    name: 'Och-Teatr',
    rooms: [
      '5ef8054a-af85-4acb-9730-160779ace4fd', // Duża Scena
      'f74f6c54-4548-429c-a28d-7f756a86dc7b', // Cafe
    ],
  },
];

// June 2026 weeks (Jun 1 = Monday)
const WEEKS = [
  { index: 0, days: [1,2,3,4,5,6,7].map(d => `2026-06-0${d}`) },
  { index: 1, days: [8,9,10,11,12,13,14].map(d => `2026-06-${d}`) },
  { index: 2, days: [15,16,17,18,19,20,21].map(d => `2026-06-${d}`) },
  { index: 3, days: [22,23,24,25,26,27,28].map(d => `2026-06-${d}`) },
  { index: 4, days: ['2026-06-29','2026-06-30'] },
];

function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(d) { return d; } // already formatted

// Build (day, room) slot pairs for a week
function buildSlotPairs(days, rooms) {
  const pairs = [];
  for (const day of days) {
    for (const room of rooms) {
      pairs.push({ day, room });
    }
  }
  return pairs;
}

// Distribute plays among productions for a week
// Returns array of production_ids (may have duplicates = plays)
function distributeProductions(productions, slots, weekIndex) {
  const n = productions.length;
  const totalSlots = slots;

  if (n === 0) return [];

  // Sort alphabetically for consistency
  const sorted = [...productions].sort((a, b) => a.name.localeCompare(b.name));

  if (n <= totalSlots) {
    // Each production gets floor(totalSlots/n) plays, first (totalSlots%n) get +1
    // Cap at 4
    const base = Math.floor(totalSlots / n);
    const extra = totalSlots % n;

    let plays = sorted.map((p, i) => ({
      ...p,
      count: Math.min(4, base + (i < extra ? 1 : 0)),
    }));

    // Check if we have leftover slots because some were capped at 4
    let totalAssigned = plays.reduce((s, p) => s + p.count, 0);

    // Redistribute leftover slots
    let iterations = 0;
    while (totalAssigned < totalSlots && iterations < 100) {
      iterations++;
      let redistributed = false;
      for (let i = 0; i < plays.length && totalAssigned < totalSlots; i++) {
        if (plays[i].count < 4) {
          plays[i].count++;
          totalAssigned++;
          redistributed = true;
        }
      }
      if (!redistributed) break;
    }

    // Build flat list
    const flat = [];
    for (const p of plays) {
      for (let i = 0; i < p.count; i++) {
        flat.push(p);
      }
    }
    return flat;
  } else {
    // More productions than slots: rotate which ones sit out
    const numSittingOut = n - totalSlots;
    const offset = (weekIndex * numSittingOut) % n;

    // Determine sitting out indices
    const sittingOut = new Set();
    for (let i = 0; i < numSittingOut; i++) {
      sittingOut.add((offset + i) % n);
    }

    const playing = sorted.filter((_, i) => !sittingOut.has(i));
    // Each selected production plays exactly once
    return playing.map(p => p);
  }
}

// Interleave plays so same production is spread across different days
// Returns reordered flat list where consecutive same-production plays are spread
function spreadPlays(flat, days) {
  if (flat.length === 0) return [];

  // Group by production_id
  const groups = {};
  for (const p of flat) {
    if (!groups[p.production_id]) groups[p.production_id] = [];
    groups[p.production_id].push(p);
  }

  // Interleave: round-robin across productions
  const keys = Object.keys(groups);
  const result = [];
  let remaining = [...keys.map(k => ({ key: k, items: groups[k] }))];

  while (remaining.some(r => r.items.length > 0)) {
    for (const r of remaining) {
      if (r.items.length > 0) {
        result.push(r.items.shift());
      }
    }
  }

  return result;
}

async function main() {
  console.log('=== Theatre Rescheduler - June 2026 ===\n');

  // Step 1: Query productions and historical events for duration data
  console.log('Step 1: Querying productions and historical event data...');

  // Query all productions for all theatres
  const productionDetails = {};
  const theatreProductions = {};
  for (const theatre of THEATRES) {
    theatreProductions[theatre.id] = [];
  }

  for (const theatre of THEATRES) {
    const { data: allProds, error: prodError } = await supabase
      .from('productions')
      .select('id, title, theatre_id, comment, status')
      .eq('theatre_id', theatre.id)
      .eq('status', 'Na afiszu');

    if (prodError) {
      console.error(`Error querying productions for ${theatre.name}:`, prodError);
      process.exit(1);
    }

    for (const p of allProds) {
      productionDetails[p.id] = p;
      // Include productions that are active ("Na afiszu" or similar)
      theatreProductions[theatre.id].push({
        production_id: p.id,
        name: p.title,
        theatre_id: p.theatre_id,
      });
    }
  }

  // Query ALL historical events for duration data (not just June)
  const { data: allEvents, error: allEventsError } = await supabase
    .from('events')
    .select('id, production_id, theatre_id, start_time, end_time, type')
    .in('type', ['Spektakl', 'Spektakl gościnny', 'Premiera'])
    .not('end_time', 'is', null);

  if (allEventsError) {
    console.warn('Warning querying all events:', allEventsError.message);
  }

  // Query June events for deletion list
  const { data: juneEvents, error: queryError } = await supabase
    .from('events')
    .select('id, production_id, theatre_id, start_time, end_time, type')
    .gte('start_time', '2026-06-01T00:00:00')
    .lt('start_time', '2026-07-01T00:00:00');

  if (queryError) {
    console.error('Error querying June events:', queryError);
    process.exit(1);
  }

  console.log(`Found ${juneEvents.length} existing June events to delete`);

  // Build avg duration map from historical events
  const durationByProd = {};
  const historicalEvents = allEvents || [];
  for (const e of historicalEvents) {
    if (e.production_id && e.start_time && e.end_time) {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      const mins = (end - start) / 60000;
      if (mins > 0 && mins < 300) { // sanity check: between 0 and 5 hours
        if (!durationByProd[e.production_id]) {
          durationByProd[e.production_id] = { total: 0, count: 0 };
        }
        durationByProd[e.production_id].total += mins;
        durationByProd[e.production_id].count++;
      }
    }
  }

  // Final duration map
  const avgDuration = {};
  for (const [pid, d] of Object.entries(durationByProd)) {
    avgDuration[pid] = Math.round(d.total / d.count);
  }
  // Fill from production comment field (e.g. "140 min") for any missing
  for (const [pid, prod] of Object.entries(productionDetails)) {
    if (!avgDuration[pid] && prod.comment) {
      const match = prod.comment.match(/(\d+)\s*min/i);
      if (match) {
        avgDuration[pid] = parseInt(match[1], 10);
      }
    }
    if (!avgDuration[pid]) {
      avgDuration[pid] = 120; // default 2 hours
    }
  }

  for (const theatre of THEATRES) {
    console.log(`${theatre.name}: ${theatreProductions[theatre.id].length} productions`);
    theatreProductions[theatre.id].forEach(p => console.log(`  - ${p.name} (${avgDuration[p.production_id] || 120} min)`));
  }

  const juneEventIds = juneEvents.map(e => e.id);

  // Step 2: Delete existing June events
  console.log('\nStep 2: Deleting existing June events...');

  if (juneEventIds.length > 0) {
    // Delete event_confirmations first
    const { error: confError } = await supabase
      .from('event_confirmations')
      .delete()
      .in('event_id', juneEventIds);

    if (confError) {
      console.warn('Warning deleting event_confirmations:', confError.message);
    } else {
      console.log('  Deleted event_confirmations');
    }

    // Delete event_artists
    const { error: artError } = await supabase
      .from('event_artists')
      .delete()
      .in('event_id', juneEventIds);

    if (artError) {
      console.warn('Warning deleting event_artists:', artError.message);
    } else {
      console.log('  Deleted event_artists');
    }

    // Delete events
    const { error: evtError } = await supabase
      .from('events')
      .delete()
      .in('id', juneEventIds);

    if (evtError) {
      console.error('Error deleting events:', evtError);
      process.exit(1);
    }
    console.log(`  Deleted ${juneEventIds.length} events`);
  } else {
    console.log('  No existing June events to delete');
  }

  // Step 3: Build and insert new schedule
  console.log('\nStep 3: Building new schedule...');

  const newEvents = [];
  const summaryByTheatre = {};

  for (const theatre of THEATRES) {
    summaryByTheatre[theatre.name] = [];
    const productions = theatreProductions[theatre.id];

    if (productions.length === 0) {
      console.log(`  ${theatre.name}: No productions found, skipping`);
      continue;
    }

    for (const week of WEEKS) {
      const days = week.days;
      const slots = days.length * 2; // 2 rooms
      const weekSummary = {
        week: week.index + 1,
        days: `${days[0]} to ${days[days.length - 1]}`,
        slots,
        plays: [],
      };

      // Get flat list of productions to play this week
      const playsThisWeek = distributeProductions(productions, slots, week.index);

      // Spread plays so same production is on different days
      const spreadPlaysThisWeek = spreadPlays(playsThisWeek, days);

      // Build slot pairs: [(day1,room0),(day1,room1),(day2,room0),...]
      const slotPairs = buildSlotPairs(days, theatre.rooms);

      // Assign plays to slots
      // But we need to ensure no production plays twice on same day
      // Use a smarter assignment: try to assign each play to a slot where the production hasn't played
      const dayProductionTracker = {}; // day -> Set of production_ids

      const assignedSlots = [];
      const unassignedPlays = [...spreadPlaysThisWeek];
      const availableSlots = [...slotPairs];

      // Greedy assignment: for each play, find earliest slot where production hasn't played that day
      for (const play of unassignedPlays) {
        let assigned = false;
        for (let i = 0; i < availableSlots.length; i++) {
          const slot = availableSlots[i];
          if (!dayProductionTracker[slot.day]) {
            dayProductionTracker[slot.day] = new Set();
          }
          if (!dayProductionTracker[slot.day].has(play.production_id)) {
            // Assign
            assignedSlots.push({ slot, play });
            dayProductionTracker[slot.day].add(play.production_id);
            availableSlots.splice(i, 1);
            assigned = true;
            break;
          }
        }
        if (!assigned) {
          // Force assign to first available slot (shouldn't happen with good algorithm)
          if (availableSlots.length > 0) {
            const slot = availableSlots.shift();
            assignedSlots.push({ slot, play });
            if (!dayProductionTracker[slot.day]) dayProductionTracker[slot.day] = new Set();
            dayProductionTracker[slot.day].add(play.production_id);
            console.warn(`  WARNING: Had to force-assign ${play.name} on ${slot.day} (may conflict)`);
          }
        }
      }

      // Build event records
      for (const { slot, play } of assignedSlots) {
        const startTime = `${slot.day}T19:00:00`;
        const durationMin = avgDuration[play.production_id] || 120;
        // Compute end time manually without Date parsing issues
        const startHour = 19;
        const startMin = 0;
        const totalStartMins = startHour * 60 + startMin;
        const totalEndMins = totalStartMins + durationMin;
        const endHour = Math.floor(totalEndMins / 60) % 24;
        const endMin = totalEndMins % 60;
        const endTime = `${slot.day}T${pad(endHour)}:${pad(endMin)}:00`;

        const prodTitle = productionDetails[play.production_id]?.title || play.name;
        newEvents.push({
          production_id: play.production_id,
          theatre_id: theatre.id,
          room_id: slot.room,
          start_time: startTime,
          end_time: endTime,
          type: 'Spektakl',
          title: prodTitle,
        });

        weekSummary.plays.push({
          day: slot.day,
          room: slot.room === theatre.rooms[0] ? 'Room A' : 'Room B',
          production: play.name,
        });
      }

      summaryByTheatre[theatre.name].push(weekSummary);
    }
  }

  // Step 4: Insert new events
  console.log(`\nStep 4: Inserting ${newEvents.length} new events...`);

  // Insert in batches of 50
  const BATCH_SIZE = 50;
  let insertedCount = 0;

  for (let i = 0; i < newEvents.length; i += BATCH_SIZE) {
    const batch = newEvents.slice(i, i + BATCH_SIZE);
    const { data: inserted, error: insertError } = await supabase
      .from('events')
      .insert(batch)
      .select('id');

    if (insertError) {
      console.error(`Error inserting batch ${Math.floor(i/BATCH_SIZE) + 1}:`, insertError);
      process.exit(1);
    }
    insertedCount += inserted.length;
    process.stdout.write(`  Inserted ${insertedCount}/${newEvents.length} events\r`);
  }
  console.log(`\n  Successfully inserted ${insertedCount} events`);

  // Step 5: Print summary
  console.log('\n=== SCHEDULE SUMMARY ===\n');

  for (const [theatreName, weeks] of Object.entries(summaryByTheatre)) {
    console.log(`\n### ${theatreName} ###`);
    for (const week of weeks) {
      console.log(`\n  Week ${week.week} (${week.days}) — ${week.slots} slots, ${week.plays.length} shows:`);

      // Count per production
      const prodCounts = {};
      for (const p of week.plays) {
        prodCounts[p.production] = (prodCounts[p.production] || 0) + 1;
      }
      for (const [prod, count] of Object.entries(prodCounts).sort()) {
        console.log(`    ${prod}: ${count}x`);
      }

      // Day-by-day breakdown
      const byDay = {};
      for (const p of week.plays) {
        if (!byDay[p.day]) byDay[p.day] = [];
        byDay[p.day].push(`${p.room}: ${p.production}`);
      }
      for (const day of Object.keys(byDay).sort()) {
        console.log(`    ${day}:`);
        for (const entry of byDay[day]) {
          console.log(`      ${entry}`);
        }
      }
    }
  }

  // Step 6: Verify no room conflicts
  console.log('\n=== VERIFICATION ===\n');

  const { data: verifyEvents, error: verifyError } = await supabase
    .from('events')
    .select('id, room_id, start_time, production_id')
    .gte('start_time', '2026-06-01T00:00:00')
    .lt('start_time', '2026-07-01T00:00:00')
    .order('start_time');

  if (verifyError) {
    console.error('Error verifying:', verifyError);
    process.exit(1);
  }

  console.log(`Total June events in database: ${verifyEvents.length}`);

  // Check for room conflicts (same room, same day)
  const roomDayMap = {};
  let conflicts = 0;

  for (const e of verifyEvents) {
    const day = e.start_time.slice(0, 10);
    const key = `${e.room_id}:${day}`;
    if (roomDayMap[key]) {
      console.error(`CONFLICT: Room ${e.room_id} on ${day} has multiple events!`);
      conflicts++;
    } else {
      roomDayMap[key] = e.id;
    }
  }

  if (conflicts === 0) {
    console.log('No room conflicts detected.');
  } else {
    console.log(`${conflicts} conflicts found!`);
  }

  // Check per-production per-week counts
  console.log('\nChecking max 4 plays per production per week...');
  let maxViolations = 0;

  for (const week of WEEKS) {
    const weekStart = week.days[0];
    const weekEnd = week.days[week.days.length - 1];
    const weekEvents = verifyEvents.filter(e => {
      const d = e.start_time.slice(0, 10);
      return d >= weekStart && d <= weekEnd;
    });

    const prodWeekCounts = {};
    for (const e of weekEvents) {
      const key = `${e.production_id}:week${week.index}`;
      prodWeekCounts[key] = (prodWeekCounts[key] || 0) + 1;
    }

    for (const [key, count] of Object.entries(prodWeekCounts)) {
      if (count > 4) {
        console.error(`VIOLATION: ${key} plays ${count} times in week ${week.index + 1} (max 4)`);
        maxViolations++;
      }
    }
  }

  if (maxViolations === 0) {
    console.log('All productions respect the 4-play-per-week limit.');
  }

  console.log('\n=== DONE ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
