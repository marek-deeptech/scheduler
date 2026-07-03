'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ArtistModal from '@/components/ArtistModal'
import Avatar from '@/components/Avatar'
import { IconMail, IconPhone } from '@/lib/icons'
import { useLanguage } from '@/lib/language-context'
import { sortByLastName } from '@/lib/names'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  avatar_url?: string | null
}

interface ProductionCard {
  id: string
  title: string
  director: string | null
  status: string | null
  theatreName: string | null
  members: Member[]
}

interface EventSlot {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  artistIds: string[]
}

interface Avail {
  id: string
  artist_id: string
  start_time: string
  end_time: string
  type: string
}

export interface TeamSectionProps {
  /** DB team name ('Cast', 'Technique', 'Wardrobe') or null = all artists */
  teamName: string | null
  title: string
  emptyIcon?: React.ReactNode
  /** Label shown inside production cards under member list */
  sectionLabel?: string
  /** Text for the remove-from-team confirm dialog */
  removeLabel?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  'Aktywny':             'bg-green-100 text-green-700',
  'Na urlopie':          'bg-yellow-100 text-yellow-700',
  'Choroba':             'bg-red-100 text-red-600',
  'Nieaktywny':          'bg-gray-100 text-gray-500',
  'Kontrakt zakończony': 'bg-slate-100 text-slate-500',
}

const PROD_STATUS_BADGE: Record<string, string> = {
  'Koncepcja':   'bg-slate-100 text-slate-600',
  'W produkcji': 'bg-blue-100 text-blue-700',
  'Na afiszu':   'bg-green-100 text-green-700',
  'Zawieszony':  'bg-amber-100 text-amber-700',
  'Zdjęty':      'bg-red-100 text-red-500',
}

const AVAIL_STYLE: Record<string, string> = {
  'Urlop':       'bg-yellow-50 border border-yellow-200 text-yellow-700',
  'Choroba':     'bg-red-50 border border-red-200 text-red-600',
  'Niedostępny': 'bg-gray-100 border border-gray-200 text-gray-500',
}

// DAY_NAMES injected per-render from i18n (see component body)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function pad(n: number) { return String(n).padStart(2, '0') }

// ─── MemberPickerModal ────────────────────────────────────────────────────────

