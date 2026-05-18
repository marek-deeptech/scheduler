'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import { EVENT_TYPE_CATEGORIES, EVENT_TYPES } from '@/types'

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
  zIndex?: number                    // default 50; use 60 when nested inside another modal
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

export default function EventModal({ event, defaultDate, defaultProductionId, artists, productions, theatres, rooms, zIndex = 50, onClose, onSaved }: Props) {
  const { locale } = useLanguage()
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
    artist_ids:    event?.event_artists?.map(ea => ea.artist_id) ?? [],
  })
  const [saving,  setSaving]  = useState(false)
  const [deleting, setDeleting] = useState(false)

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
    onSaved()
  }

  async function handleDelete() {
    if (!event || !confirm('Usunąć to wydarzenie?')) return
    setDeleting(true)
    await supabase.from('events').delete().eq('id', event.id)
    setDeleting(false)
    onSaved()
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
  const labelCls = 'block text-sm font-medium text-gray-500 mb-1.5'

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edytuj wydarzenie' : 'Nowe wydarzenie'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-lg">
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Produkcja — hidden when pre-filled from ProductionModal */}
          {!defaultProductionId && (
            <div>
              <label className={labelCls}>Produkcja</label>
              <select
                value={form.production_id}
                onChange={e => setForm(f => ({ ...f, production_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Wybierz produkcję</option>
                {productions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}

          {/* Typ */}
          <div>
            <label className={labelCls}>Typ wydarzenia</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className={inputCls}
            >
              <option value="">Wybierz typ</option>
              {Object.entries(EVENT_TYPE_CATEGORIES).map(([category, types]) => (
                <optgroup key={category} label={category}>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Tytuł */}
          <div>
            <label className={labelCls}>Tytuł <span className="text-gray-400 font-normal">(opcjonalnie)</span></label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={inputCls}
              placeholder="Np. Próba baletowa — Akt II"
            />
          </div>

          {/* Data / Od / Do */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Data *</label>
              <input
                required
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Od</label>
              <input
                type="time"
                value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Do</label>
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
            <label className={labelCls}>Teatr</label>
            <select
              value={form.theatre_id}
              onChange={e => setForm(f => ({ ...f, theatre_id: e.target.value, room_id: '' }))}
              className={inputCls}
            >
              <option value="">Wybierz teatr</option>
              {theatres.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Sala */}
          <div>
            <label className={labelCls}>Sala</label>
            <select
              value={form.room_id}
              onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}
              className={inputCls}
              disabled={!form.theatre_id}
            >
              <option value="">{form.theatre_id ? 'Wybierz salę' : 'Najpierw wybierz teatr'}</option>
              {filteredRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Artyści */}
          <div>
            <label className={labelCls}>Artyści</label>

            {/* Assigned */}
            {form.artist_ids.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Przypisani</p>
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
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Dostępni</p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(groups).map(([teamName, members]) => (
                      <div key={teamName}>
                        <p className="text-[10px] text-gray-400 mb-1 pl-1">{teamName}</p>
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
              {deleting ? 'Usuwanie...' : 'Usuń'}
            </button>
          ) : <div />}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Anuluj
            </button>
            <button
              type="submit"
              form=""
              onClick={(e) => { e.preventDefault(); handleSave(e as any) }}
              disabled={saving || !form.date}
              className="px-5 py-2 text-sm font-medium text-white bg-gray-900 rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Zapisywanie...' : 'Zapisz'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
