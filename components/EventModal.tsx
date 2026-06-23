'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import { EVENT_TYPE_CATEGORIES, EVENT_TYPES } from '@/types'
import SendConfirmModal from '@/components/SendConfirmModal'

interface ArtistRecord {
  id: string
  name: string
  teams: { name: string } | null
}

interface EventRecord {
  id: string
  title: string
  type: string | null
  production_id: string | null
  theatre_id: string | null
  room_id: string | null
  location: string | null
  start_time: string
  end_time: string
  event_artists?: { artist_id: string }[]
}

interface Production { id: string; title: string }
interface Theatre    { id: string; name: string }
interface Room       { id: string; theatre_id: string; name: string }

interface Props {
  event: EventRecord | null          // null = create mode
  defaultDate?: string               // YYYY-MM-DD for create mode
  defaultProductionId?: string       // pre-fills and hides production selector
  artists: ArtistRecord[]
  productions: Production[]
  theatres: Theatre[]
  rooms: Room[]
  zIndex?: number                    // default 80; use 90 when nested inside another modal
  onClose: () => void
  onSaved: () => void
}

const TEAM_STYLE: Record<string, string> = {
  Cast:      'bg-gray-100 text-gray-700',
  Technique: 'bg-gray-100 text-gray-700',
  Wardrobe:  'bg-gray-100 text-gray-700',
  default:   'bg-gray-100 text-gray-600',
}

function pad(n: number) { return String(n).padStart(2, '0') }

function splitDateTime(iso: string) {
  const d = new Date(iso)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return { date, time }
}

