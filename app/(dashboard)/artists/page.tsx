'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ArtistModal from '@/components/ArtistModal'
import { IconMail, IconPhone, IconTheatre, IconSun, IconHeart } from '@/lib/icons'
import { useLanguage } from '@/lib/language-context'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArtistRow {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  actor_type: string | null
  avatar_url: string | null
  productionCount: number
}

interface ProductionRef {
  id: string
  title: string
  theatreName: string | null
  status: string | null
}

interface EventRef {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  room: string | null
  productionTitle: string | null
}

interface AvailRef {
  id: string
  type: string
  start_time: string
  end_time: string
  note: string | null
}

interface SubstituteRef {
  id: string
  name: string
  avatar_url: string | null
  status: string | null
}

interface ArtistDetail {
  productions: ProductionRef[]
  upcomingEvents: EventRef[]
  pastEvents: EventRef[]
  vacations: AvailRef[]
  sicknesses: AvailRef[]
  substitutes: SubstituteRef[]
}

interface ProductionForModal { id: string; title: string; theatres?: { name: string } | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
  'Dostępny':                   { badge: 'bg-green-600 text-white',        dot: 'bg-green-500'   },
  'Dostępny tylko w Warszawie': { badge: 'bg-emerald-900 text-white',      dot: 'bg-emerald-700' },
  'Niepewny':                   { badge: 'bg-orange-500 text-white',       dot: 'bg-orange-400'  },
  'Niedostępny':                { badge: 'bg-red-600 text-white',          dot: 'bg-red-500'     },
  'Urlop':                      { badge: 'bg-amber-400 text-black',        dot: 'bg-amber-400'   },
  'Choroba':                    { badge: 'bg-gray-900 text-white',         dot: 'bg-gray-700'    },
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, size = 'sm' }: { status: string | null; size?: 'sm' | 'md' }) {
  const s = status ?? 'Dostępny'
  const style = STATUS_STYLE[s] ?? STATUS_STYLE['Dostępny']
  const cls = size === 'md'
    ? `text-[11px] font-semibold px-2.5 py-1 rounded-full ${style.badge}`
    : `text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`}>
      {s === 'Urlop' && <IconSun size={size === 'md' ? 11 : 10} />}
      {s}
    </span>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtDayShort(iso: string, localeStr: string) {
  return new Date(iso).toLocaleDateString(localeStr, { weekday: 'short', day: 'numeric', month: 'short' })
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 'md' }: { url: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className={`${sz} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${sz} rounded-full bg-gray-200 flex items-center justify-center font-semibold text-gray-600 shrink-0`}>
      {initials(name)}
    </div>
  )
}

// ─── Artist card ──────────────────────────────────────────────────────────────

function ArtistCard({ artist, isSelected, onClick }: {
  artist: ArtistRow
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      <Avatar url={artist.avatar_url} name={artist.name} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{artist.name}</p>
        <p className="text-xs text-gray-500 truncate">{artist.role ?? '—'}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={artist.status} size="sm" />
        {artist.actor_type && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 capitalize">
            {artist.actor_type}
          </span>
        )}
        {artist.productionCount > 0 && (
          <span className="text-[10px] text-gray-500">{artist.productionCount} prod.</span>
        )}
      </div>
    </div>
  )
}

// ─── Week-view helpers ────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1  // Mon=0 … Sun=6
  const mon = new Date(d)
  mon.setHours(0, 0, 0, 0)
  mon.setDate(d.getDate() - day)
  return mon
}

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n * 7)
  return r
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function eventTypePill(type: string | null): string {
  if (!type) return 'bg-gray-100 text-gray-600 border-l-gray-300'
  if (type.startsWith('Próba'))  return 'bg-blue-50 text-blue-700 border-l-blue-400'
  if (type === 'Spektakl' || type === 'Premiera' || type === 'Spektakl gościnny')
    return 'bg-purple-50 text-purple-700 border-l-purple-400'
  if (type === 'Przymiarki kostiumowe') return 'bg-green-50 text-green-700 border-l-green-400'
  return 'bg-gray-100 text-gray-600 border-l-gray-300'
}

