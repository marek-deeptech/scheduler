'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'

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
    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-gray-500">{name.charAt(0).toUpperCase()}</span>
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
    case 'Aktywny':    return 'bg-green-100 text-green-700'
    case 'Na urlopie': return 'bg-amber-100 text-amber-700'
    case 'Choroba':    return 'bg-red-100 text-red-600'
    default:           return 'bg-gray-100 text-gray-500'
  }
}

/* ── PersonRow ─────────────────────────────────────────────────── */
/* Shared grid template — must match the header row exactly */
const ROW = 'grid items-center gap-x-4 px-5 py-3'
             + ' grid-cols-[16px_32px_minmax(0,1fr)_96px_128px_minmax(0,160px)_80px]'

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
    <div className={`${ROW} hover:bg-gray-50/50 group transition-colors`}>
      {/* checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-4 h-4 rounded accent-gray-900 cursor-pointer"
      />
      {/* avatar */}
      <PersonAvatar name={person.name} url={person.avatar_url} />
      {/* name + role */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{person.name}</p>
        <p className="text-xs text-gray-500 truncate">{person.role ?? '—'}</p>
      </div>
      {/* team */}
      <div>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
          {person.team}
        </span>
      </div>
      {/* status */}
      <div>
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusClasses(person.status)}`}>
          {person.status ?? '—'}
        </span>
      </div>
      {/* contact */}
      <div className="min-w-0">
        {person.email && <p className="text-xs text-gray-500 truncate">{person.email}</p>}
        {person.phone && <p className="text-xs text-gray-500 truncate">{person.phone}</p>}
      </div>
      {/* actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
        body: JSON.stringify({ artistIds: ids, subject, body }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {type === 'email' ? tm.composeEmailTitle : tm.composeSmsTitle}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors text-lg leading-none"
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{tm.bodyLabel}</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={6}
                  placeholder={tm.bodyPlaceholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>
              {sent ? (
                <p className="text-sm text-green-600 font-medium text-center">{tm.sent}</p>
              ) : (
                <button
                  onClick={handleSendEmail}
                  disabled={sending || !subject.trim() || !body.trim()}
                  className="w-full px-4 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
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
              <p className="text-xs text-gray-500 italic">
                {tm.smsManualNote}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyNumbers}
                  disabled={phoneRecipients.length === 0}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {tm.copyNumbers}
                </button>
                {phoneRecipients.length === 1 && body.trim() && (
                  <a
                    href={`sms:${phoneRecipients[0].phone}?body=${encodeURIComponent(body)}`}
                    className="flex-1 px-4 py-2 text-sm font-medium text-center bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    {tm.openSmsApp}
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function MessagesPage() {
  const { t } = useLanguage()
  const tm = t.messages
  const [people, setPeople] = useState<Person[]>([])
  const [theatres, setTheatres] = useState<Theatre[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [theatreFilter, setTheatreFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'name' | 'team' | 'status'>('name')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [compose, setCompose] = useState<{ type: 'email' | 'sms'; ids: string[] } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase
        .from('artists')
        .select('id, name, email, phone, role, status, birth_date, avatar_url, teams(name), artist_productions(productions(theatre_id))')
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
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'pl')
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{tm.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tm.subtitle(people.length)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder={tm.searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />

        {([[  'all', tm.allTeams], ['Cast', tm.teamCast], ['Technique', tm.teamTechnique], ['Wardrobe', tm.teamWardrobe]] as [string, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTeamFilter(val)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              teamFilter === val
                ? 'bg-gray-900 text-white border-gray-900'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}

        {theatres.length > 1 && (
          <select
            value={theatreFilter}
            onChange={e => setTheatreFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 focus:outline-none ml-auto"
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
          className={`border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 focus:outline-none ${theatres.length <= 1 ? 'ml-auto' : ''}`}
        >
          <option value="all">{tm.allStatuses}</option>
          <option value="Aktywny">Aktywny</option>
          <option value="Na urlopie">Na urlopie</option>
          <option value="Choroba">Choroba</option>
          <option value="Nieaktywny">Nieaktywny</option>
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'name' | 'team' | 'status')}
          className="border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 focus:outline-none"
        >
          <option value="name">{tm.sortByName}</option>
          <option value="team">{tm.sortByTeam}</option>
          <option value="status">{tm.sortByStatus}</option>
        </select>
      </div>

      {/* Person list */}
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-16">{tm.loading}</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* List header */}
          <div className={`${ROW} border-b border-gray-100 bg-gray-50`}>
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
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{tm.colTeam}</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{tm.colStatus}</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{tm.colContact}</span>
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

      {/* Sticky bottom bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-56 right-0 z-40 bg-white border-t border-gray-200 px-8 py-4 flex items-center gap-4 shadow-lg">
          <span className="text-sm font-semibold text-gray-900">
            {tm.selectedCount(selected.size)}
          </span>
          <span className="text-gray-500">·</span>
          <button
            onClick={() => setCompose({ type: 'email', ids: Array.from(selected) })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors"
          >
            <MailIcon /> {tm.sendEmail}
          </button>
          <button
            onClick={() => setCompose({ type: 'sms', ids: Array.from(selected) })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <PhoneIcon /> {tm.sendSms}
          </button>
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
