import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  accessTokenFromRefresh, toGoogleEvent, gcalInsert, gcalPatch, gcalDelete, type AppEvent,
} from '@/lib/google-calendar'

export const runtime = 'nodejs'

/**
 * Cel Supabase Database Webhook na tabeli `events` (INSERT/UPDATE/DELETE).
 * Łapie KAŻDY zapis niezależnie od źródła (API, UI, skrypty) i synchronizuje
 * do połączonych kont Google.
 *
 * Webhook musi wysyłać nagłówek: x-webhook-secret: <GOOGLE_SYNC_SECRET>
 */
export async function POST(req: Request) {
  if (req.headers.get('x-webhook-secret') !== (process.env.GOOGLE_SYNC_SECRET || '')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let payload: any
  try { payload = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const op: 'INSERT' | 'UPDATE' | 'DELETE' = payload.type
  const record = payload.record ?? null
  const old    = payload.old_record ?? null
  const eventId: string | undefined = (record ?? old)?.id
  if (!eventId) return NextResponse.json({ skipped: 'no event id' })

  const admin = supabaseAdmin()
  const { data: accounts } = await admin.from('google_accounts').select('*')
  if (!accounts?.length) return NextResponse.json({ skipped: 'no connected accounts' })

  // token cache per request
  const tokenCache = new Map<string, string>()
  const tokenFor = async (acc: any): Promise<string> => {
    if (!tokenCache.has(acc.owner_key)) tokenCache.set(acc.owner_key, await accessTokenFromRefresh(acc.refresh_token))
    return tokenCache.get(acc.owner_key)!
  }

  // ── DELETE: usuń u każdego, kto ma zmapowany ten event ──
  if (op === 'DELETE') {
    const { data: maps } = await admin.from('gcal_event_map').select('*').eq('event_id', eventId)
    for (const m of maps ?? []) {
      const acc = accounts.find(a => a.owner_key === m.owner_key)
      if (!acc) continue
      try { await gcalDelete(await tokenFor(acc), acc.calendar_id, m.google_event_id) } catch (e) { /* log poniżej */ }
    }
    await admin.from('gcal_event_map').delete().eq('event_id', eventId)
    return NextResponse.json({ ok: true, op, eventId, deletedFor: (maps ?? []).length })
  }

  // ── INSERT / UPDATE: wzbogać event o nazwy + obsadę ──
  const [{ data: room }, { data: theatre }, { data: prod }, { data: ea }] = await Promise.all([
    record.room_id       ? admin.from('rooms').select('name').eq('id', record.room_id).maybeSingle()           : Promise.resolve({ data: null }),
    record.theatre_id    ? admin.from('theatres').select('name').eq('id', record.theatre_id).maybeSingle()      : Promise.resolve({ data: null }),
    record.production_id ? admin.from('productions').select('title').eq('id', record.production_id).maybeSingle(): Promise.resolve({ data: null }),
    admin.from('event_artists').select('artist_id').eq('event_id', eventId),
  ])
  const castIds: string[] = (ea ?? []).map((r: any) => r.artist_id)
  const { data: castRows } = castIds.length
    ? await admin.from('artists').select('id, name').in('id', castIds)
    : { data: [] as any[] }
  const castNames = (castRows ?? []).map((a: any) => a.name)

  const appEvent: AppEvent = {
    id: eventId,
    title: record.title, type: record.type,
    start_time: record.start_time, end_time: record.end_time,
    location: record.location,
    room_name: (room as any)?.name ?? null,
    theatre_name: (theatre as any)?.name ?? null,
    production_title: (prod as any)?.title ?? null,
    cast_names: castNames,
  }
  const body = toGoogleEvent(appEvent)

  const { data: maps } = await admin.from('gcal_event_map').select('*').eq('event_id', eventId)
  const mapByOwner = new Map((maps ?? []).map((m: any) => [m.owner_key, m]))

  const results: any[] = []
  for (const acc of accounts) {
    const relevant = acc.receive_all || (acc.artist_id && castIds.includes(acc.artist_id))
    const existing = mapByOwner.get(acc.owner_key)
    try {
      const token = await tokenFor(acc)
      if (relevant) {
        if (existing) {
          const ok = await gcalPatch(token, acc.calendar_id, existing.google_event_id, body)
          if (!ok) {
            // event skasowany ręcznie w Google → utwórz na nowo
            const gid = await gcalInsert(token, acc.calendar_id, body)
            await admin.from('gcal_event_map').update({ google_event_id: gid, updated_at: new Date().toISOString() }).eq('event_id', eventId).eq('owner_key', acc.owner_key)
          }
          results.push({ owner: acc.owner_key, action: 'patch' })
        } else {
          const gid = await gcalInsert(token, acc.calendar_id, body)
          await admin.from('gcal_event_map').insert({ event_id: eventId, owner_key: acc.owner_key, google_event_id: gid })
          results.push({ owner: acc.owner_key, action: 'insert' })
        }
      } else if (existing) {
        // przestał dotyczyć tego konta (np. zdjęty z obsady) → usuń
        await gcalDelete(token, acc.calendar_id, existing.google_event_id)
        await admin.from('gcal_event_map').delete().eq('event_id', eventId).eq('owner_key', acc.owner_key)
        results.push({ owner: acc.owner_key, action: 'remove' })
      }
    } catch (e: any) {
      results.push({ owner: acc.owner_key, error: e?.message ?? String(e) })
    }
  }

  return NextResponse.json({ ok: true, op, eventId, results })
}
