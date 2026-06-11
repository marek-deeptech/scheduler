'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EventModal from '@/components/EventModal'
import { EVENT_TYPE_CATEGORIES } from '@/types'

interface Theatre { id: string; name: string }
interface Room    { id: string; theatre_id: string; name: string }

interface ArtistRecord {
  id: string
  name: string
  role: string | null
  teams?: { name: string } | null
}

interface ProductionRecord {
  id: string
  title: string
  director: string | null
  premiere_date: string | null
  start_date: string | null
  end_date: string | null
  theatre_id: string | null
  status: string | null
  location_type?: string | null
  comment?: string | null
  is_favourite?: boolean | null
}

interface EventRecord {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  location: string | null
  room_id: string | null
  production_id: string | null
  theatre_id: string | null
  event_artists?: { artist_id: string }[]
}

interface Props {
  production: ProductionRecord | null  // null = create mode
  theatres: Theatre[]
  rooms: Room[]
  artists: ArtistRecord[]
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTIONS = ['Koncepcja', 'W produkcji', 'Na afiszu', 'Zawieszony', 'Zdjęty']

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
const labelCls = 'block text-sm font-medium text-gray-500 mb-1.5'

/* ── Event type helpers ────────────────────────────────────────── */
const TYPE_CATEGORY_COLOR: Record<string, string> = {
  'Próby':         'bg-gray-100 text-gray-600',
  'Przygotowania': 'bg-gray-100 text-gray-600',
  'Spektakle':     'bg-gray-100 text-gray-600',
  'Media / PR':    'bg-gray-100 text-gray-600',
  'Organizacyjne': 'bg-gray-100 text-gray-600',
}

function typeCategory(type: string | null): string {
  if (!type) return 'Organizacyjne'
  for (const [cat, types] of Object.entries(EVENT_TYPE_CATEGORIES)) {
    if (types.includes(type)) return cat
  }
  return 'Organizacyjne'
}

function typeBadgeColor(type: string | null) {
  return TYPE_CATEGORY_COLOR[typeCategory(type)] ?? 'bg-gray-100 text-gray-600'
}

function pad(n: number) { return String(n).padStart(2, '0') }

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* ── Component ─────────────────────────────────────────────────── */
export default function ProductionModal({ production, theatres, rooms, artists, onClose, onSaved }: Props) {
  const isEdit = !!production

  const [form, setForm] = useState({
    title:         production?.title         ?? '',
    director:      production?.director      ?? '',
    theatre_id:    production?.theatre_id    ?? '',
    status:        production?.status        ?? 'Koncepcja',
    location_type: production?.location_type ?? 'Na miejscu',
    premiere_date: production?.premiere_date ?? '',
    start_date:    production?.start_date    ?? '',
    end_date:      production?.end_date      ?? '',
    comment:       production?.comment       ?? '',
    is_favourite:  production?.is_favourite  ?? false,
  })
  const [assignedIds, setAssignedIds] = useState<string[]>([])
  const [events,      setEvents]      = useState<EventRecord[]>([])
  const [eventModal,  setEventModal]  = useState<EventRecord | null | undefined>(undefined)
  // undefined = closed, null = create, EventRecord = edit
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Load existing actor assignments in edit mode
  useEffect(() => {
    if (!production) return
    supabase
      .from('artist_productions')
      .select('artist_id')
      .eq('production_id', production.id)
      .then(({ data }) => setAssignedIds((data ?? []).map(r => r.artist_id)))
  }, [production?.id])

  // Load events for this production in edit mode
  useEffect(() => {
    if (!production) return
    loadEvents()
  }, [production?.id])

  async function loadEvents() {
    if (!production) return
    const { data } = await supabase
      .from('events')
      .select('id, title, type, start_time, end_time, location, room_id, production_id, theatre_id, event_artists(artist_id)')
      .eq('production_id', production.id)
      .order('start_time')
    setEvents((data ?? []) as EventRecord[])
  }

  function toggleActor(id: string) {
    setAssignedIds(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      title:         form.title,
      director:      form.director      || null,
      theatre_id:    form.theatre_id    || null,
      status:        form.status        || null,
      location_type: form.location_type || 'Na miejscu',
      premiere_date: form.premiere_date || null,
      start_date:    form.start_date    || null,
      end_date:      form.end_date      || null,
      comment:       form.comment       || null,
      is_favourite:  form.is_favourite,
    }

    let productionId = production?.id ?? null

    if (isEdit && production) {
      const { error: updateErr } = await supabase.from('productions').update(payload).eq('id', production.id)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      productionId = production.id
    } else {
      const { data: newProd, error: insertErr } = await supabase.from('productions').insert(payload).select().single()
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      productionId = newProd?.id ?? null
    }

    // Sync actors
    if (productionId) {
      const pid = productionId
      await supabase.from('artist_productions').delete().eq('production_id', pid)
      if (assignedIds.length > 0) {
        const { error: apErr } = await supabase.from('artist_productions').insert(
          assignedIds.map(artist_id => ({ production_id: pid, artist_id }))
        )
        if (apErr) { setError(apErr.message); setSaving(false); return }
      }
    }

    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!production || !confirm('Usunąć tę produkcję?')) return
    setDeleting(true)
    const pid = production.id
    // Delete child records in order: event_artists → events → artist_productions → production
    const { data: evs } = await supabase.from('events').select('id').eq('production_id', pid)
    if (evs && evs.length > 0) {
      const ids = evs.map((e: { id: string }) => e.id)
      await supabase.from('event_artists').delete().in('event_id', ids)
      await supabase.from('events').delete().eq('production_id', pid)
    }
    await supabase.from('artist_productions').delete().eq('production_id', pid)
    await supabase.from('productions').delete().eq('id', pid)
    setDeleting(false)
    onSaved()
  }