export default function EventModal({ event, defaultDate, defaultProductionId, artists, productions, theatres, rooms, zIndex = 80, onClose, onSaved }: Props) {
  const { t, locale } = useLanguage()
  const em = t.eventModal
  const isEdit = !!event

  const initStart = event ? splitDateTime(event.start_time) : { date: defaultDate ?? '', time: '09:00' }
  const initEnd   = event ? splitDateTime(event.end_time)   : { date: defaultDate ?? '', time: '12:00' }

  const [form, setForm] = useState({
    production_id: event?.production_id ?? defaultProductionId ?? '',
    type:          event?.type ?? '',
    title:         event?.title ?? '',
    date:          initStart.date,
    start_time:    initStart.time,
    end_time:      initEnd.time,
    theatre_id:    event?.theatre_id ?? '',
    room_id:       event?.room_id ?? '',
    location:      event?.location ?? '',
    artist_ids:    event?.event_artists?.map(ea => ea.artist_id) ?? [],
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Confirmations state ─────────────────────────────────────────────────────
  interface ConfirmationRow {
    id: string
    artist_id: string
    token: string
    status: string
    comment: string | null
    sent_at: string
    responded_at: string | null
    artists: { name: string; email: string | null; phone: string | null } | null
  }
  const [confirmations, setConfirmations] = useState<ConfirmationRow[]>([])
  const [confLoading,   setConfLoading]   = useState(false)
  const [confSending,   setConfSending]   = useState(false)
  const [confConfirm,   setConfConfirm]   = useState(false)
  const [confSent,      setConfSent]      = useState(false)
  const [confChannel,   setConfChannel]   = useState<'email' | 'sms' | 'both'>('email')

  const fetchConfirmations = useCallback(async () => {
    if (!isEdit || !event) return
    setConfLoading(true)
    const { data } = await supabase
      .from('event_confirmations')
      .select('id, artist_id, token, status, comment, sent_at, responded_at, artists(name, email, phone)')
      .eq('event_id', event.id)
      .order('sent_at', { ascending: true })
    setConfirmations((data ?? []) as unknown as ConfirmationRow[])
    setConfLoading(false)
  }, [isEdit, event])

  useEffect(() => {
    if (isEdit) fetchConfirmations()
  }, [isEdit, fetchConfirmations])

  async function handleSendConfirmations() {
    if (!event) return
    // Send to artists that have no record yet OR are still pending
    const sentArtistIds = confirmations.map(c => c.artist_id)
    const pendingIds = form.artist_ids.filter(id => {
      const conf = confirmations.find(c => c.artist_id === id)
      return !conf || conf.status === 'pending'
    })
    if (pendingIds.length === 0) return

    setConfSending(true)
    setConfSent(false)

    const production = productions.find(p => p.id === form.production_id)
    const room       = rooms.find(r => r.id === form.room_id)

    await fetch('/api/confirmations/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: event.id,
        artistIds: pendingIds,
        channel: confChannel,
        eventDetails: {
          title:            form.title || form.type || 'Wydarzenie',
          type:             form.type || null,
          start_time:       buildISO(form.date, form.start_time),
          end_time:         buildISO(form.date, form.end_time),
          production_title: production?.title ?? null,
          room:             room?.name ?? null,
        },
      }),
    }).catch(console.error)

    setConfSending(false)
    setConfConfirm(false)
    setConfSent(true)
    setTimeout(() => setConfSent(false), 3000)
    await fetchConfirmations()
  }

  // Auto-fill title from type if title is empty or matches a type
  useEffect(() => {
    if (!form.type) return
    const typeIsTitle = EVENT_TYPES.includes(form.title as any) || form.title === ''
    if (typeIsTitle) setForm(f => ({ ...f, title: form.type }))
  }, [form.type])

  // Filter rooms by selected theatre
  const filteredRooms = rooms.filter(r => !form.theatre_id || r.theatre_id === form.theatre_id)

  function toggleArtist(id: string) {
    setForm(f => ({
      ...f,
      artist_ids: f.artist_ids.includes(id)
        ? f.artist_ids.filter(a => a !== id)
        : [...f.artist_ids, id],
    }))
  }

  function buildISO(date: string, time: string) {
    return `${date}T${time}:00`
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      title:         form.title || form.type || 'Wydarzenie',
      type:          form.type || null,
      production_id: form.production_id || null,
      theatre_id:    form.theatre_id || null,
      room_id:       form.room_id || null,
      location:      form.location || null,
      start_time:    buildISO(form.date, form.start_time),
      end_time:      buildISO(form.date, form.end_time),
    }

    if (isEdit && event) {
      await supabase.from('events').update(payload).eq('id', event.id)
      await supabase.from('event_artists').delete().eq('event_id', event.id)
      if (form.artist_ids.length > 0) {
        await supabase.from('event_artists').insert(
          form.artist_ids.map(artist_id => ({ event_id: event.id, artist_id }))
        )
      }
    } else {
      const { data: newEv } = await supabase.from('events').insert(payload).select().single()
      if (newEv && form.artist_ids.length > 0) {
        await supabase.from('event_artists').insert(
          form.artist_ids.map(artist_id => ({ event_id: newEv.id, artist_id }))
        )
      }
    }

    setSaving(false)

    const artistIds = form.artist_ids
    if (artistIds.length > 0) {
      fetch('/api/notify/event-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          event: {
            id: isEdit ? event!.id : 'new',
            title: payload.title,
            type: payload.type,
            start_time: payload.start_time,
            end_time: payload.end_time,
            production_title: productions.find(p => p.id === form.production_id)?.title ?? null,
            location: form.location || null,
          },
          artistIds,
        }),
      }).catch(console.error)
    }

    onSaved()
  }

  async function handleDelete() {
    if (!event || !confirm(em.confirmDelete)) return
    setDeleting(true)
    await supabase.from('events').delete().eq('id', event.id)
    setDeleting(false)

    const artistIds = event.event_artists?.map(ea => ea.artist_id) ?? []
    if (artistIds.length > 0) {
      fetch('/api/notify/event-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          event: {
            id: event.id,
            title: event.title,
            type: event.type,
            start_time: event.start_time,
            end_time: event.end_time,
            production_title: productions.find(p => p.id === event.production_id)?.title ?? null,
            location: form.location || null,
          },
          artistIds,
        }),
      }).catch(console.error)
    }

    onSaved()
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
  const labelCls = 'block text-sm font-medium text-gray-500 mb-1.5'

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? em.editTitle : em.createTitle}
          </h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-600 transition-colors text-2xl">
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Produkcja — hidden when pre-filled from ProductionModal */}
          {!defaultProductionId && (
            <div>
              <label className={labelCls}>{em.production}</label>
              <select
                value={form.production_id}
                onChange={e => setForm(f => ({ ...f, production_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">{em.selectProduction}</option>
                {productions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}

          {/* Typ */}
          <div>
            <label className={labelCls}>{em.type}</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className={inputCls}
            >
              <option value="">{em.selectType}</option>
              {Object.entries(EVENT_TYPE_CATEGORIES).map(([category, types]) => (
                <optgroup key={category} label={category}>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Tytuł */}
          <div>
            <label className={labelCls}>{em.titleLabel} <span className="text-gray-500 font-normal">{em.titleOptional}</span></label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={inputCls}
              placeholder={em.titlePlaceholder}
            />
          </div>

          {/* Data / Od / Do */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{em.date}</label>
              <input
                required
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{em.from}</label>
              <input
                type="time"
                value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{em.to}</label>
              <input
                type="time"
                value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {/* Teatr */}
          <div>
            <label className={labelCls}>{em.theatre}</label>
            <select
              value={form.theatre_id}
              onChange={e => setForm(f => ({ ...f, theatre_id: e.target.value, room_id: '' }))}
              className={inputCls}
            >
              <option value="">{em.selectTheatre}</option>
              {theatres.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Sala */}
          <div>
            <label className={labelCls}>{em.room}</label>
            <select
              value={form.room_id}
              onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}
              className={inputCls}
              disabled={!form.theatre_id}
            >
              <option value="">{form.theatre_id ? em.selectRoom : em.selectTheatreFirst}</option>
              {filteredRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Miasto — tylko dla typu Wyjazd */}
          {form.type === 'Wyjazd' && (
            <div>
              <label className={labelCls}>Miasto</label>
              <input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className={inputCls}
                placeholder="np. Kraków, Gdańsk…"
              />
            </div>
          )}

          {/* Artyści */}
          <div>
            <label className={labelCls}>{em.artists}</label>

            {/* Assigned */}
            {form.artist_ids.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{em.assigned}</p>
                <div className="flex flex-col gap-1">
                  {artists.filter(a => form.artist_ids.includes(a.id)).map(a => {
                    const teamStyle = TEAM_STYLE[a.teams?.name ?? ''] ?? TEAM_STYLE.default
                    return (
                      <div key={a.id} className={`flex items-center justify-between px-3 py-1.5 rounded-xl ${teamStyle}`}>
                        <div>
                          <span className="text-sm font-medium">{a.name}</span>
                          {a.teams && <span className="ml-2 text-xs opacity-60">{a.teams.name}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleArtist(a.id)}
                          className="w-5 h-5 flex items-center justify-center rounded-full bg-white/60 hover:bg-white text-gray-600 hover:text-red-500 transition-colors text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Available — grouped by team */}
            {(() => {
              const available = artists.filter(a => !form.artist_ids.includes(a.id))
              if (available.length === 0) return null
              const groups: Record<string, ArtistRecord[]> = {}
              for (const a of available) {
                const key = a.teams?.name ?? 'Inne'
                if (!groups[key]) groups[key] = []
                groups[key].push(a)
              }
              return (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{em.available}</p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(groups).map(([teamName, members]) => (
                      <div key={teamName}>
                        <p className="text-[10px] text-gray-500 mb-1 pl-1">{teamName}</p>
                        <div className="flex flex-col gap-1">
                          {members.map(a => {
                            const teamStyle = TEAM_STYLE[a.teams?.name ?? ''] ?? TEAM_STYLE.default
                            return (
                              <div key={a.id} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
                                <span className="text-sm text-gray-700">{a.name}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleArtist(a.id)}
                                  className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${teamStyle} hover:opacity-80`}
                                >
                                  +
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* ── Potwierdzenia (edit mode only) ───────────────────────────── */}
          {isEdit && (
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className={labelCls + ' !mb-0'}>{em.confirmationsSection}</label>
                {confLoading && <span className="text-xs text-gray-400">Ładowanie…</span>}
              </div>

              {/* List of artist statuses */}
              {form.artist_ids.length === 0 ? (
                <p className="text-xs text-gray-400 mb-3">{em.confirmNone}</p>
              ) : (
                <div className="flex flex-col gap-1 mb-3">
                  {form.artist_ids.map(artistId => {
                    const artist = artists.find(a => a.id === artistId)
                    const conf   = confirmations.find(c => c.artist_id === artistId)
                    const status = conf?.status ?? 'unsent'

                    const badgeStyle: Record<string, string> = {
                      unsent:    'bg-gray-100 text-gray-400',
                      pending:   'bg-gray-100 text-gray-600',
                      confirmed: 'bg-green-100 text-green-700',
                      declined:  'bg-red-100 text-red-600',
                      maybe:     'bg-amber-100 text-amber-700',
                    }
                    const badgeLabel: Record<string, string> = {
                      unsent:    '— nie wysłano',
                      pending:   `⏳ ${em.statusPending}`,
                      confirmed: `✓ ${em.statusConfirmed}`,
                      declined:  `✗ ${em.statusDeclined}`,
                      maybe:     `~ ${em.statusMaybe}`,
                    }

                    return (
                      <div key={artistId} className="flex items-start justify-between px-3 py-2 rounded-xl bg-gray-50 gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800 truncate block">
                            {artist?.name ?? artistId}
                          </span>
                          {conf?.comment && (
                            <span className="text-[10px] text-gray-400 italic truncate block">„{conf.comment}"</span>
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full shrink-0 ${badgeStyle[status] ?? badgeStyle.unsent}`}>
                          {badgeLabel[status] ?? status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Channel selector + send button */}
              {form.artist_ids.length > 0 && (() => {
                const pendingCount = form.artist_ids.filter(id => {
                  const conf = confirmations.find(c => c.artist_id === id)
                  return !conf || conf.status === 'pending'
                }).length

                const hasAnySent = confirmations.length > 0

                // Count artists who have a confirmation record but no phone
                const missingPhoneCount = confirmations.filter(c =>
                  form.artist_ids.includes(c.artist_id) && !c.artists?.phone
                ).length

                const segBtnCls = (active: boolean) =>
                  `flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`

                return (
                  <>
                    {/* Segmented channel selector */}
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-2">
                      <button
                        type="button"
                        onClick={() => setConfChannel('email')}
                        className={segBtnCls(confChannel === 'email')}
                      >
                        ✉ {em.confirmChannelEmail}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfChannel('sms')}
                        className={segBtnCls(confChannel === 'sms')}
                      >
                        📱 {em.confirmChannelSms}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfChannel('both')}
                        className={segBtnCls(confChannel === 'both')}
                      >
                        {em.confirmChannelBoth}
                      </button>
                    </div>

                    {/* Missing phone warning */}
                    {confChannel !== 'email' && missingPhoneCount > 0 && (
                      <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
                        ⚠ {em.confirmNoPhone(missingPhoneCount)}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setConfConfirm(true)}
                      disabled={confSending || pendingCount === 0}
                      className="w-full py-2.5 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                    >
                      {confSending ? (
                        <>{em.confirmSending}</>
                      ) : confSent ? (
                        <>{em.confirmSent}</>
                      ) : hasAnySent ? (
                        <>{em.confirmResend} ({pendingCount})</>
                      ) : (
                        <>{em.confirmSend} ({pendingCount})</>
                      )}
                    </button>

                    {confConfirm && (
                      <SendConfirmModal
                        title="Prośba o potwierdzenie udziału"
                        channelLabel={confChannel === 'both' ? 'E-mail + SMS' : confChannel === 'sms' ? 'SMS' : 'E-mail'}
                        recipients={form.artist_ids
                          .filter(id => { const conf = confirmations.find(c => c.artist_id === id); return !conf || conf.status === 'pending' })
                          .map(id => ({ name: artists.find(a => a.id === id)?.name ?? '—' }))}
                        content={`${form.title || form.type || 'Wydarzenie'}\n${form.date} · ${form.start_time}–${form.end_time}\nProśba o potwierdzenie udziału w wydarzeniu.`}
                        confirmLabel={`Wyślij do ${pendingCount} ${pendingCount === 1 ? 'osoby' : 'osób'}`}
                        sending={confSending}
                        onConfirm={handleSendConfirmations}
                        onCancel={() => setConfConfirm(false)}
                      />
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-red-500 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {deleting ? em.deleting : em.delete}
            </button>
          ) : <div />}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              {em.cancel}
            </button>
            <button
              type="submit"
              form=""
              onClick={(e) => { e.preventDefault(); handleSave(e as any) }}
              disabled={saving || !form.date}
              className="px-5 py-2 text-sm font-medium text-white bg-gray-900 rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? em.saving : em.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