function MemberPickerModal({ teamId, currentMemberIds, onClose, onSaved }: {
  teamId: string
  currentMemberIds: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useLanguage()
  const ts = t.teamSection
  const [all, setAll]     = useState<{ id: string; name: string; role: string | null }[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('artists').select('id, name, role').order('name')
      .then(({ data }) => setAll(sortByLastName(data ?? [])))
  }, [])

  const outside = all.filter(a => !currentMemberIds.includes(a.id))
  const visible  = outside.filter(a =>
    !search.trim() || a.name.toLowerCase().includes(search.toLowerCase())
  )

  async function assign(artistId: string) {
    setSaving(true)
    await supabase.from('artists').update({ team_id: teamId }).eq('id', artistId)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[70dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{ts.addToTeamTitle}</h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-2xl">×</button>
        </div>
        <div className="px-4 pt-3">
          <input autoFocus type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={ts.searchPerson}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {visible.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6 italic">
              {outside.length === 0 ? ts.alreadyInTeam : ts.noResults}
            </p>
          )}
          {visible.map(a => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-800">{a.name}</p>
                {a.role && <p className="text-xs text-gray-500">{a.role}</p>}
              </div>
              <button disabled={saving} onClick={() => assign(a.id)}
                className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                {ts.add}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── ContactModal ─────────────────────────────────────────────────────────────

function ContactModal({ member, type, onClose }: {
  member: Member
  type: 'email' | 'sms'
  onClose: () => void
}) {
  const { t } = useLanguage()
  const ts = t.teamSection
  const [subject,  setSubject]  = useState('')
  const [body,     setBody]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)

  async function handleSendEmail() {
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    await fetch('/api/notify/individual-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: member.id, subject, body }),
    })
    setSending(false)
    setSent(true)
    setTimeout(onClose, 2500)
  }

  async function handleSendSms() {
    if (!body.trim()) return
    setSending(true)
    await fetch('/api/notify/individual-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: member.id, subject: '', body, channel: 'sms' }),
    })
    setSending(false)
    setSent(true)
    setTimeout(onClose, 2500)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {type === 'email'
              ? <IconMail size={14} className="text-gray-500" />
              : <IconPhone size={14} className="text-gray-500" />}
            <h2 className="text-sm font-semibold text-gray-900">
              {type === 'email' ? ts.sendEmail : ts.sendSms}
            </h2>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">×</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Recipient */}
          <div className="flex items-center gap-2.5 py-2 px-3 bg-gray-50 rounded-xl">
            <Avatar name={member.name} avatarUrl={member.avatar_url} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800">{member.name}</p>
              <p className="text-[10px] text-gray-500 truncate">
                {type === 'email' ? member.email : (member.phone ?? '—')}
              </p>
            </div>
          </div>

          {type === 'email' ? (
            <>
              <input
                autoFocus
                placeholder={ts.subjectLabel}
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <textarea
                placeholder={ts.bodyPlaceholder}
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900" />
              {sent && <p className="text-xs text-green-600 font-medium">{ts.emailSent}</p>}
              <div className="flex justify-between items-center pt-1">
                <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-600">{ts.cancel}</button>
                <button
                  onClick={handleSendEmail}
                  disabled={sending || !subject.trim() || !body.trim() || sent}
                  className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl disabled:opacity-40 transition-opacity">
                  {sending ? ts.sending : ts.send}
                </button>
              </div>
            </>
          ) : (
            <>
              <textarea
                autoFocus
                placeholder={ts.smsBodyPlaceholder}
                value={body}
                onChange={e => setBody(e.target.value.slice(0, 160))}
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">{body.length}/160</span>
              </div>
              {sent && <p className="text-xs text-green-600 font-medium">{ts.emailSent}</p>}
              <div className="flex justify-between items-center pt-1">
                <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-600">{ts.cancel}</button>
                <button
                  onClick={handleSendSms}
                  disabled={sending || !body.trim() || sent}
                  className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl disabled:opacity-40 transition-opacity">
                  {sending ? ts.sending : ts.send}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamSection({
  teamName,
  title,
  emptyIcon = null,
  sectionLabel,
  removeLabel,
}: TeamSectionProps) {
  const { t } = useLanguage()
  const ts = t.teamSection
  const resolvedSectionLabel = sectionLabel ?? ts.colPerson
  const resolvedRemoveLabel = removeLabel ?? ts.teamEmpty
  const DAY_NAMES = ts.dayNames
  const [teamId,         setTeamId]         = useState<string | null>(null)
  const [members,        setMembers]        = useState<Member[]>([])
  const [productions,    setProductions]    = useState<ProductionCard[]>([])
  const [weekEvents,     setWeekEvents]     = useState<EventSlot[]>([])
  const [availabilities, setAvailabilities] = useState<Avail[]>([])
  const [allProductions, setAllProductions] = useState<{ id: string; title: string; theatres?: { name: string } | null }[]>([])
  const [loading,        setLoading]        = useState(true)
  const [weekOffset,     setWeekOffset]     = useState(0)
  const [editMember,     setEditMember]     = useState<Member | null | undefined>(undefined)
  const [showPicker,     setShowPicker]     = useState(false)
  const [contactTarget,  setContactTarget]  = useState<{ member: Member; type: 'email' | 'sms' } | null>(null)

  // Week range
  const baseMonday = getMonday(new Date())
  const weekStart  = new Date(baseMonday)
  weekStart.setDate(weekStart.getDate() + weekOffset * 7)
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
  })
  const weekEnd = new Date(weekDays[6])
  weekEnd.setDate(weekEnd.getDate() + 1)

  useEffect(() => { fetchBase() }, [teamName])
  useEffect(() => { if (members.length > 0) fetchWeek() }, [weekOffset, members.length])

  async function fetchBase() {
    setLoading(true)

    let tid: string | null = null
    if (teamName) {
      const { data: teamData } = await supabase.from('teams').select('id').eq('name', teamName).single()
      tid = teamData?.id ?? null
      setTeamId(tid)
      if (!tid) { setLoading(false); return }
    }

    let artistQuery = supabase.from('artists')
      .select('id, name, email, phone, role, status, avatar_url')
      .order('name')
    if (tid) artistQuery = artistQuery.eq('team_id', tid)

    const [{ data: memberData }, { data: prodData }] = await Promise.all([
      artistQuery,
      supabase.from('productions').select('id, title, theatres(name)').order('title'),
    ])

    const mems: Member[] = (memberData ?? []).map((a: any) => ({ ...a, avatar_url: a.avatar_url ?? null }))
    setMembers(sortByLastName(mems))
    setAllProductions((prodData ?? []).map((p: any) => ({
      id: p.id, title: p.title,
      theatres: Array.isArray(p.theatres) ? p.theatres[0] ?? null : p.theatres ?? null,
    })))

    if (mems.length > 0) {
      const memberIds = mems.map(m => m.id)
      const { data: apData } = await supabase
        .from('artist_productions')
        .select('artist_id, productions(id, title, director, status, theatres(name))')
        .in('artist_id', memberIds)

      const prodMap = new Map<string, ProductionCard>()
      for (const row of (apData ?? []) as any[]) {
        const p  = Array.isArray(row.productions) ? row.productions[0] : row.productions
        if (!p) continue
        const th = Array.isArray(p.theatres) ? p.theatres[0] : p.theatres
        if (!prodMap.has(p.id)) {
          prodMap.set(p.id, { id: p.id, title: p.title, director: p.director,
            status: p.status, theatreName: th?.name ?? null, members: [] })
        }
        const member = mems.find(m => m.id === row.artist_id)
        if (member) prodMap.get(p.id)!.members.push(member)
      }
      setProductions(Array.from(prodMap.values()))
    }

    setLoading(false)
  }

  async function fetchWeek() {
    const memberIds = members.map(m => m.id)
    const startISO  = weekStart.toISOString()
    const endISO    = weekEnd.toISOString()

    const [{ data: evData }, { data: avData }] = await Promise.all([
      supabase.from('events')
        .select('id, title, type, start_time, end_time, event_artists(artist_id)')
        .gte('start_time', startISO).lt('start_time', endISO),
      supabase.from('availabilities').select('*')
        .in('artist_id', memberIds)
        .lte('start_time', endISO).gte('end_time', startISO),
    ])

    const slots: EventSlot[] = ((evData ?? []) as any[])
      .map(e => ({ id: e.id, title: e.title, type: e.type,
        start_time: e.start_time, end_time: e.end_time,
        artistIds: (e.event_artists ?? []).map((ea: any) => ea.artist_id) }))
      .filter(e => e.artistIds.some((id: string) => memberIds.includes(id)))

    setWeekEvents(slots)
    setAvailabilities((avData ?? []) as Avail[])
  }

  async function removeMember(memberId: string) {
    if (!confirm(resolvedRemoveLabel)) return
    await supabase.from('artists').update({ team_id: null }).eq('id', memberId)
    fetchBase()
  }

  function getEventsForDay(memberId: string, day: Date): EventSlot[] {
    const ds = toDateStr(day)
    return weekEvents.filter(e =>
      toDateStr(new Date(e.start_time)) === ds && e.artistIds.includes(memberId)
    )
  }

  function getAvailForDay(memberId: string, day: Date): Avail | null {
    const dayStr = toDateStr(day)
    return availabilities.find(a => {
      if (a.artist_id !== memberId) return false
      const s  = toDateStr(new Date(a.start_time))
      const en = toDateStr(new Date(a.end_time))
      return dayStr >= s && dayStr <= en
    }) ?? null
  }

  if (loading) return (
    <div className="max-w-6xl mx-auto">
      <p className="text-gray-500 text-sm">{ts.loading}</p>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-12">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{ts.membersCount(members.length, productions.length)}</p>
        </div>
        <div className="flex gap-2">
          {teamName && (
            <button onClick={() => setShowPicker(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              {ts.addExisting}
            </button>
          )}
          <button onClick={() => setEditMember(null)}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors">
            {ts.addNew}
          </button>
        </div>
      </div>

      {/* ── Section 1: Members ───────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center">1</span>
          <h3 className="text-lg font-bold text-gray-900">{ts.teamComposition}</h3>
          <span className="ml-auto text-sm text-gray-500">{ts.memberCount(members.length)}</span>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-gray-200 rounded-2xl text-gray-500">
            <p className="text-4xl mb-3">{emptyIcon}</p>
            <p className="font-medium">{ts.teamEmpty}</p>
            <p className="text-sm mt-1">{ts.teamEmptyHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {members.map(m => (
              <div key={m.id} onClick={() => setEditMember(m)}
                className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center text-center gap-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group">
                <Avatar name={m.name} avatarUrl={m.avatar_url} size="lg" />
                <div>
                  <p className="font-semibold text-gray-900 text-sm leading-tight">{m.name}</p>
                  {m.role && <p className="text-xs text-gray-500 mt-0.5">{m.role}</p>}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_BADGE[m.status ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                  {m.status ?? '—'}
                </span>
                <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                  {m.email && (
                    <button onClick={e => { e.stopPropagation(); setContactTarget({ member: m, type: 'email' }) }}
                      title={ts.sendEmail}
                      className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 transition-colors">
                      <IconMail size={11} /> {ts.emailButton}
                    </button>
                  )}
                  {m.phone && (
                    <button onClick={e => { e.stopPropagation(); setContactTarget({ member: m, type: 'sms' }) }}
                      title={ts.sendSms}
                      className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 transition-colors">
                      <IconPhone size={11} /> {ts.smsButton}
                    </button>
                  )}
                  {teamName && (
                    <button onClick={e => { e.stopPropagation(); removeMember(m.id) }}
                      className="text-[10px] text-gray-500 hover:text-red-400 transition-colors ml-1">
                      {ts.removeButton}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: Productions ───────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center">2</span>
          <h3 className="text-lg font-bold text-gray-900">{ts.productionsSection}</h3>
          <span className="ml-auto text-sm text-gray-500">{ts.productionsCount(productions.length)}</span>
        </div>

        {productions.length === 0 ? (
          <p className="text-sm text-gray-500 italic bg-white border border-dashed border-gray-200 rounded-2xl py-8 text-center">
            {ts.noProductionsAssigned}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {productions.map(p => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-gray-500">{p.theatreName ?? '—'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${PROD_STATUS_BADGE[p.status ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                    {p.status ?? '—'}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{p.title}</p>
                  {p.director && <p className="text-xs text-gray-500 mt-0.5">{ts.director} {p.director}</p>}
                </div>
                <div className="border-t border-gray-50 pt-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{resolvedSectionLabel}</p>
                  <div className="flex flex-col gap-1">
                    {p.members.slice(0, 6).map(m => (
                      <div key={m.id} className="flex items-center gap-2">
                        <Avatar name={m.name} avatarUrl={m.avatar_url} size="sm" />
                        <span className="text-xs text-gray-700 truncate">{m.name}</span>
                        {m.role && <span className="text-[10px] text-gray-500 truncate">· {m.role}</span>}
                      </div>
                    ))}
                    {p.members.length > 6 && (
                      <p className="text-[10px] text-gray-500 pl-1">{ts.more(p.members.length - 6)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 3: Weekly schedule ───────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center">3</span>
          <h3 className="text-lg font-bold text-gray-900">{ts.scheduleSection}</h3>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors">‹</button>
            <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
              {fmt(weekDays[0])} – {fmt(weekDays[6])}.{weekDays[6].getFullYear()}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors">›</button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} className="text-xs text-gray-500 hover:text-gray-700 transition-colors ml-1">{ts.backToToday}</button>
            )}
          </div>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-gray-500 italic text-center py-8">{ts.addPeopleHint}</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed min-w-[760px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs w-44">{ts.colPerson}</th>
                  {weekDays.map((day, i) => {
                    const isToday = toDateStr(day) === toDateStr(new Date())
                    return (
                      <th key={i} className={`text-center py-3 font-medium text-xs ${isToday ? 'text-gray-600' : 'text-gray-500'}`}>
                        <span className="flex flex-col items-center gap-0.5">
                          <span>{DAY_NAMES[i]}</span>
                          <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>
                            {day.getDate()}
                          </span>
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {members.map(member => (
                  <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={member.name} avatarUrl={member.avatar_url} size="sm" />
                        <div>
                          <p className="text-xs font-medium text-gray-800 leading-tight">{member.name}</p>
                          {member.role && <p className="text-[10px] text-gray-500">{member.role}</p>}
                          {member.status && (
                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${STATUS_BADGE[member.status] ?? 'bg-gray-100 text-gray-500'}`}>
                              {member.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {weekDays.map((day, i) => {
                      const avail    = getAvailForDay(member.id, day)
                      const events   = getEventsForDay(member.id, day)
                      const isToday  = toDateStr(day) === toDateStr(new Date())
                      const hasStatus = member.status && member.status !== 'Aktywny'
                      return (
                        <td key={i} className={`px-1 py-1.5 align-top ${isToday ? 'bg-gray-50/50' : ''}`}>
                          <div className="flex flex-col gap-0.5">
                            {hasStatus && (
                              <div className={`rounded-lg px-1.5 py-1 text-center text-[9px] font-semibold ${STATUS_BADGE[member.status!] ?? 'bg-gray-100 text-gray-500'}`}>
                                {member.status}
                              </div>
                            )}
                            {avail && !hasStatus && (
                              <div className={`rounded-lg px-1.5 py-1 text-center text-[10px] font-medium ${AVAIL_STYLE[avail.type] ?? 'bg-gray-100 text-gray-500'}`}>
                                {avail.type}
                              </div>
                            )}
                            {events.map(ev => (
                              <div key={ev.id} className="bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1">
                                <p className="text-[10px] font-medium text-gray-700 leading-tight truncate">{ev.type ?? ev.title}</p>
                                <p className="text-[9px] text-gray-500">
                                  {String(ev.start_time).slice(11,16)}
                                  –{String(ev.end_time).slice(11,16)}
                                </p>
                              </div>
                            ))}
                            {!hasStatus && !avail && events.length === 0 && (
                              <div className="text-center text-gray-200 text-xs py-1">—</div>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Modals ───────────────────────────────────────────── */}
      {showPicker && teamId && (
        <MemberPickerModal
          teamId={teamId}
          currentMemberIds={members.map(m => m.id)}
          onClose={() => setShowPicker(false)}
          onSaved={() => { setShowPicker(false); fetchBase() }}
        />
      )}

      {editMember !== undefined && (
        <ArtistModal
          artist={editMember}
          productions={allProductions}
          presetTeamId={teamId ?? undefined}
          onClose={() => setEditMember(undefined)}
          onSaved={() => { setEditMember(undefined); fetchBase() }}
        />
      )}

      {contactTarget && (
        <ContactModal
          member={contactTarget.member}
          type={contactTarget.type}
          onClose={() => setContactTarget(null)}
        />
      )}
    </div>
  )
}
