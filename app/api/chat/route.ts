import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
  ] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name, role, email, phone')
      .order('name')
      .limit(150),
    supabase
      .from('productions')
      .select('id, title, status, theatres(name)')
      .order('title'),
    supabase
      .from('events')
      .select('id, title, type, start_time, end_time, productions(title), rooms(name)')
      .gte('start_time', monthStart + 'T00:00:00')
      .lte('start_time', nextMonth + 'T00:00:00')
      .order('start_time')
      .limit(200),
    supabase
      .from('event_confirmations')
      .select('status, responded_at, artists(name), events(title, type, start_time)')
      .in('status', ['confirmed', 'declined', 'maybe'])
      .order('responded_at', { ascending: false })
      .limit(80),
    supabase
      .from('actor_day_status')
      .select('artist_id, date, status, note, artists(name)')
      .gte('date', today)
      .lte('date', nextMonth)
      .limit(500),
  ])

  const artistList = ((artists ?? []) as any[])
    .map(a => `- ${a.name}${a.role ? ` (${a.role})` : ''}${a.email ? ` <${a.email}>` : ''}`)
    .join('\n')

  const prodList = ((productions ?? []) as any[])
    .map(p => {
      const th = Array.isArray(p.theatres) ? p.theatres[0] : p.theatres
      return `- ${p.title} [${p.status ?? 'brak statusu'}]${th ? ` — ${th.name}` : ''}`
    })
    .join('\n')

  const eventList = ((events ?? []) as any[])
    .map(e => {
      const prod = Array.isArray(e.productions) ? e.productions[0] : e.productions
      const room = Array.isArray(e.rooms) ? e.rooms[0] : e.rooms
      const dt = new Date(e.start_time).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      return `- ${dt}: ${e.type ?? e.title}${prod ? ` (${prod.title})` : ''}${room ? ` · ${room.name}` : ''}`
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
    .map(s => {
      const artist = Array.isArray(s.artists) ? s.artists[0] : s.artists
      return `- ${artist?.name ?? s.artist_id}: ${s.date} → ${s.status}${s.note ? ` (${s.note})` : ''}`
    })
    .join('\n')

  return `DZISIAJ: ${today}

=== AKTORZY (${(artists ?? []).length}) ===
${artistList || 'brak'}

=== PRODUKCJE ===
${prodList || 'brak'}

=== REPERTUAR / KALENDARZ (najbliższe 2 miesiące) ===
${eventList || 'brak'}

=== ODPOWIEDZI AKTORÓW (ostatnie) ===
${confList || 'brak'}

=== DOSTĘPNOŚĆ AKTORÓW (od dziś) ===
${statusList || 'brak'}`
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

  const systemPrompt = `Jesteś asystentem koordynatora teatralnego. Pomagasz zarządzać repertuarem, obsadą i komunikacją z aktorami.

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

  // Stream response
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
