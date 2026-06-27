'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile-context'

// ── Types ────────────────────────────────────────────────────────────────────

interface Confirmation {
  itemType: 'confirmation'
  id: string
  event_id: string | null
  event_title: string | null
  event_type: string | null
  event_start: string | null
  status: string | null
  comment: string | null
  sent_at: string | null
  responded_at: string | null
}

interface InfoMessage {
  itemType: 'info'
  id: string
  kind: string
  channel: string
  subject: string
  body: string
  sent_at: string | null
  unread: boolean
}

type FeedItem = Confirmation | InfoMessage

interface SentMessage {
  id: string
  channel: string
  subject: string
  body: string
  sent_at: string | null
}

const KIND_LABELS: Record<string, string> = {
  message:             'Wiadomość',
  repertoire_approved: 'Repertuar',
  event_change:        'Zmiana grafiku',
  substitution:        'Zastępstwo',
  reply:               'Odpowiedź',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function StatusPill({ status }: { status: string | null }) {
  if (status === 'confirmed') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-600 text-white">BĘDĘ</span>
  if (status === 'declined')  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">NIE BĘDĘ</span>
  if (status === 'maybe')     return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white">BYĆ MOŻE</span>
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Oczekuje</span>
}

function ChannelPill({ channel }: { channel: string | null }) {
  if (!channel) return null
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide">
      {channel.replace('+', ' + ')}
    </span>
  )
}

// ── Reply composer ────────────────────────────────────────────────────────────

