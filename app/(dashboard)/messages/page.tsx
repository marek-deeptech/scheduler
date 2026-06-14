'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import { lastName } from '@/lib/names'

interface Person {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  avatar_url: string | null
  team: string
  teamRaw: string
  theatreIds: string[]
}

interface Theatre {
  id: string
  name: string
}

/* ── Inline avatar (no external Avatar import) ─────────────────── */
function PersonAvatar({ name, url }: { name: string; url: string | null }) {
  if (url) return <img src={url} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#e8e0d6', color: '#5a524a' }}>
      <span className="text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
    </div>
  )
}

/* ── Mail SVG (inline) ─────────────────────────────────────────── */
function MailIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
    </svg>
  )
}

/* ── Phone SVG (inline) ────────────────────────────────────────── */
function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>
    </svg>
  )
}

/* ── Status color helper ───────────────────────────────────────── */
function statusClasses(status: string | null) {
  switch (status) {
    case 'Dostępny':                    return 'bg-green-100 text-green-700'
    case 'Dostępny tylko w Warszawie':  return 'bg-amber-100 text-amber-700'
    case 'Niepewny':                    return 'bg-amber-100 text-amber-700'
    case 'Niedostępny':                 return 'bg-red-100 text-red-600'
    case 'Urlop':                       return 'bg-orange-100 text-orange-700'
    case 'Choroba':                     return 'bg-red-100 text-red-600'
    default:                            return 'bg-gray-100 text-gray-500'
  }
}

/* ── PersonRow ─────────────────────────────────────────────────── */
/* Shared grid template — must match the header row exactly */
const ROW = 'grid items-center gap-x-3 md:gap-x-4 px-4 md:px-5 py-3'
             + ' grid-cols-[16px_32px_minmax(0,1fr)_auto]'
             + ' md:grid-cols-[16px_32px_minmax(0,1fr)_96px_128px_minmax(0,160px)_80px]'

