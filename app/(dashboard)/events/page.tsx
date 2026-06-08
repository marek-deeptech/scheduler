'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

interface EventRow {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  location: string | null
  rooms: { name: string } | null
  event_artists: { artists: { id: string; name: string } | null }[]
}

interface EventType {
  id: string
  name: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

// Colour map for known types — DB types get assigned colours by name
const TYPE_COLOURS: Record<string, { bg: string; color: string; border: string }> = {
  'Sesja':               { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  'Próba chóru':         { bg: '#f2ede6', color: '#5a524a', border: '#e4ddd4' },
  'Wynajem przestrzeni': { bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4' },
  'Konferencja':         { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' },
  'Urodziny':            { bg: '#fdf2f8', color: '#9d174d', border: '#fbcfe8' },
  'Inne':                { bg: '#f9fafb', color: '#4b5563', border: '#e5e7eb' },
  // legacy production event types kept for any cross-over data
  'Spektakl':            { bg: '#fdf0f2', color: '#9e0c24', border: '#f5c6cd' },
  'Premiera':            { bg: '#fdf0f2', color: '#9e0c24', border: '#f5c6cd' },
  'Próba':               { bg: '#f2ede6', color: '#5a524a', border: '#e4ddd4' },
  'Przymiarki':          { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
}

// Palette cycle for unknown types
const EXTRA_PALETTES = [
  { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  { bg: '#fefce8', color: '#a16207', border: '#fef08a' },
  { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
  { bg: '#f7fee7', color: '#3f6212', border: '#d9f99d' },
]

function eventTypePill(type: string | null, extraIndex = 0) {
  if (!type) return { bg: '#f2ede6', color: '#7a7068', border: '#e4ddd4' }
  // exact match first
  if (TYPE_COLOURS[type]) return TYPE_COLOURS[type]
  // prefix match (e.g. "Próba generalna" → Próba)
  const prefix = Object.keys(TYPE_COLOURS).find(k => type.startsWith(k))
  if (prefix) return TYPE_COLOURS[prefix]
  // unknown type — cycle through extra palette
  return EXTRA_PALETTES[extraIndex % EXTRA_PALETTES.length]
}

// ── component ─────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events,     setEvents]     = useState<EventRow[]>([])
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [loading,    setLoading]    = useState(true)
  const [period,     setPeriod]     = useState<'upcoming' | 'all' | 'past'>('upcoming')
  const [typeFilter, setTypeFilter] = useState('Wszystkie')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: evData }, { data: typesData }] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, type, start_time, end_time, location, rooms(name), event_artists(artists(id, name))')
        .is('production_id', null)
        .order('start_time', { ascending: true }),
      supabase
        .from('event_types')
        .select('id, name')
        .order('name'),
    ])
    setEvents((evData ?? []) as any[])
    setEventTypes(typesData ?? [])
    setLoading(false)
  }

  const now = new Date()

  // All filter options: "Wszystkie" + DB types
  const filterOptions = useMemo(() => ['Wszystkie', ...eventTypes.map(t => t.name)], [eventTypes])

  const filtered = useMemo(() => {
    let list = events

    if (period === 'upcoming') list = list.filter(e => new Date(e.end_time) >= now)
    if (period === 'past')     list = list.filter(e => new Date(e.end_time) < now)

    if (typeFilter !== 'Wszystkie') {
      list = list.filter(e => e.type === typeFilter)
    }

    return list
  }, [events, period, typeFilter, now.toDateString()])

  // Map type name → extra palette index for consistent colouring of unknown types
  const extraIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    for (const t of eventTypes) {
      if (!TYPE_COLOURS[t.name] && !Object.keys(TYPE_COLOURS).some(k => t.name.startsWith(k))) {
        map.set(t.name, idx++)
      }
    }
    return map
  }, [eventTypes])

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of filtered) {
      const key = dayKey(e.start_time)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div className="-m-8 flex flex-col min-h-full">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-8 py-5 bg-white shrink-0" style={{ borderBottom: '1px solid #e4ddd4' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
              Wydarzenia
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>
              Zdarzenia niepowiązane z żadnym tytułem
            </p>
          </div>

          {/* Period toggle */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: '#f2ede6' }}>
            {(['upcoming', 'all', 'past'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                style={period === p
                  ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                  : { color: '#7a7068' }}
              >
                {p === 'upcoming' ? 'Nadchodzące' : p === 'all' ? 'Wszystkie' : 'Archiwalne'}
              </button>
            ))}
          </div>
        </div>

        {/* Type filter chips — loaded from DB */}
        <div className="flex flex-wrap gap-2 mt-4">
          {filterOptions.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className="px-3 py-1 text-xs font-medium rounded-full border transition-all"
              style={typeFilter === t
                ? { background: '#1a1410', color: '#fff', borderColor: '#1a1410' }
                : { background: '#faf8f5', color: '#7a7068', borderColor: '#e4ddd4' }}
            >
              {t}
            </button>
          ))}
          {!loading && eventTypes.length === 0 && (
            <span className="text-xs italic" style={{ color: '#a89e92' }}>
              Dodaj typy w Ustawienia → Typy Wydarzeń
            </span>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6" style={{ background: '#f2ede6' }}>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#a89e92' }}>
            Ładowanie wydarzeń…
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#e4ddd4' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a7068" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: '#5a524a' }}>
                {period === 'upcoming' ? 'Brak nadchodzących wydarzeń' : period === 'past' ? 'Brak archiwalnych wydarzeń' : 'Brak wydarzeń'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#a89e92' }}>
                Dodaj wydarzenie nieprzypisane do żadnego tytułu
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8 max-w-3xl">
            {grouped.map(([dateKey, dayEvents]) => (
              <div key={dateKey}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: '#7a7068' }}>
                    {formatDate(dayEvents[0].start_time)}
                  </p>
                  <div className="flex-1 h-px" style={{ background: '#e4ddd4' }} />
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#e4ddd4', color: '#7a7068' }}>
                    {dayEvents.length}
                  </span>
                </div>

                {/* Events for this day */}
                <div className="space-y-2">
                  {dayEvents.map(ev => {
                    const extraIdx = extraIndexMap.get(ev.type ?? '') ?? 0
                    const pill = eventTypePill(ev.type, extraIdx)
                    const actors = (ev.event_artists ?? [])
                      .map((ea: any) => ea.artists?.name)
                      .filter(Boolean) as string[]
                    const room = ev.rooms?.name ?? ev.location ?? null
                    const isPast = new Date(ev.end_time) < now

                    return (
                      <div
                        key={ev.id}
                        className="rounded-2xl overflow-hidden transition-shadow hover:shadow-md"
                        style={{
                          background: '#fff',
                          border: '1px solid #e4ddd4',
                          opacity: isPast ? 0.65 : 1,
                        }}
                      >
                        <div className="flex items-start gap-4 px-5 py-4">
                          {/* Time column */}
                          <div className="shrink-0 text-right w-16">
                            <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>
                              {formatTime(ev.start_time)}
                            </p>
                            <p className="text-[11px]" style={{ color: '#a89e92' }}>
                              {formatTime(ev.end_time)}
                            </p>
                          </div>

                          {/* Divider */}
                          <div className="w-px self-stretch" style={{ background: '#f2ede6' }} />

                          {/* Main info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: '#1a1410' }}>
                                  {ev.title || '(bez tytułu)'}
                                </p>
                                {room && (
                                  <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#7a7068' }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/>
                                      <path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
                                    </svg>
                                    {room}
                                  </p>
                                )}
                              </div>

                              {/* Type badge */}
                              {ev.type && (
                                <span
                                  className="shrink-0 text-[11px] font-medium px-2.5 py-0.5 rounded-full border"
                                  style={{ background: pill.bg, color: pill.color, borderColor: pill.border }}
                                >
                                  {ev.type}
                                </span>
                              )}
                            </div>

                            {/* Actors */}
                            {actors.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {actors.map(name => (
                                  <span
                                    key={name}
                                    className="text-[11px] px-2 py-0.5 rounded-lg"
                                    style={{ background: '#f2ede6', color: '#5a524a' }}
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