function ReplyBox({ actorId, replyTo, onSent }: { actorId: string; replyTo?: string; onSent: () => void }) {
  const [open, setOpen]       = useState(false)
  const [text, setText]       = useState('')
  const [channels, setCh]     = useState<('email' | 'sms')[]>(['email'])
  const [sending, setSending] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const toggle = (c: 'email' | 'sms') =>
    setCh(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  async function send() {
    if (!text.trim() || channels.length === 0) return
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/actor/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: actorId, channels, text: text.trim(), replyTo }),
      })
      const j = await res.json().catch(() => ({ ok: false }))
      setSending(false)
      if (j.ok) { setDone(true); setText(''); setOpen(false); onSent() }
      else setError(j.error || 'Nie udało się wysłać')
    } catch {
      setSending(false); setError('Błąd połączenia')
    }
  }

  if (done) return <p className="text-[11px] font-medium text-green-700 mt-3">✓ Wysłano do koordynatora</p>

  if (!open) return (
    <button onClick={() => setOpen(true)} className="mt-3 text-xs font-semibold transition-colors" style={{ color: '#c8102e' }}>
      ✍ Odpowiedz koordynatorowi
    </button>
  )

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <textarea
        rows={2}
        value={text}
        onChange={e => setText(e.target.value)}
        autoFocus
        placeholder="Krótka wiadomość do koordynatora…"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-0.5">Wyślij jako:</span>
        {(['email', 'sms'] as const).map(c => {
          const on = channels.includes(c)
          return (
            <button key={c} onClick={() => toggle(c)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors"
              style={on ? { background: '#1a1410', color: '#fff', borderColor: '#1a1410' } : { background: '#fff', color: '#7a7068', borderColor: '#e4ddd4' }}>
              {c === 'email' ? 'E-mail' : 'SMS'}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { setOpen(false); setText(''); setError(null) }} className="text-[11px] font-medium text-gray-400 hover:text-gray-600">
            Anuluj
          </button>
          <button onClick={send} disabled={sending || !text.trim() || channels.length === 0}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-40"
            style={{ background: '#c8102e' }}>
            {sending ? 'Wysyłanie…' : 'Wyślij'}
          </button>
        </div>
      </div>
      {error && <p className="text-[11px] text-red-600 font-medium mt-1.5">{error}</p>}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ActorMessagesPage() {
  const { actorId, actorName } = useProfile()
  const router = useRouter()

  const [feed,    setFeed]    = useState<FeedItem[]>([])
  const [sent,    setSent]    = useState<SentMessage[]>([])
  const [tab,     setTab]     = useState<'odebrane' | 'wyslane'>('odebrane')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!actorId) { router.push('/dashboard'); return }
    load()
  }, [actorId])

  async function load() {
    if (!actorId) return
    setLoading(true)

    const [{ data: confData }, { data: msgData }] = await Promise.all([
      supabase
        .from('event_confirmations')
        .select(`id, event_id, status, sent_at, responded_at, comment, events ( title, type, start_time )`)
        .eq('artist_id', actorId)
        .order('sent_at', { ascending: false }),
      supabase
        .from('actor_messages')
        .select('*')
        .eq('artist_id', actorId)
        .order('sent_at', { ascending: false })
        .limit(200),
    ])

    const confirmations: Confirmation[] = ((confData ?? []) as any[]).map(r => {
      const ev = Array.isArray(r.events) ? r.events[0] : r.events
      return {
        itemType: 'confirmation', id: r.id, event_id: r.event_id,
        event_title: ev?.title ?? null, event_type: ev?.type ?? null, event_start: ev?.start_time ?? null,
        status: r.status, comment: r.comment ?? null, sent_at: r.sent_at, responded_at: r.responded_at ?? null,
      }
    })

    const allMsgs = (msgData ?? []) as any[]

    // ── Odebrane: wiadomości do aktora (bez próśb o potwierdzenie — te mają karty wyżej)
    const infos: InfoMessage[] = allMsgs
      .filter(m => (m.direction ?? 'to_actor') === 'to_actor' && (m.kind ?? 'message') !== 'confirmation_request')
      .map(m => ({
        itemType: 'info', id: m.id, kind: m.kind ?? 'message', channel: m.type ?? 'email',
        subject: m.subject ?? '', body: m.body ?? '', sent_at: m.sent_at, unread: !m.read_at,
      }))

    // ── Wysłane: odpowiedzi aktora do koordynatora
    const sentMsgs: SentMessage[] = allMsgs
      .filter(m => m.direction === 'to_coordinator')
      .map(m => ({ id: m.id, channel: m.type ?? 'email', subject: m.subject ?? '', body: m.body ?? '', sent_at: m.sent_at }))

    const merged = [...confirmations, ...infos].sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''))

    setFeed(merged)
    setSent(sentMsgs)
    setLoading(false)

    const unreadIds = infos.filter(i => i.unread).map(i => i.id)
    if (unreadIds.length > 0) {
      supabase.from('actor_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds).then(() => {})
    }
  }

  // Lekkie odświeżenie tylko listy „Wysłane" — bez spinnera, żeby potwierdzenie
  // „✓ Wysłano" w kompozytorze nie zniknęło wraz z przeładowaniem całej listy.
  async function refreshSent() {
    if (!actorId) return
    const { data } = await supabase
      .from('actor_messages').select('*')
      .eq('artist_id', actorId).eq('direction', 'to_coordinator')
      .order('sent_at', { ascending: false }).limit(200)
    setSent(((data ?? []) as any[]).map(m => ({ id: m.id, channel: m.type ?? 'email', subject: m.subject ?? '', body: m.body ?? '', sent_at: m.sent_at })))
  }

  async function respond(id: string, status: 'confirmed' | 'declined' | 'maybe') {
    await supabase.from('event_confirmations').update({ status, responded_at: new Date().toISOString() }).eq('id', id)
    setFeed(prev => prev.map(m => m.itemType === 'confirmation' && m.id === id ? { ...m, status } : m))
  }

  if (!actorId) return null

  const tabBtn = (key: 'odebrane' | 'wyslane', label: string, count: number) => (
    <button
      onClick={() => setTab(key)}
      className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors"
      style={tab === key ? { background: '#1a1410', color: '#fff' } : { background: '#fff', color: '#7a7068', border: '1px solid #e4ddd4' }}
    >
      {label} <span className="ml-1 opacity-60">{count}</span>
    </button>
  )

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Wiadomości</h1>
        <p className="text-xs text-gray-500 mt-0.5">{actorName} · potwierdzenia i powiadomienia od koordynatora</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-5">
        {tabBtn('odebrane', 'Odebrane', feed.length)}
        {tabBtn('wyslane', 'Wysłane', sent.length)}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Ładowanie…</div>

      ) : tab === 'wyslane' ? (
        /* ── WYSŁANE ─────────────────────────────────────────── */
        sent.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm font-medium text-gray-500">Brak wysłanych wiadomości</p>
            <p className="text-xs text-gray-400 mt-1">Twoje odpowiedzi do koordynatora pojawią się tutaj</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sent.map(m => (
              <div key={m.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <p className="text-sm font-semibold text-gray-900 truncate">Do koordynatora</p>
                  <ChannelPill channel={m.channel} />
                </div>
                <p className="text-xs text-gray-600 whitespace-pre-wrap mb-2">{m.body}</p>
                <p className="text-[11px] text-gray-400">Wysłano: {fmtDateTime(m.sent_at)}</p>
              </div>
            ))}
          </div>
        )

      ) : feed.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-gray-400">
              <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">Brak wiadomości</p>
          <p className="text-xs text-gray-400 mt-1">Potwierdzenia od koordynatora pojawią się tutaj</p>
        </div>

      ) : (
        /* ── ODEBRANE ─────────────────────────────────────────── */
        <div className="flex flex-col gap-3">
          {feed.map(msg => msg.itemType === 'info' ? (
            <div key={`i-${msg.id}`} className={`bg-white border rounded-2xl p-4 shadow-sm ${msg.unread ? 'border-[#c8102e]/30' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex items-center gap-2">
                  {msg.unread && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#c8102e' }} />}
                  <p className="text-sm font-semibold text-gray-900 truncate">{msg.subject || KIND_LABELS[msg.kind] || 'Wiadomość'}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <ChannelPill channel={msg.channel} />
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{KIND_LABELS[msg.kind] ?? msg.kind}</span>
                </div>
              </div>
              <p className="text-xs text-gray-600 whitespace-pre-wrap mb-2">{msg.body}</p>
              <p className="text-[11px] text-gray-400">Wysłano: {fmtDateTime(msg.sent_at)}</p>
              <ReplyBox actorId={actorId} replyTo={msg.subject || KIND_LABELS[msg.kind]} onSent={refreshSent} />
            </div>
          ) : (
            <div key={`c-${msg.id}`} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{msg.event_type ?? msg.event_title ?? 'Wydarzenie'}</p>
                  {msg.event_title && msg.event_type && <p className="text-xs text-gray-500 truncate">{msg.event_title}</p>}
                  {msg.event_start && <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(msg.event_start)}</p>}
                </div>
                <div className="shrink-0"><StatusPill status={msg.status} /></div>
              </div>
              <p className="text-[11px] text-gray-400 mb-3">
                Wysłano: {fmtDateTime(msg.sent_at)}{msg.responded_at && ` · Odpowiedź: ${fmtDateTime(msg.responded_at)}`}
              </p>
              {msg.comment && <p className="text-xs text-gray-500 italic mb-3 border-l-2 border-gray-200 pl-2">„{msg.comment}"</p>}
              {msg.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => respond(msg.id, 'confirmed')} className="flex-1 py-2 text-xs font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors">✓ BĘDĘ</button>
                  <button onClick={() => respond(msg.id, 'maybe')} className="flex-1 py-2 text-xs font-bold bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors">~ BYĆ MOŻE</button>
                  <button onClick={() => respond(msg.id, 'declined')} className="flex-1 py-2 text-xs font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors">✗ NIE BĘDĘ</button>
                </div>
              )}
              <ReplyBox actorId={actorId} replyTo={msg.event_type ?? msg.event_title ?? undefined} onSent={refreshSent} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