// ─── Artist week view ─────────────────────────────────────────────────────────

function ArtistWeekView({ artistId, localeStr, ta }: {
  artistId: string
  localeStr: string
  ta: ReturnType<typeof useLanguage>['t']['artists']
}) {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [events,    setEvents]    = useState<EventRef[]>([])
  const [avails,    setAvails]    = useState<AvailRef[]>([])
  const [loading,   setLoading]   = useState(true)
  // We fetch a wide window (±10 weeks) once and navigate locally
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)

  const todayStr = toDateStr(new Date())

  const fetch = useCallback(async (id: string) => {
    setLoading(true)
    const rangeStart = toDateStr(addWeeks(getMonday(new Date()), -4))
    const rangeEnd   = toDateStr(addWeeks(getMonday(new Date()), +12))

    const { data: eaData } = await supabase
      .from('event_artists').select('event_id').eq('artist_id', id)

    const eventIds = ((eaData ?? []) as any[]).map(r => r.event_id)

    const [evData, avData] = await Promise.all([
      eventIds.length > 0
        ? supabase.from('events')
            .select('id, title, type, start_time, end_time, rooms(name), productions(title)')
            .in('id', eventIds)
            .gte('start_time', `${rangeStart}T00:00:00`)
            .lte('start_time', `${rangeEnd}T23:59:59`)
            .order('start_time')
        : Promise.resolve({ data: [] }),
      supabase.from('availabilities')
        .select('id, type, start_time, end_time, note')
        .eq('artist_id', id)
        .in('type', ['Urlop', 'Choroba'])
        .order('start_time'),
    ])

    setEvents(((evData.data ?? []) as any[]).map(e => {
      const rm   = Array.isArray(e.rooms)       ? e.rooms[0]       : e.rooms
      const prod = Array.isArray(e.productions)  ? e.productions[0] : e.productions
      return { id: e.id, title: e.title, type: e.type, start_time: e.start_time,
               end_time: e.end_time, room: rm?.name ?? null, productionTitle: prod?.title ?? null }
    }))
    setAvails((avData.data ?? []) as AvailRef[])
    setFetchedFor(id)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (artistId !== fetchedFor) fetch(artistId)
  }, [artistId, fetchedFor, fetch])

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const weekLabel = (() => {
    const s = weekStart
    const e = weekDays[6]
    const sm = s.toLocaleDateString(localeStr, { day: 'numeric', month: 'short' })
    const em = e.toLocaleDateString(localeStr, { day: 'numeric', month: 'short', year: 'numeric' })
    return `${sm} – ${em}`
  })()

  function isInAvail(av: AvailRef, dateStr: string): boolean {
    return av.start_time.slice(0,10) <= dateStr && av.end_time.slice(0,10) >= dateStr
  }

  function openInCalendar(dateStr: string) {
    router.push(`/calendar?date=${dateStr}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Week navigation */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setWeekStart(w => addWeeks(w, -1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors text-sm"
            title={ta.prevWeek}
          >‹</button>
          <span className="text-xs font-semibold text-gray-700 text-center flex-1">{weekLabel}</span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors text-sm"
            title={ta.nextWeek}
          >›</button>
        </div>
        {toDateStr(weekStart) !== toDateStr(getMonday(new Date())) && (
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="mt-1.5 w-full text-[10px] text-gray-500 hover:text-gray-700 transition-colors"
          >{ta.todayBtn}</button>
        )}
      </div>

      {/* Day list */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-500">{ta.loading}</div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {weekDays.map(day => {
            const dateStr = toDateStr(day)
            const isToday = dateStr === todayStr
            const dayEvents = events.filter(e => e.start_time.slice(0,10) === dateStr)
            const onVacation = avails.some(av => av.type === 'Urlop'   && isInAvail(av, dateStr))
            const onSick     = avails.some(av => av.type === 'Choroba' && isInAvail(av, dateStr))

            const bg = onSick ? 'bg-red-50' : onVacation ? 'bg-amber-50' : ''

            return (
              <div key={dateStr} className={`px-4 py-2.5 ${bg}`}>
                {/* Day header */}
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`flex items-center gap-1.5`}>
                    <span className="text-[10px] font-semibold text-gray-500 uppercase w-7">
                      {day.toLocaleDateString(localeStr, { weekday: 'short' })}
                    </span>
                    <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-gray-900 text-white' : 'text-gray-700'
                    }`}>{day.getDate()}</span>
                  </div>

                  {onSick && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-red-500 ml-1">
                      <IconHeart size={10} /> {ta.sick}
                    </span>
                  )}
                  {onVacation && !onSick && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500 ml-1">
                      <IconSun size={10} /> {ta.vacation}
                    </span>
                  )}

                  {dayEvents.length > 0 && (
                    <button
                      onClick={() => openInCalendar(dateStr)}
                      className="ml-auto text-[10px] text-gray-500 hover:text-gray-600 transition-colors"
                      title={ta.openInCalendar}
                    >↗</button>
                  )}
                </div>

                {/* Events */}
                {dayEvents.length === 0 && !onVacation && !onSick ? (
                  <p className="text-[10px] text-gray-500 pl-8">{ta.noEventsDay}</p>
                ) : (
                  <div className="flex flex-col gap-1 pl-8">
                    {dayEvents.map(ev => (
                      <button
                        key={ev.id}
                        onClick={() => openInCalendar(dateStr)}
                        className={`w-full text-left rounded-lg border-l-2 px-2 py-1 hover:opacity-80 transition-opacity ${eventTypePill(ev.type)}`}
                      >
                        <p className="text-[11px] font-semibold leading-tight truncate">
                          {ev.type ?? ev.title}
                        </p>
                        <p className="text-[10px] opacity-70 leading-tight">
                          {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                          {ev.room ? ` · ${ev.room}` : ''}
                        </p>
                        {ev.productionTitle && (
                          <p className="text-[10px] opacity-60 truncate leading-tight">{ev.productionTitle}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function ProfilePanel({ artist, detail, loading, onEdit, onClose }: {
  artist: ArtistRow
  detail: ArtistDetail | null
  loading: boolean
  onEdit: () => void
  onClose: () => void
}) {
  const { t, locale } = useLanguage()
  const ta = t.artists
  const localeStr = locale === 'pl' ? 'pl-PL' : 'en-US'
  const now = new Date()

  const [activeTab,    setActiveTab]    = useState<'profile' | 'plan'>('profile')
  const [emailOpen,    setEmailOpen]    = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody,    setEmailBody]    = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent,    setEmailSent]    = useState(false)
  const [smsOpen,      setSmsOpen]      = useState(false)
  const [smsBody,      setSmsBody]      = useState('')

  async function handleSendEmail() {
    if (!emailSubject || !emailBody) return
    setEmailSending(true)
    await fetch('/api/notify/individual-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: artist.id, subject: emailSubject, body: emailBody }),
    })
    setEmailSending(false)
    setEmailSent(true)
    setEmailSubject('')
    setEmailBody('')
    setTimeout(() => { setEmailSent(false); setEmailOpen(false) }, 3000)
  }

  // Reset to profile tab when artist changes
  useEffect(() => { setActiveTab('profile') }, [artist.id])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-5 border-b border-gray-100 shrink-0">
        <div className="flex items-start justify-between mb-4">
          <Avatar url={artist.avatar_url} name={artist.name} size="lg" />
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none">
            ×
          </button>
        </div>

        <h2 className="text-base font-bold text-gray-900">{artist.name}</h2>
        {artist.role && <p className="text-xs text-gray-500 mt-0.5">{artist.role}</p>}

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <StatusBadge status={artist.status} size="md" />
          {artist.actor_type && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 capitalize">
              {artist.actor_type}
            </span>
          )}
        </div>
        {/* Contact info */}
        <div className="mt-3 space-y-1">
          {artist.email && (
            <a href={`mailto:${artist.email}`}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800 transition-colors group">
              <IconMail size={12} className="text-gray-500 group-hover:text-gray-500" />
              {artist.email}
            </a>
          )}
          {artist.phone && (
            <a href={`tel:${artist.phone}`}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800 transition-colors group">
              <IconPhone size={12} className="text-gray-500 group-hover:text-gray-500" />
              {artist.phone}
            </a>
          )}
        </div>

        {/* Contact action buttons */}
        {(artist.email || artist.phone) && (
          <div className="flex gap-2 mt-3">
            {artist.email && (
              <button
                onClick={() => { setEmailOpen(v => !v); setSmsOpen(false) }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl border transition-colors
                  ${emailOpen ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                <IconMail size={11} /> Email
              </button>
            )}
            {artist.phone && (
              <button
                onClick={() => { setSmsOpen(v => !v); setEmailOpen(false) }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl border transition-colors
                  ${smsOpen ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                <IconPhone size={11} /> SMS
              </button>
            )}
          </div>
        )}

        {/* Email compose */}
        {emailOpen && (
          <div className="mt-2 space-y-2 border border-gray-100 rounded-xl p-3 bg-gray-50">
            <input
              placeholder={ta.emailSubjectPlaceholder}
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <textarea
              placeholder={ta.emailBodyPlaceholder}
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <div className="flex items-center justify-between">
              <button onClick={() => { setEmailOpen(false); setEmailSubject(''); setEmailBody('') }}
                className="text-xs text-gray-500 hover:text-gray-600">{ta.cancel}</button>
              <button onClick={handleSendEmail}
                disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 transition-opacity">
                {emailSending ? ta.sending : ta.sendEmail}
              </button>
            </div>
            {emailSent && <p className="text-xs text-green-600 font-medium">{ta.sent}</p>}
          </div>
        )}

        {/* SMS compose */}
        {smsOpen && (
          <div className="mt-2 space-y-2 border border-gray-100 rounded-xl p-3 bg-gray-50">
            <p className="text-[10px] text-gray-500 font-medium">{ta.smsTo}<span className="text-gray-700">{artist.phone}</span></p>
            <textarea
              placeholder={ta.smsBodyPlaceholder}
              value={smsBody}
              onChange={e => setSmsBody(e.target.value.slice(0, 160))}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">{smsBody.length}/160</span>
              <div className="flex gap-2">
                <button onClick={() => { setSmsOpen(false); setSmsBody('') }}
                  className="text-xs text-gray-500 hover:text-gray-600">{ta.cancel}</button>
                <a href={`sms:${artist.phone}${smsBody ? `?body=${encodeURIComponent(smsBody)}` : ''}`}
                  onClick={() => { setTimeout(() => { setSmsOpen(false); setSmsBody('') }, 300) }}
                  className={`text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg transition-opacity
                    ${!smsBody.trim() ? 'opacity-40 pointer-events-none' : ''}`}>
                  {ta.openSms}
                </a>
              </div>
            </div>
          </div>
        )}

        <button onClick={onEdit}
          className="mt-3 w-full py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          {ta.editProfile}
        </button>

        {/* Tab switcher */}
        <div className="flex gap-1 mt-3 p-0.5 bg-gray-100 rounded-xl">
          {(['profile', 'plan'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-[10px] transition-colors ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'profile' ? ta.profileTab : ta.planTab}
            </button>
          ))}
        </div>
      </div>

      {/* Plan tab */}
      {activeTab === 'plan' && (
        <div className="flex-1 overflow-hidden">
          <ArtistWeekView artistId={artist.id} localeStr={localeStr} ta={ta} />
        </div>
      )}

      {/* Profile tab */}
      {activeTab === 'profile' && loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">{ta.loading}</div>
      ) : activeTab === 'profile' && detail ? (
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">

          {/* Substitutes */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
              Zastępstwo
            </p>
            {detail.substitutes.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Brak przypisanego zastępstwa</p>
            ) : (
              <div className="space-y-1.5">
                {detail.substitutes.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-1.5 px-2.5 rounded-xl bg-gray-50">
                    <Avatar url={s.avatar_url} name={s.name} size="sm" />
                    <p className="text-xs font-semibold text-gray-800 flex-1 min-w-0 truncate">{s.name}</p>
                    <StatusBadge status={s.status} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Productions */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
              {ta.productions(detail.productions.length)}
            </p>
            {detail.productions.length === 0 ? (
              <p className="text-xs text-gray-500 italic">{ta.noProductions}</p>
            ) : (
              <div className="space-y-1.5">
                {detail.productions.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{p.title}</p>
                      {p.theatreName && <p className="text-[10px] text-gray-500">{p.theatreName}</p>}
                    </div>
                    {p.status && (
                      <span className="text-[10px] text-gray-500 shrink-0 ml-2">{p.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming events */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
              {ta.upcoming(detail.upcomingEvents.length)}
            </p>
            {detail.upcomingEvents.length === 0 ? (
              <p className="text-xs text-gray-500 italic">{ta.noUpcoming}</p>
            ) : (
              <div className="space-y-1.5">
                {detail.upcomingEvents.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-xl bg-gray-50">
                    <div className="shrink-0 text-center w-8 mt-0.5">
                      <p className="text-[10px] text-gray-500 leading-none">
                        {new Date(ev.start_time).toLocaleDateString(localeStr, { weekday: 'short' })}
                      </p>
                      <p className="text-sm font-bold text-gray-700 leading-tight">
                        {new Date(ev.start_time).getDate()}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 truncate">{ev.type ?? ev.title}</p>
                      <p className="text-[10px] text-gray-500">
                        {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                        {ev.room ? ` · ${ev.room}` : ''}
                      </p>
                      {ev.productionTitle && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 truncate">
                          <IconTheatre size={10} className="text-gray-500 shrink-0" /><span>{ev.productionTitle}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Availability */}
          {(detail.vacations.length > 0 || detail.sicknesses.length > 0) && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">{ta.availability}</p>
              <div className="space-y-1.5">
                {detail.vacations.map(v => {
                  const isActive = v.start_time <= now.toISOString() && v.end_time >= now.toISOString()
                  return (
                    <div key={v.id} className={`flex items-start gap-2 py-1.5 px-2.5 rounded-xl ${isActive ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50'}`}>
                      <IconSun size={16} className="text-gray-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                          {fmtDate(v.start_time)} – {fmtDate(v.end_time)}
                        </p>
                        {v.note && <p className="text-[10px] text-gray-500">{v.note}</p>}
                      </div>
                      {isActive && <span className="text-[10px] font-semibold text-amber-600 shrink-0 ml-auto">{ta.active}</span>}
                    </div>
                  )
                })}
                {detail.sicknesses.map(s => {
                  const isActive = s.start_time <= now.toISOString() && s.end_time >= now.toISOString()
                  return (
                    <div key={s.id} className={`flex items-start gap-2 py-1.5 px-2.5 rounded-xl ${isActive ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                      <IconHeart size={16} className="text-gray-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                          {fmtDate(s.start_time)} – {fmtDate(s.end_time)}
                        </p>
                        {s.note && <p className="text-[10px] text-gray-500">{s.note}</p>}
                      </div>
                      {isActive && <span className="text-[10px] font-semibold text-red-500 shrink-0 ml-auto">{ta.active}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Past events */}
          {detail.pastEvents.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                {ta.history(detail.pastEvents.length)}
              </p>
              <div className="space-y-1">
                {detail.pastEvents.map(ev => (
                  <div key={ev.id} className="flex items-center gap-2.5 py-1 px-2 opacity-50">
                    <span className="text-[10px] text-gray-500 w-14 shrink-0">{fmtDate(ev.start_time).slice(0, 5)}</span>
                    <span className="text-xs text-gray-600 truncate">{ev.type ?? ev.title}</span>
                    {ev.productionTitle && (
                      <span className="text-[10px] text-gray-500 ml-auto shrink-0 truncate max-w-[80px]">{ev.productionTitle}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : null}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ArtistsPage() {
  const { t } = useLanguage()
  const ta = t.artists
  const [artists,      setArtists]      = useState<ArtistRow[]>([])
  const [productions,  setProductions]  = useState<ProductionForModal[]>([])
  const [loading,      setLoading]      = useState(true)

  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [detail,       setDetail]       = useState<ArtistDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [modal,        setModal]        = useState<ArtistRow | null | undefined>(undefined)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { fetchArtists() }, [])

  async function fetchArtists() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: aData }, { data: pData }, { data: dsData }] = await Promise.all([
      supabase.from('artists')
        .select('id, name, email, phone, role, birth_date, actor_type, avatar_url, teams!inner(name), artist_productions(production_id)')
        .eq('teams.name', 'Cast')
        .order('name'),
      supabase.from('productions').select('id, title, theatres(name)').order('title'),
      supabase.from('actor_day_status').select('artist_id, status').eq('date', today),
    ])

    // today's status per artist_id
    const todayStatus: Record<string, string> = {}
    for (const r of ((dsData ?? []) as any[])) {
      todayStatus[r.artist_id] = r.status
    }

    setArtists(((aData ?? []) as any[]).map(a => ({
      id:              a.id,
      name:            a.name,
      email:           a.email ?? '',
      phone:           a.phone ?? null,
      role:            a.role ?? null,
      status:          todayStatus[a.id] ?? null,
      actor_type:      a.actor_type ?? null,
      avatar_url:      a.avatar_url ?? null,
      productionCount: (a.artist_productions ?? []).length,
    })))
    setProductions(((pData ?? []) as any[]).map(p => ({
      id: p.id, title: p.title,
      theatres: Array.isArray(p.theatres) ? (p.theatres[0] ?? null) : (p.theatres ?? null),
    })))
    setLoading(false)
  }

  async function fetchDetail(artistId: string) {
    setDetailLoading(true)
    const now = new Date().toISOString()

    const [{ data: apData }, { data: avData }, { data: eaData }, { data: subData }] = await Promise.all([
      supabase.from('artist_productions')
        .select('productions(id, title, status, theatres(name))')
        .eq('artist_id', artistId),
      supabase.from('availabilities')
        .select('id, type, start_time, end_time, note')
        .eq('artist_id', artistId)
        .in('type', ['Urlop', 'Choroba'])
        .order('start_time'),
      supabase.from('event_artists')
        .select('event_id')
        .eq('artist_id', artistId),
      supabase.from('actor_substitutes')
        .select('substitute_id, artists!actor_substitutes_substitute_id_fkey(id, name, avatar_url, status)')
        .eq('actor_id', artistId),
    ])

    const eventIds = (eaData ?? []).map((r: any) => r.event_id)

    let upcomingEvents: EventRef[] = []
    let pastEvents: EventRef[] = []

    if (eventIds.length > 0) {
      const [{ data: upData }, { data: pastData }] = await Promise.all([
        supabase.from('events')
          .select('id, title, type, start_time, end_time, rooms(name), productions(title)')
          .in('id', eventIds)
          .gte('start_time', now)
          .order('start_time')
          .limit(20),
        supabase.from('events')
          .select('id, title, type, start_time, end_time, productions(title)')
          .in('id', eventIds)
          .lt('start_time', now)
          .order('start_time', { ascending: false })
          .limit(15),
      ])

      upcomingEvents = ((upData ?? []) as any[]).map(e => {
        const rm   = Array.isArray(e.rooms)       ? e.rooms[0]       : e.rooms
        const prod = Array.isArray(e.productions)  ? e.productions[0] : e.productions
        return { id: e.id, title: e.title, type: e.type, start_time: e.start_time, end_time: e.end_time, room: rm?.name ?? null, productionTitle: prod?.title ?? null }
      })
      pastEvents = ((pastData ?? []) as any[]).map(e => {
        const prod = Array.isArray(e.productions) ? e.productions[0] : e.productions
        return { id: e.id, title: e.title, type: e.type, start_time: e.start_time, end_time: e.end_time, room: null, productionTitle: prod?.title ?? null }
      })
    }

    const prods: ProductionRef[] = ((apData ?? []) as any[]).map(ap => {
      const p = Array.isArray(ap.productions) ? ap.productions[0] : ap.productions
      const th = p ? (Array.isArray(p.theatres) ? p.theatres[0] : p.theatres) : null
      return p ? { id: p.id, title: p.title, status: p.status, theatreName: th?.name ?? null } : null
    }).filter(Boolean) as ProductionRef[]

    const avRaw = ((avData ?? []) as any[])

    const substitutes: SubstituteRef[] = ((subData ?? []) as any[]).map(r => {
      const a = Array.isArray(r.artists) ? r.artists[0] : r.artists
      return a ? { id: a.id, name: a.name, avatar_url: a.avatar_url ?? null, status: a.status ?? null } : null
    }).filter(Boolean) as SubstituteRef[]

    setDetail({
      productions:    prods,
      upcomingEvents,
      pastEvents,
      vacations:  avRaw.filter(r => r.type === 'Urlop'),
      sicknesses: avRaw.filter(r => r.type === 'Choroba'),
      substitutes,
    })
    setDetailLoading(false)
  }

  function selectArtist(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return }
    setSelectedId(id)
    setDetail(null)
    fetchDetail(id)
  }

  // Filters
  const filtered = useMemo(() => {
    let list = artists
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a => a.name.toLowerCase().includes(q) || (a.role ?? '').toLowerCase().includes(q))
    }
    return list
  }, [artists, statusFilter, search])

  const selectedArtist = artists.find(a => a.id === selectedId) ?? null

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: artists.length }
    for (const a of artists) c[a.status ?? 'Aktywny'] = (c[a.status ?? 'Aktywny'] ?? 0) + 1
    return c
  }, [artists])

  const statusOptions = ['Dostępny', 'Dostępny tylko w Warszawie', 'Niepewny', 'Niedostępny', 'Urlop', 'Choroba']

  return (
    <>
      {modal !== undefined && (
        <ArtistModal
          artist={modal}
          productions={productions}
          allActors={artists.map(a => ({ id: a.id, name: a.name, role: a.role }))}
          onClose={() => setModal(undefined)}
          onSaved={() => {
            setModal(undefined)
            fetchArtists()
            if (selectedId) fetchDetail(selectedId)
          }}
        />
      )}

      <div className="flex gap-0 -m-8 h-[calc(100vh-0px)] overflow-hidden">

        {/* ── Left: list ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-white shrink-0">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{ta.title}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{ta.total(artists.length)}</p>
            </div>
            <button
              onClick={() => setModal(null)}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              {ta.addButton}
            </button>
          </div>

          {/* Search + filter */}
          <div className="px-8 py-3 border-b border-gray-100 bg-white shrink-0 flex items-center gap-3 flex-wrap">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={ta.searchPlaceholder}
              className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <div className="flex gap-1 flex-wrap">
              {[{ key: 'all', label: ta.all }, ...statusOptions.map(s => ({ key: s, label: s }))].map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === f.key
                      ? f.key === 'all'
                        ? 'bg-gray-900 text-white'
                        : (STATUS_STYLE[f.key]?.badge ?? 'bg-gray-100 text-gray-700')
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                  {statusCounts[f.key] != null && (
                    <span className="ml-1 opacity-60">{statusCounts[f.key]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-8 py-4">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-500 text-sm">{ta.loading}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <div className="flex justify-center mb-3"><IconTheatre size={48} className="text-gray-500 mx-auto" /></div>
                <p className="text-sm font-medium">{ta.empty}</p>
                {search && <p className="text-xs mt-1">{ta.emptyHint}</p>}
              </div>
            ) : (
              <div className={`grid gap-2 ${selectedArtist ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                {filtered.map(a => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    isSelected={selectedId === a.id}
                    onClick={() => selectArtist(a.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: profile panel ─────────────────────────────────────────── */}
        <div className={`shrink-0 border-l border-gray-200 bg-white transition-all duration-200 overflow-hidden ${selectedArtist ? 'w-80' : 'w-0'}`}>
          {selectedArtist && (
            <ProfilePanel
              artist={selectedArtist}
              detail={detail}
              loading={detailLoading}
              onEdit={() => setModal(selectedArtist)}
              onClose={() => { setSelectedId(null); setDetail(null) }}
            />
          )}
        </div>

      </div>
    </>
  )
}
