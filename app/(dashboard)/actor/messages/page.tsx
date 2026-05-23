'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile-context'

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function StatusPill({ status }: { status: string | null }) {
  const cfg: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700',
    confirmed: 'bg-green-600 text-white',
    declined:  'bg-red-600 text-white',
  }
  const labels: Record<string, string> = {
    pending:   'Oczekuje',
    confirmed: 'Potwierdzone',
    declined:  'Odmowa',
  }
  const s = status ?? 'pending'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg[s] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[s] ?? s}
    </span>
  )
}

function ChannelPill({ channel }: { channel: string | null }) {
  if (!channel) return null
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide">
      {channel}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ActorMessagesPage() {
  const { actorId, actorName } = useProfile()
  const router = useRouter()

  const [messages, setMessages] = useState<Message[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!actorId) { router.push('/dashboard'); return }
    load()
  }, [actorId])

  async function load() {
    if (!actorId) return
    setLoading(true)

    const { data } = await supabase
      .from('event_confirmations')
      .select(`
        id,
        event_id,
        status,
        sent_at,
        responded_at,
        comment,
        events (
          title,
          type,
          start_time
        )
      `)
      .eq('artist_id', actorId)
      .order('sent_at', { ascending: false })

    const rows = ((data ?? []) as any[]).map(r => {
      const ev = Array.isArray(r.events) ? r.events[0] : r.events
      return {
        id:           r.id,
        event_id:     r.event_id,
        event_title:  ev?.title      ?? null,
        event_type:   ev?.type       ?? null,
        event_start:  ev?.start_time ?? null,
        status:       r.status,
        comment:      r.comment      ?? null,
        sent_at:      r.sent_at,
        responded_at: r.responded_at ?? null,
      }
    })

    setMessages(rows)
    setLoading(false)
  }

  async function respond(id: string, status: 'confirmed' | 'declined') {
    await supabase
      .from('event_confirmations')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', id)
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m))
  }

  if (!actorId) return null

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Wiadomości</h1>
        <p className="text-xs text-gray-500 mt-0.5">{actorName} · potwierdzenia i powiadomienia od koordynatora</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Ładowanie…</div>
      ) : messages.length === 0 ? (
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
        <div className="flex flex-col gap-3">
          {messages.map(msg => (
            <div key={msg.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">

              {/* Event info */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {msg.event_type ?? msg.event_title ?? 'Wydarzenie'}
                  </p>
                  {msg.event_title && msg.event_type && (
                    <p className="text-xs text-gray-500 truncate">{msg.event_title}</p>
                  )}
                  {msg.event_start && (
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(msg.event_start)}</p>
                  )}
                </div>
                <div className="shrink-0">
                  <StatusPill status={msg.status} />
                </div>
              </div>

              {/* Meta */}
              <p className="text-[11px] text-gray-400 mb-3">
                Wysłano: {fmtDateTime(msg.sent_at)}
                {msg.responded_at && ` · Odpowiedź: ${fmtDateTime(msg.responded_at)}`}
              </p>

              {/* Actor comment */}
              {msg.comment && (
                <p className="text-xs text-gray-500 italic mb-3 border-l-2 border-gray-200 pl-2">„{msg.comment}"</p>
              )}

              {/* Actions — only for pending */}
              {msg.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => respond(msg.id, 'confirmed')}
                    className="flex-1 py-2 text-xs font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors"
                  >
                    ✓ Potwierdzam
                  </button>
                  <button
                    onClick={() => respond(msg.id, 'declined')}
                    className="flex-1 py-2 text-xs font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
                  >
                    ✗ Odmawiam
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
