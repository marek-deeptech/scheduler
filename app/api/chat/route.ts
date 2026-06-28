import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

function getAnthropicKey(): string {
  // Try process.env first
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY

  // Fall back to reading .env.local directly
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    const contents = fs.readFileSync(envPath, 'utf-8')
    const match = contents.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    if (match) return match[1].trim()
  } catch {}

  return ''
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Fetch theater context ────────────────────────────────────────────────────

async function buildContext(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 7) + '-01'
  const nextMonth  = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 2))
    .toISOString().slice(0, 10)

  const [
    { data: artists },
    { data: productions },
    { data: events },
    { data: confirmations },
    { data: dayStatuses },
    { data: availabilities },
    { data: substitutes },
  ] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name, role, email, phone, teams!inner(name)')
      .eq('teams.name', 'Cast')
      .order('name')
      .limit(50),
    supabase
      .from('productions')
      .select('id, title, status, theatres(name), artist_productions(artists(name, role))')
      .order('title'),
    supabase
      .from('events')
      .select('id, title, type, start_time, end_time, productions(title), rooms(name), event_artists(artists(name))')
      .gte('start_time', monthStart + 'T00:00:00')
      .lte('start_time', nextMonth + 'T00:00:00')
      .order('start_time')
      .limit(200),
    supabase
      .from('event_confirmations')
      .select('status, responded_at, artists(name), events(title, type, start_time)')
      .in('status', ['confirmed', 'declined', 'maybe'])
      .gte('events.start_time', monthStart + 'T00:00:00')
      .order('responded_at', { ascending: false })
      .limit(120),
    supabase
      .from('actor_day_status')
      .select('artist_id, date, status, note')
      .gte('date', today)
      .lte('date', nextMonth)
      .order('date', { ascending: true })
      .limit(5000),
    supabase
      .from('availabilities')
      .select('artist_id, type, start_time, end_time, note')
      .gte('end_time', today + 'T00:00:00')
      .lte('start_time', nextMonth + 'T00:00:00')
      .limit(300),
    supabase
      .from('actor_production_substitutes')
      .select('actor:artists!actor_production_substitutes_actor_id_fkey(name), substitute:artists!actor_production_substitutes_substitute_id_fkey(name), production:productions(title)')
      .limit(400),
  ])

  // Cast-only ID set — all downstream filtering uses this
  const castIds = new Set<string>(((artists ?? []) as any[]).map(a => a.id))

  // Lookup map: artist_id → name (used for tables without FK to artists)
  const artistById = new Map<string, string>(
    ((artists ?? []) as any[]).map(a => [a.id, a.name])
  )

  const artistList = ((artists ?? []) as any[])
    .map(a => `- ${a.name}${a.role ? ` (${a.role})` : ''}${a.email ? ` <${a.email}>` : ''}`)
    .join('\n')

  const prodList = ((productions ?? []) as any[])
    .map(p => {
      const th   = Array.isArray(p.theatres) ? p.theatres[0] : p.theatres
      const cast = ((p.artist_productions ?? []) as any[])
        .map((ap: any) => {
          const a = Array.isArray(ap.artists) ? ap.artists[0] : ap.artists
          if (!a || !castIds.has(a.id ?? '')) return null
          return `${a.name}${a.role ? ` (${a.role})` : ''}`
        })
        .filter(Boolean)
        .join(', ')
      return `- ${p.title} [${p.status ?? 'brak statusu'}]${th ? ` — ${th.name}` : ''}${cast ? `\n  Obsada: ${cast}` : ''}`
    })
    .join('\n')

  const eventList = ((events ?? []) as any[])
    .map(e => {
      const prod    = Array.isArray(e.productions) ? e.productions[0] : e.productions
      const room    = Array.isArray(e.rooms) ? e.rooms[0] : e.rooms
      const dt      = new Date(e.start_time).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const actors  = ((e.event_artists ?? []) as any[])
        .map((ea: any) => {
          const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists
          if (!a || !castIds.has(a.id ?? '')) return null
          return a.name
        })
        .filter(Boolean)
        .join(', ')
      return `- ${dt}: ${e.type ?? e.title}${prod ? ` (${prod.title})` : ''}${room ? ` · ${room.name}` : ''}${actors ? ` | Aktorzy: ${actors}` : ''}`
    })
    .join('\n')

  const confList = ((confirmations ?? []) as any[])
    .map(c => {
      const artist = Array.isArray(c.artists) ? c.artists[0] : c.artists
      const event  = Array.isArray(c.events)  ? c.events[0]  : c.events
      const label  = c.status === 'confirmed' ? 'BĘDĘ' : c.status === 'declined' ? 'NIE BĘDĘ' : 'BYĆ MOŻE'
      const dt = event?.start_time ? new Date(event.start_time).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : ''
      return `- ${artist?.name ?? '?'}: ${label} na "${event?.type ?? event?.title ?? '?'}"${dt ? ` (${dt})` : ''}`
    })
    .join('\n')

  const statusList = ((dayStatuses ?? []) as any[])
    .filter(s => castIds.has(s.artist_id))
    .map(s => {
      const name = artistById.get(s.artist_id) ?? s.artist_id
      return `- ${name}: ${s.date} → ${s.status}${s.note ? ` (${s.note})` : ''}`
    })
    .join('\n')

  const availList = ((availabilities ?? []) as any[])
    .filter(av => castIds.has(av.artist_id))
    .map(av => {
      const name  = artistById.get(av.artist_id) ?? av.artist_id
      const from  = new Date(av.start_time).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const to    = new Date(av.end_time).toLocaleString('pl-PL',   { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      return `- ${name}: ${av.type} od ${from} do ${to}${av.note ? ` (${av.note})` : ''}`
    })
    .join('\n')

  const subList = ((substitutes ?? []) as any[])
    .map(s => {
      const actor = Array.isArray(s.actor) ? s.actor[0] : s.actor
      const sub   = Array.isArray(s.substitute) ? s.substitute[0] : s.substitute
      const prod  = Array.isArray(s.production) ? s.production[0] : s.production
      if (!actor?.name || !sub?.name) return null
      return `- ${actor.name} → dubler: ${sub.name}${prod?.title ? ` (w „${prod.title}")` : ''}`
    })
    .filter(Boolean)
    .join('\n')

  return `DZISIAJ: ${today}

=== AKTORZY (${(artists ?? []).length}) ===
${artistList || 'brak'}

=== PRODUKCJE Z OBSADĄ ===
${prodList || 'brak'}

=== REPERTUAR / KALENDARZ (najbliższe 2 miesiące) ===
${eventList || 'brak'}

=== ODPOWIEDZI AKTORÓW (ostatnie) ===
${confList || 'brak'}

=== DOSTĘPNOŚĆ AKTORÓW — statusy dzienne (od dziś) ===
${statusList || 'brak'}

=== DOSTĘPNOŚĆ AKTORÓW — bloki czasowe ===
${availList || 'brak'}

=== ZASTĘPSTWA ===
${subList || 'brak'}`
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { message, history } = await request.json() as {
    message: string
    history: { role: 'user' | 'assistant'; content: string }[]
  }

  if (!message?.trim()) {
    return Response.json({ error: 'Empty message' }, { status: 400 })
  }

  // Persist user message
  await supabase.from('chat_messages').insert({ role: 'user', content: message })

  // Build context
  const context = await buildContext()

  const systemPrompt = `Jesteś Stefanem — asystentem koordynatora teatralnego. Masz na imię Stefan. Pomagasz zarządzać repertuarem, obsadą i komunikacją z aktorami.

Poniżej aktualne dane teatru:

${context}

Zasady:
- Odpowiadaj wyłącznie po polsku, zwięźle i konkretnie.
- Gdy pytają o aktora, przeszukaj listę aktorów.
- Gdy pytają o spektakl lub próbę, sprawdź kalendarz.
- Możesz sugerować działania (np. "wyślij potwierdzenie do X"), ale sam ich nie wykonujesz.
- Jeśli pytanie dotyczy danych których nie masz, powiedz wprost.`

  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ]

  const apiKey = getAnthropicKey()
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  // Stream response
  const anthropic = new Anthropic({ apiKey })
  const encoder = new TextEncoder()
  let fullResponse = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const stream = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          stream: true,
        })

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const chunk = event.delta.text
            fullResponse += chunk
            controller.enqueue(encoder.encode(chunk))
          }
        }

        // Persist assistant response
        if (fullResponse) {
          await supabase.from('chat_messages').insert({ role: 'assistant', content: fullResponse })
        }

        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        controller.enqueue(encoder.encode(`\n\n[Błąd: ${msg}]`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}

// Load history
export async function GET() {
  const { data } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .order('created_at', { ascending: true })
    .limit(100)

  return Response.json({ messages: data ?? [] })
}
