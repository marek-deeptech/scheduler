'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import { Production, Event, Artist } from '@/types'

export default function SchedulePage() {
  const { t } = useLanguage()
  const [productions, setProductions] = useState<Production[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [selectedProduction, setSelectedProduction] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [showProductionForm, setShowProductionForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [productionForm, setProductionForm] = useState({ title: '', start_date: '', end_date: '' })
  const [eventForm, setEventForm] = useState({ title: '', start_time: '', end_time: '', location: '', artist_ids: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({})

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: prodData }, { data: artistData }] = await Promise.all([
      supabase.from('productions').select('*').order('start_date'),
      supabase.from('artists').select('*, teams(*)').order('name'),
    ])
    setProductions(prodData ?? [])
    setArtists(artistData ?? [])
    if (prodData && prodData.length > 0) {
      const firstId = prodData[0].id
      setSelectedProduction(firstId)
      await fetchEvents(firstId)
    }
    setLoading(false)
  }

  async function fetchEvents(productionId: string) {
    const { data } = await supabase
      .from('events')
      .select('*, event_artists(artist_id, artists(id, name, teams(*)))')
      .eq('production_id', productionId)
      .order('start_time')
    setEvents(data ?? [])
    detectConflicts(data ?? [])
  }

  function detectConflicts(eventList: Event[]) {
    const newConflicts: Record<string, string[]> = {}
    for (let i = 0; i < eventList.length; i++) {
      for (let j = i + 1; j < eventList.length; j++) {
        const a = eventList[i]
        const b = eventList[j]
        const aStart = new Date(a.start_time)
        const aEnd = new Date(a.end_time)
        const bStart = new Date(b.start_time)
        const bEnd = new Date(b.end_time)
        const overlap = aStart < bEnd && bStart < aEnd
        if (!overlap) continue
        const aArtists = (a.event_artists ?? []).map((ea: any) => ea.artist_id)
        const bArtists = (b.event_artists ?? []).map((ea: any) => ea.artist_id)
        const shared = aArtists.filter((id: string) => bArtists.includes(id))
        if (shared.length > 0) {
          newConflicts[a.id] = [...(newConflicts[a.id] ?? []), b.id]
          newConflicts[b.id] = [...(newConflicts[b.id] ?? []), a.id]
        }
      }
    }
    setConflicts(newConflicts)
  }

  async function handleSelectProduction(id: string) {
    setSelectedProduction(id)
    setShowEventForm(false)
    await fetchEvents(id)
  }

  async function handleAddProduction(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data } = await supabase.from('productions').insert({
      title: productionForm.title,
      start_date: productionForm.start_date || null,
      end_date: productionForm.end_date || null,
    }).select().single()
    setProductionForm({ title: '', start_date: '', end_date: '' })
    setShowProductionForm(false)
    setSaving(false)
    await fetchAll()
    if (data) {
      setSelectedProduction(data.id)
      await fetchEvents(data.id)
    }
  }

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProduction) return
    setSaving(true)
    const { data: newEvent } = await supabase.from('events').insert({
      production_id: selectedProduction,
      title: eventForm.title,
      start_time: eventForm.start_time,
      end_time: eventForm.end_time,
      location: eventForm.location || null,
    }).select().single()

    if (newEvent && eventForm.artist_ids.length > 0) {
      await supabase.from('event_artists').insert(
        eventForm.artist_ids.map((artist_id) => ({ event_id: newEvent.id, artist_id }))
      )
    }

    setEventForm({ title: '', start_time: '', end_time: '', location: '', artist_ids: [] })
    setShowEventForm(false)
    setSaving(false)
    await fetchEvents(selectedProduction)
  }

  async function handleDeleteEvent(id: string) {
    if (!confirm(t.schedule.confirmDelete)) return
    await supabase.from('events').delete().eq('id', id)
    if (selectedProduction) await fetchEvents(selectedProduction)
  }

  function toggleArtist(id: string) {
    setEventForm((prev) => ({
      ...prev,
      artist_ids: prev.artist_ids.includes(id)
        ? prev.artist_ids.filter((a) => a !== id)
        : [...prev.artist_ids, id],
    }))
  }

  const teamColor: Record<string, string> = {
    Cast:      'bg-gray-100 text-gray-700',
    Technique: 'bg-gray-100 text-gray-700',
    Wardrobe:  'bg-gray-100 text-gray-700',
  }

  const currentProduction = productions.find((p) => p.id === selectedProduction)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{t.schedule.title}</h2>
        <button
          onClick={() => setShowProductionForm(!showProductionForm)}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          {showProductionForm ? t.schedule.cancel : `+ ${t.schedule.newProduction}`}
        </button>
      </div>

      {showProductionForm && (
        <form onSubmit={handleAddProduction} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 space-y-4">
          <h3 className="font-semibold text-gray-900">{t.schedule.newProductionTitle}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.schedule.productionTitle} *</label>
              <input
                required
                value={productionForm.title}
                onChange={(e) => setProductionForm({ ...productionForm, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder={t.schedule.productionTitlePlaceholder}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.schedule.startDate}</label>
              <input
                type="date"
                value={productionForm.start_date}
                onChange={(e) => setProductionForm({ ...productionForm, start_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.schedule.endDate}</label>
              <input
                type="date"
                value={productionForm.end_date}
                onChange={(e) => setProductionForm({ ...productionForm, end_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? t.schedule.saving : t.schedule.createProduction}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">{t.schedule.loading}</p>
      ) : productions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">{t.schedule.noProductions}</p>
          <p className="text-sm mt-1">{t.schedule.noProductionsHint}</p>
        </div>
      ) : (
        <div className="flex gap-6">
          <div className="w-48 shrink-0 space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t.schedule.productions}</p>
            {productions.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectProduction(p.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedProduction === p.id ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {p.title}
              </button>
            ))}
          </div>

          <div className="flex-1">
            {currentProduction && (
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{currentProduction.title}</h3>
                  {currentProduction.start_date && (
                    <p className="text-sm text-gray-500">
                      {new Date(currentProduction.start_date).toLocaleDateString()} — {currentProduction.end_date ? new Date(currentProduction.end_date).toLocaleDateString() : '?'}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowEventForm(!showEventForm)}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {showEventForm ? t.schedule.cancel : `+ ${t.schedule.addEvent}`}
                </button>
              </div>
            )}

            {showEventForm && (
              <form onSubmit={handleAddEvent} className="bg-white border border-gray-200 rounded-xl p-5 mb-4 space-y-4">
                <h3 className="font-semibold text-gray-900">{t.schedule.newEvent}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.schedule.eventTitle} *</label>
                    <input
                      required
                      value={eventForm.title}
                      onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder={t.schedule.eventTitlePlaceholder}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.schedule.start} *</label>
                    <input
                      required
                      type="datetime-local"
                      value={eventForm.start_time}
                      onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.schedule.end} *</label>
                    <input
                      required
                      type="datetime-local"
                      value={eventForm.end_time}
                      onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.schedule.location}</label>
                    <input
                      value={eventForm.location}
                      onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder={t.schedule.locationPlaceholder}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t.schedule.assignArtists}</label>
                  <div className="flex flex-wrap gap-2">
                    {artists.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleArtist(a.id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          eventForm.artist_ids.includes(a.id)
                            ? 'bg-black text-white border-black'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {a.name}
                        {a.teams && <span className="ml-1 opacity-60">· {a.teams.name}</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {saving ? t.schedule.saving : t.schedule.saveEvent}
                </button>
              </form>
            )}

            {events.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-white border border-gray-200 rounded-xl">
                <p>{t.schedule.noEvents}</p>
                <p className="text-sm mt-1">{t.schedule.noEventsHint}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((event) => {
                  const hasConflict = !!conflicts[event.id]
                  return (
                    <div
                      key={event.id}
                      className={`bg-white border rounded-xl p-4 ${hasConflict ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-900">{event.title}</h4>
                            {hasConflict && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">
                                {t.schedule.conflict}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {new Date(event.start_time).toLocaleString()} — {new Date(event.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {event.location && <span className="ml-2">· {event.location}</span>}
                          </p>
                          {event.event_artists && event.event_artists.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {event.event_artists.map((ea: any) => (
                                <span
                                  key={ea.artist_id}
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${ea.artists?.teams ? teamColor[ea.artists.teams.name] ?? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-600'}`}
                                >
                                  {ea.artists?.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="text-gray-500 hover:text-red-500 text-xs ml-4 transition-colors"
                        >
                          {t.schedule.deleteEvent}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