function PersonRow({
  person,
  checked,
  onToggle,
  onEmail,
  onSms,
}: {
  person: Person
  checked: boolean
  onToggle: () => void
  onEmail: () => void
  onSms: () => void
}) {
  return (
    <div className={`${ROW} hover:bg-[#faf8f5]/50 group transition-colors`}>
      {/* checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-4 h-4 rounded accent-gray-900 cursor-pointer"
      />
      {/* avatar */}
      <PersonAvatar name={person.name} url={person.avatar_url} />
      {/* name + role (mobile shows status badge inline) */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{person.name}</p>
        <p className="text-xs text-gray-500 truncate">{person.role ?? '—'}</p>
        <span className={`md:hidden inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusClasses(person.status)}`}>
          {person.status ?? '—'}
        </span>
      </div>
      {/* team */}
      <div className="hidden md:block">
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
          {person.team}
        </span>
      </div>
      {/* status */}
      <div className="hidden md:block">
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusClasses(person.status)}`}>
          {person.status ?? '—'}
        </span>
      </div>
      {/* contact */}
      <div className="hidden md:block min-w-0">
        {person.email && <p className="text-xs text-gray-500 truncate">{person.email}</p>}
        {person.phone && <p className="text-xs text-gray-500 truncate">{person.phone}</p>}
      </div>
      {/* actions — always visible on touch, hover-reveal on desktop */}
      <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {person.email && (
          <button
            onClick={onEmail}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <MailIcon /> Email
          </button>
        )}
        {person.phone && (
          <button
            onClick={onSms}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <PhoneIcon /> SMS
          </button>
        )}
      </div>
    </div>
  )
}

/* ── ComposeModal ──────────────────────────────────────────────── */
function ComposeModal({
  type,
  ids,
  people,
  onClose,
}: {
  type: 'email' | 'sms'
  ids: string[]
  people: Person[]
  onClose: () => void
}) {
  const { t } = useLanguage()
  const tm = t.messages
  const recipients = people.filter(p => ids.includes(p.id))
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const phoneRecipients = recipients.filter(r => r.phone)

  async function handleSendEmail() {
    setSending(true)
    try {
      await fetch('/api/notify/bulk-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistIds: ids, subject, body, channel: 'email' }),
      })
      setSent(true)
      setTimeout(() => onClose(), 2500)
    } finally {
      setSending(false)
    }
  }

  async function handleSendSms() {
    setSending(true)
    try {
      await fetch('/api/notify/bulk-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistIds: phoneRecipients.map(r => r.id), subject: '', body, channel: 'sms' }),
      })
      setSent(true)
      setTimeout(() => onClose(), 2500)
    } finally {
      setSending(false)
    }
  }

  function handleCopyNumbers() {
    const numbers = phoneRecipients.map(r => r.phone as string)
    navigator.clipboard.writeText(numbers.join(', '))
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {type === 'email' ? tm.composeEmailTitle : tm.composeSmsTitle}
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Recipients preview */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">{tm.recipients(recipients.length)}</p>
            <div className="flex flex-wrap gap-1.5">
              {recipients.slice(0, 5).map(r => (
                <span key={r.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                  {r.name}
                </span>
              ))}
              {recipients.length > 5 && (
                <span className="inline-flex items-center px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-500">
                  {tm.more(recipients.length - 5)}
                </span>
              )}
            </div>
          </div>

          {type === 'email' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{tm.subjectLabel}</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder={tm.subjectPlaceholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{tm.bodyLabel}</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={6}
                  placeholder={tm.bodyPlaceholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e] resize-none"
                />
              </div>
              {sent ? (
                <p className="text-sm text-green-600 font-medium text-center">{tm.sent}</p>
              ) : (
                <button
                  onClick={handleSendEmail}
                  disabled={sending || !subject.trim() || !body.trim()}
                  className="w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#c8102e', color: '#fff' }}
                  onMouseOver={e => !e.currentTarget.disabled && (e.currentTarget.style.background = '#9e0c24')}
                  onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
                >
                  {sending ? 'Wysyłanie…' : tm.sendTo(recipients.length)}
                </button>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {tm.smsCounter(body.length)}
                </label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value.slice(0, 160))}
                  rows={5}
                  placeholder={tm.smsBodyPlaceholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e] resize-none"
                />
              </div>
              {phoneRecipients.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1.5">
                    {tm.phoneNumbersLabel(phoneRecipients.length)}
                  </p>
                  <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 font-mono break-all">
                    {phoneRecipients.map(r => r.phone).join(', ')}
                  </div>
                </div>
              )}
              {sent ? (
                <p className="text-sm text-green-600 font-medium text-center">{tm.sent}</p>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyNumbers}
                    disabled={phoneRecipients.length === 0}
                    className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {tm.copyNumbers}
                  </button>
                  <button
                    onClick={handleSendSms}
                    disabled={sending || !body.trim() || phoneRecipients.length === 0}
                    className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: '#c8102e', color: '#fff' }}
                  >
                    {sending ? 'Wysyłanie…' : tm.sendTo(phoneRecipients.length)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Types for responses ─────────────────────────────────────────
interface ActorResponse {
  id: string
  actorName: string
  eventTitle: string
  eventStart: string | null
  status: 'confirmed' | 'declined' | 'maybe'
  respondedAt: string
  comment: string | null
}

const RESP_CFG: Record<string, { cls: string; label: string }> = {
  confirmed: { cls: 'bg-green-600 text-white',  label: 'BĘDĘ'     },
  declined:  { cls: 'bg-red-600 text-white',    label: 'NIE BĘDĘ' },
  maybe:     { cls: 'bg-orange-500 text-white', label: 'BYĆ MOŻE' },
}

// ── Sent message history ────────────────────────────────────────
interface SentMessage {
  id: string
  artistName: string | null
  channel: string
  kind: string
  direction: string
  subject: string
  body: string
  sentAt: string
}

const KIND_LABELS: Record<string, string> = {
  message:              'Wiadomość',
  confirmation_request: 'Potwierdzenie',
  repertoire_approved:  'Repertuar',
  event_change:         'Zmiana grafiku',
  availability_change:  'Dostępność',
  conflict_alert:       'Konflikty',
  substitution:         'Zastępstwo',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function RetryButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-60"
      style={done ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' } : { background: '#1a1410', color: '#fff' }}
    >
      {done ? '✓ Wysłano' : '↻ Ponów'}
    </button>
  )
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function MessagesPage() {
  const { t } = useLanguage()
  const tm = t.messages
  const [people, setPeople] = useState<Person[]>([])
  const [theatres, setTheatres] = useState<Theatre[]>([])
  const [responses, setResponses] = useState<ActorResponse[]>([])
  const [responsesOpen, setResponsesOpen] = useState(true)
  const [sentHistory, setSentHistory] = useState<SentMessage[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  // Tablica statusów: braki potwierdzeń + zastępstwa
  const [pendingPart, setPendingPart] = useState<{ id: string; event_id: string; artist_id: string; actorName: string; eventTitle: string; eventStart: string | null; sentAt: string | null; changed: boolean; eventDetails: any }[]>([])
  const [noAvailResp, setNoAvailResp] = useState<{ id: string; slotId: string; artistId: string; actorName: string; title: string; range: string }[]>([])
  const [resent, setResent] = useState<Set<string>>(new Set())
  const [subs, setSubs] = useState<{ id: string; actorName: string | null; subject: string; sentAt: string | null }[]>([])
  const [pendingOpen, setPendingOpen] = useState(true)
  const [availOpen, setAvailOpen] = useState(false)
  const [subsOpen, setSubsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [theatreFilter, setTheatreFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'name' | 'team' | 'status'>('name')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [compose, setCompose] = useState<{ type: 'email' | 'sms'; ids: string[] } | null>(null)

  useEffect(() => {
    // Load actor responses
    supabase
      .from('event_confirmations')
      .select('id, status, responded_at, comment, artists(name), events(title, type, start_time)')
      .in('status', ['confirmed', 'declined', 'maybe'])
      .not('responded_at', 'is', null)
      .order('responded_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setResponses(((data ?? []) as any[]).map(r => {
          const artist = Array.isArray(r.artists) ? r.artists[0] : r.artists
          const event  = Array.isArray(r.events)  ? r.events[0]  : r.events
          return {
            id:          r.id,
            actorName:   artist?.name ?? '—',
            eventTitle:  event?.type ?? event?.title ?? 'Wydarzenie',
            eventStart:  event?.start_time ?? null,
            status:      r.status,
            respondedAt: r.responded_at,
            comment:     r.comment ?? null,
          }
        }))
      })

    // Load sent message history (select * — works before and after migration)
    supabase
      .from('actor_messages')
      .select('*, artists(name)')
      .order('sent_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setSentHistory(((data ?? []) as any[]).map(m => {
          const artist = Array.isArray(m.artists) ? m.artists[0] : m.artists
          return {
            id:         m.id,
            artistName: artist?.name ?? null,
            channel:    m.type ?? 'email',
            kind:       m.kind ?? 'message',
            direction:  m.direction ?? 'to_actor',
            subject:    m.subject ?? '',
            body:       m.body ?? '',
            sentAt:     m.sent_at,
          }
        }))
      })

    const nowIso = new Date().toISOString()

    // Brak potwierdzenia udziału — pending event_confirmations na nadchodzące spektakle
    Promise.all([
      supabase.from('event_confirmations')
        .select('id, event_id, artist_id, sent_at, artists(name), events(title, type, start_time, end_time, productions(title), rooms(name))')
        .eq('status', 'pending').limit(150),
      supabase.from('actor_messages').select('artist_id, related_event_id').eq('kind', 'event_change'),
    ]).then(([{ data: pend }, { data: chMsgs }]) => {
      const changed = new Set((chMsgs ?? []).map((m: any) => `${m.related_event_id}:${m.artist_id}`))
      const rows = ((pend ?? []) as any[])
        .map(r => {
          const a = Array.isArray(r.artists) ? r.artists[0] : r.artists
          const e = Array.isArray(r.events) ? r.events[0] : r.events
          const prod = e ? (Array.isArray(e.productions) ? e.productions[0] : e.productions) : null
          const room = e ? (Array.isArray(e.rooms) ? e.rooms[0] : e.rooms) : null
          return { id: r.id, event_id: r.event_id, artist_id: (r as any).artist_id, actorName: a?.name ?? '—',
            eventTitle: e?.type ?? e?.title ?? 'Wydarzenie', eventStart: e?.start_time ?? null, sentAt: r.sent_at,
            eventDetails: e ? { title: e.title, type: e.type, start_time: e.start_time, end_time: e.end_time, production_title: prod?.title ?? null, room: room?.name ?? null } : null }
        })
        .filter(r => !r.eventStart || r.eventStart >= nowIso.slice(0, 10))
        .sort((a, b) => (a.eventStart ?? '').localeCompare(b.eventStart ?? ''))
        .map(r => ({ ...r, changed: changed.has(`${r.event_id}:${r.artist_id}`) }))
      setPendingPart(rows)
    })

    // Brak odpowiedzi na zapytanie o dostępność — slot_invites bez submitted_at
    supabase.from('slot_invites')
      .select('id, slot_id, artist_id, artists(name), repertoire_slots(window_start, window_end, productions(title))')
      .is('submitted_at', null).limit(120)
      .then(({ data }) => {
        setNoAvailResp(((data ?? []) as any[]).map(r => {
          const a = Array.isArray(r.artists) ? r.artists[0] : r.artists
          const s = Array.isArray(r.repertoire_slots) ? r.repertoire_slots[0] : r.repertoire_slots
          const p = s ? (Array.isArray(s.productions) ? s.productions[0] : s.productions) : null
          const range = s ? `${(s.window_start ?? '').slice(5)} – ${(s.window_end ?? '').slice(5)}` : ''
          return { id: r.id, slotId: r.slot_id, artistId: r.artist_id, actorName: a?.name ?? '—', title: p?.title ?? 'Slot', range }
        }))
      })

    // Zastępstwa
    supabase.from('actor_messages')
      .select('id, sent_at, subject, artists(name)')
      .eq('kind', 'substitution').order('sent_at', { ascending: false }).limit(40)
      .then(({ data }) => {
        setSubs(((data ?? []) as any[]).map(m => {
          const a = Array.isArray(m.artists) ? m.artists[0] : m.artists
          return { id: m.id, actorName: a?.name ?? null, subject: m.subject ?? 'Zastępstwo', sentAt: m.sent_at }
        }))
      })

    Promise.all([
      supabase
        .from('artists')
        .select('id, name, email, phone, role, status, birth_date, avatar_url, teams!inner(name), artist_productions(productions(theatre_id))')
        .eq('teams.name', 'Cast')
        .order('name'),
      supabase.from('theatres').select('id, name').order('name'),
    ]).then(([{ data: artistData }, { data: theatreData }]) => {
      const teamMap: Record<string, string> = {
        Cast: tm.teamCast,
        Technique: tm.teamTechnique,
        Wardrobe: tm.teamWardrobe,
      }
      const mapped = ((artistData ?? []) as any[]).map(a => {
        const rawTeam = a.teams?.name ?? ''
        const prods: any[] = a.artist_productions ?? []
        const theatreIds = [...new Set(
          prods
            .map((ap: any) => {
              const p = Array.isArray(ap.productions) ? ap.productions[0] : ap.productions
              return p?.theatre_id ?? null
            })
            .filter(Boolean) as string[]
        )]
        return {
          id: a.id,
          name: a.name,
          email: a.email ?? '',
          phone: a.phone ?? null,
          role: a.role ?? null,
          status: a.status ?? null,
          avatar_url: a.avatar_url ?? null,
          team: teamMap[rawTeam] ?? '—',
          teamRaw: rawTeam,
          theatreIds,
        } as Person
      })
      setPeople(mapped)
      setTheatres((theatreData ?? []) as Theatre[])
      setLoading(false)
    })
  }, [])

  // CTA „Ponów" — ponów prośbę o potwierdzenie udziału
  async function resendConfirmation(row: { id: string; event_id: string; artist_id: string; eventDetails: any }) {
    if (!row.eventDetails) return
    setResent(prev => new Set(prev).add('c' + row.id))
    await fetch('/api/confirmations/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: row.event_id, artistIds: [row.artist_id], eventDetails: row.eventDetails, channel: 'both' }),
    })
  }
  // CTA „Ponów" — ponów zapytanie o dostępność (jeden aktor)
  async function resendSlot(row: { id: string; slotId: string; artistId: string }) {
    setResent(prev => new Set(prev).add('s' + row.id))
    await fetch('/api/slots/send-invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: row.slotId, artistId: row.artistId }),
    })
  }

  const filtered = useMemo(() => {
    let list = people
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.role?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q)
      )
    }
    if (teamFilter !== 'all') list = list.filter(p => p.teamRaw === teamFilter)
    if (theatreFilter !== 'all') list = list.filter(p => p.theatreIds.includes(theatreFilter))
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter)
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return lastName(a.name).localeCompare(lastName(b.name), 'pl') || a.name.localeCompare(b.name, 'pl')
      if (sortBy === 'team') return a.team.localeCompare(b.team, 'pl')
      return (a.status ?? '').localeCompare(b.status ?? '', 'pl')
    })
  }, [people, search, teamFilter, theatreFilter, statusFilter, sortBy])

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(prev => new Set([...prev, ...filtered.map(p => p.id)]))
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(p => next.delete(p.id))
        return next
      })
    }
  }

  function togglePerson(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="pb-24">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-4 -mx-4 -mt-4 md:px-8 md:py-5 md:-mx-8 md:-mt-8 mb-6" style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>{tm.title}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>{tm.subtitle(people.length)}</p>
        </div>
      </div>

      {/* Toolbar — stacked rows on mobile, single wrapping row on desktop */}
      <div className="mb-4 space-y-2 md:space-y-0 md:flex md:flex-wrap md:items-center md:gap-2">
        <input
          type="text"
          placeholder={tm.searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full md:w-56 bg-white focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
        />

        <div className="flex flex-wrap gap-1.5 md:contents">
          {([[  'all', tm.allTeams], ['Cast', tm.teamCast], ['Technique', tm.teamTechnique], ['Wardrobe', tm.teamWardrobe]] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTeamFilter(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                teamFilter === val
                  ? ''
                  : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
              style={teamFilter === val ? { background: '#1a1410', color: '#fff', borderColor: '#1a1410' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 md:contents">
          {theatres.length > 1 && (
            <select
              value={theatreFilter}
              onChange={e => setTheatreFilter(e.target.value)}
              className="w-full md:w-auto border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 bg-white focus:outline-none md:ml-auto"
            >
              <option value="all">{tm.allTheatres}</option>
              {theatres.map(th => (
                <option key={th.id} value={th.id}>{th.name}</option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={`w-full md:w-auto border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 bg-white focus:outline-none ${theatres.length <= 1 ? 'md:ml-auto' : ''}`}
          >
            <option value="all">{tm.allStatuses}</option>
            <option value="Dostępny">Dostępny</option>
            <option value="Dostępny tylko w Warszawie">Dostępny tylko w Warszawie</option>
            <option value="Niepewny">Niepewny</option>
            <option value="Niedostępny">Niedostępny</option>
            <option value="Urlop">Urlop</option>
            <option value="Choroba">Choroba</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'name' | 'team' | 'status')}
            className={`w-full md:w-auto border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 bg-white focus:outline-none ${theatres.length > 1 ? 'col-span-2 md:col-auto' : ''}`}
          >
            <option value="name">{tm.sortByName}</option>
            <option value="team">{tm.sortByTeam}</option>
            <option value="status">{tm.sortByStatus}</option>
          </select>
        </div>
      </div>

      {/* ── Brak potwierdzenia udziału ─────────────────────────────── */}
      {pendingPart.length > 0 && (
        <div className="mb-4 bg-white border rounded-2xl overflow-hidden" style={{ borderColor: '#fde0c8' }}>
          <button onClick={() => setPendingOpen(v => !v)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Brak potwierdzenia udziału</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fff7ed', color: '#b45309' }}>{pendingPart.length}</span>
              {pendingPart.some(p => p.changed) && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{pendingPart.filter(p => p.changed).length} po zmianie</span>
              )}
            </div>
            <span className="text-gray-400 text-sm">{pendingOpen ? '▲' : '▼'}</span>
          </button>
          {pendingOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {pendingPart.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.actorName}</p>
                    <p className="text-xs text-gray-500 truncate">{r.eventTitle}{r.eventStart ? ` · ${fmtDate(r.eventStart)}` : ''}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${r.changed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                    {r.changed ? 'ZMIANA — BRAK POTW.' : 'BRAK POTWIERDZENIA'}
                  </span>
                  <RetryButton done={resent.has('c' + r.id)} onClick={() => resendConfirmation(r)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Brak odpowiedzi na dostępność (zapytania KPA) ──────────────── */}
      {noAvailResp.length > 0 && (
        <div className="mb-4 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <button onClick={() => setAvailOpen(v => !v)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Brak odpowiedzi na zapytanie o dostępność</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{noAvailResp.length}</span>
            </div>
            <span className="text-gray-400 text-sm">{availOpen ? '▲' : '▼'}</span>
          </button>
          {availOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {noAvailResp.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.actorName}</p>
                    <p className="text-xs text-gray-500 truncate">{r.title}{r.range ? ` · okno ${r.range}` : ''}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-gray-100 text-gray-600">NIE ODPOWIEDZIAŁ</span>
                  <RetryButton done={resent.has('s' + r.id)} onClick={() => resendSlot(r)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Zastępstwa ─────────────────────────────────────────────── */}
      {subs.length > 0 && (
        <div className="mb-4 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <button onClick={() => setSubsOpen(v => !v)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Zastępstwa</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{subs.length}</span>
            </div>
            <span className="text-gray-400 text-sm">{subsOpen ? '▲' : '▼'}</span>
          </button>
          {subsOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {subs.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.actorName ?? '—'}</p>
                    <p className="text-xs text-gray-500 truncate">{s.subject}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{s.sentAt ? fmtDate(s.sentAt) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Responses section ──────────────────────────────────────── */}
      {responses.length > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => setResponsesOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Odpowiedzi aktorów</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{responses.length}</span>
              <span className="flex gap-1 ml-1">
                {(['confirmed','maybe','declined'] as const).map(s => {
                  const n = responses.filter(r => r.status === s).length
                  if (!n) return null
                  return <span key={s} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${RESP_CFG[s].cls}`}>{n}</span>
                })}
              </span>
            </div>
            <span className="text-gray-400 text-sm">{responsesOpen ? '▲' : '▼'}</span>
          </button>

          {responsesOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {responses.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.actorName}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {r.eventTitle}{r.eventStart ? ` · ${fmtDate(r.eventStart)}` : ''}
                    </p>
                    {r.comment && (
                      <p className="text-[11px] text-gray-400 italic mt-0.5">„{r.comment}"</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${RESP_CFG[r.status].cls}`}>
                      {RESP_CFG[r.status].label}
                    </span>
                    <span className="text-[10px] text-gray-400">{fmtDate(r.respondedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sent history section ───────────────────────────────────── */}
      {sentHistory.length > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Historia wysłanych</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{sentHistory.length}</span>
            </div>
            <span className="text-gray-400 text-sm">{historyOpen ? '▲' : '▼'}</span>
          </button>

          {historyOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {sentHistory.map(m => (
                <div key={m.id} className="flex items-start gap-3 px-5 py-3">
                  <span className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                    m.channel === 'sms' ? 'bg-blue-100 text-blue-700' : 'bg-gray-900 text-white'
                  }`}>
                    {m.channel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {m.direction === 'to_coordinator'
                        ? <span className="text-red-700">→ Koordynator{m.artistName ? ` · ${m.artistName}` : ''}</span>
                        : m.artistName ?? '—'}
                    </p>
                    {m.subject && <p className="text-xs text-gray-600 truncate">{m.subject}</p>}
                    <p className="text-[11px] text-gray-400 truncate">{m.body}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      {KIND_LABELS[m.kind] ?? m.kind}
                    </span>
                    <span className="text-[10px] text-gray-400">{fmtDate(m.sentAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Person list */}
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-16">{tm.loading}</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* List header */}
          <div className={`${ROW} border-b border-gray-100`} style={{ background: '#faf8f5' }}>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={e => toggleAll(e.target.checked)}
              className="w-4 h-4 rounded accent-gray-900 cursor-pointer"
            />
            <div />{/* avatar placeholder */}
            <span className="text-xs text-gray-500 font-medium">
              {selected.size > 0
                ? <>{tm.nSelected(selected.size)} <button onClick={() => setSelected(new Set())} className="underline decoration-dotted hover:text-gray-700 ml-1">{tm.clearSelection}</button></>
                : `${filtered.length}`}
            </span>
            <span className="hidden md:block text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{tm.colTeam}</span>
            <span className="hidden md:block text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{tm.colStatus}</span>
            <span className="hidden md:block text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{tm.colContact}</span>
            <div />
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500 italic">
              {tm.noPeople}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(person => (
                <PersonRow
                  key={person.id}
                  person={person}
                  checked={selected.has(person.id)}
                  onToggle={() => togglePerson(person.id)}
                  onEmail={() => setCompose({ type: 'email', ids: [person.id] })}
                  onSms={() => setCompose({ type: 'sms', ids: [person.id] })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spacer so the fixed action bar doesn't cover the last rows */}
      {selected.size > 0 && <div className="h-28 md:h-20" />}

      {/* Sticky bottom bar — on mobile it sits above the bottom tab bar */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-[calc(52px+env(safe-area-inset-bottom))] md:bottom-0 left-0 md:left-56 right-0 z-40 bg-white border-t border-gray-200 px-4 md:px-8 py-3 md:py-4 flex items-center gap-3 md:gap-4 flex-wrap shadow-lg"
        >
          <span className="text-sm font-semibold text-gray-900">
            {tm.selectedCount(selected.size)}
          </span>
          <span className="hidden md:inline text-gray-500">·</span>
          {/* Buttons stay in one row: full-width pair on mobile, inline on desktop */}
          <div className="flex gap-2 w-full md:w-auto order-last md:order-none">
            <button
              onClick={() => setCompose({ type: 'email', ids: Array.from(selected) })}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors"
              style={{ background: '#c8102e', color: '#fff' }}
              onMouseOver={e => (e.currentTarget.style.background = '#9e0c24')}
              onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
            >
              <MailIcon /> {tm.sendEmail}
            </button>
            <button
              onClick={() => setCompose({ type: 'sms', ids: Array.from(selected) })}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <PhoneIcon /> {tm.sendSms}
            </button>
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
          >
            {tm.cancelSelection}
          </button>
        </div>
      )}

      {/* Compose modal */}
      {compose && (
        <ComposeModal
          type={compose.type}
          ids={compose.ids}
          people={people}
          onClose={() => setCompose(null)}
        />
      )}
    </div>
  )
}