  // Artists with team info for EventModal
  const artistsForEvent = artists.map(a => ({
    id: a.id,
    name: a.name,
    teams: a.teams ?? null,
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edytuj produkcję' : 'Nowa produkcja'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-600 transition-colors text-lg">
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Basic info ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Tytuł *</label>
              <div className="flex gap-2">
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className={inputCls}
                  placeholder="np. Hamlet"
                />
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_favourite: !f.is_favourite }))}
                  title={form.is_favourite ? 'Usuń z ulubionych' : 'Oznacz jako Favourite'}
                  className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border transition-all"
                  style={{
                    border: form.is_favourite ? '1.5px solid #fca5a5' : '1px solid #e5e7eb',
                    background: form.is_favourite ? '#fff1f2' : '#f9fafb',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={form.is_favourite ? '#ef4444' : 'none'} stroke={form.is_favourite ? '#ef4444' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                  </svg>
                </button>
              </div>
              {form.is_favourite && (
                <p className="mt-1.5 text-xs font-medium flex items-center gap-1" style={{ color: '#ef4444' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                  Favourite — tytuł priorytetowy przy planowaniu repertuaru
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Reżyser</label>
              <input
                value={form.director}
                onChange={e => setForm(f => ({ ...f, director: e.target.value }))}
                className={inputCls}
                placeholder="np. Jan Kowalski"
              />
            </div>
            <div>
              <label className={labelCls}>Teatr</label>
              <select
                value={form.theatre_id}
                onChange={e => setForm(f => ({ ...f, theatre_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Wybierz teatr</option>
                {theatres.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className={inputCls}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Typ produkcji</label>
              <div className="flex p-0.5 bg-gray-100 rounded-xl">
                {(['Na miejscu', 'Na wyjeździe'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, location_type: opt }))}
                    className={`flex-1 py-2 text-xs font-semibold rounded-[10px] transition-colors ${
                      form.location_type === opt
                        ? opt === 'Na wyjeździe'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt === 'Na wyjeździe' ? '✈ Na wyjeździe' : 'Na miejscu'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Premiera</label>
              <input
                type="date"
                value={form.premiere_date}
                onChange={e => setForm(f => ({ ...f, premiere_date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Data rozpoczęcia</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Data zakończenia</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {/* ── People ── */}
          {artists.length === 0 ? (
            <p className="text-xs text-gray-500 italic">Brak osób w bazie</p>
          ) : (
            <div className="space-y-5">
              {([
                { key: 'Cast',      label: 'Artyści'  },
                { key: 'Technique', label: 'Technika' },
                { key: 'Wardrobe',  label: 'Garderoba'},
              ] as const).map(({ key, label }) => {
                const group     = artists.filter(a => (Array.isArray(a.teams) ? a.teams[0] : a.teams)?.name === key)
                const noTeam    = key === 'Cast' ? artists.filter(a => !(Array.isArray(a.teams) ? a.teams[0] : a.teams)?.name) : []
                const inGroup   = [...group, ...noTeam]
                const inAssigned  = inGroup.filter(a =>  assignedIds.includes(a.id))
                const inAvailable = inGroup.filter(a => !assignedIds.includes(a.id))
                if (inGroup.length === 0) return null
                return (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <div className="flex flex-col gap-1">
                      {inAssigned.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{a.name}</span>
                            {a.role && <span className="ml-2 text-xs text-gray-500">{a.role}</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleActor(a.id)}
                            className="w-5 h-5 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-red-500 transition-colors text-xs font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {inAvailable.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
                          <div>
                            <span className="text-sm text-gray-500">{a.name}</span>
                            {a.role && <span className="ml-2 text-xs text-gray-500">{a.role}</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleActor(a.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold transition-colors"
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Events (edit mode only) ── */}
          {isEdit && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + ' mb-0'}>Próby i wydarzenia</label>
                <button
                  type="button"
                  onClick={() => setEventModal(null)}
                  className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                >
                  + Dodaj wydarzenie
                </button>
              </div>

              {events.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-2">Brak wydarzeń. Kliknij „Dodaj wydarzenie", aby zaplanować próbę, spektakl lub inne wydarzenie.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {events.map(ev => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setEventModal(ev)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors text-left w-full"
                    >
                      {/* Type badge */}
                      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${typeBadgeColor(ev.type)}`}>
                        {ev.type ?? 'Wydarzenie'}
                      </span>

                      {/* Date + time */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {ev.title !== ev.type ? ev.title : ''}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {fmtDate(ev.start_time)} · {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </p>
                      </div>

                      {/* Participant count */}
                      {(ev.event_artists?.length ?? 0) > 0 && (
                        <span className="shrink-0 text-[11px] text-gray-500">
                          {ev.event_artists!.length} os.
                        </span>
                      )}

                      <span className="text-gray-500 text-xs shrink-0">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Comment ── */}
          <div>
            <label className={labelCls}>Komentarz / notatki</label>
            <textarea
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              rows={3}
              className={inputCls + ' resize-none'}
              placeholder="Dodatkowe informacje o produkcji..."
            />
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-red-500 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Usuwanie...' : 'Usuń produkcję'}
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
                disabled={saving}
                className="px-5 py-2 text-sm font-medium text-white bg-gray-900 rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Nested EventModal (z-60) ── */}
      {eventModal !== undefined && production && (
        <EventModal
          event={eventModal}
          defaultProductionId={production.id}
          artists={artistsForEvent}
          productions={[{ id: production.id, title: production.title ?? '' }]}
          theatres={theatres}
          rooms={rooms}
          zIndex={60}
          onClose={() => setEventModal(undefined)}
          onSaved={() => { setEventModal(undefined); loadEvents() }}
        />
      )}
    </div>
  )
}
