'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { sortByLastName, sortNamesByLastName } from '@/lib/names'

// ── SQL migration (run once in Supabase SQL Editor) ───────────────────────────
// ALTER TABLE events ADD COLUMN IF NOT EXISTS description text;
// ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url text;
// INSERT INTO storage.buckets (id, name, public) VALUES ('event-images', 'event-images', true)
//   ON CONFLICT DO NOTHING;
// CREATE POLICY "Public read event-images" ON storage.objects FOR SELECT USING (bucket_id = 'event-images');
// CREATE POLICY "Auth upload event-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'event-images');
// CREATE POLICY "Auth update event-images" ON storage.objects FOR UPDATE USING (bucket_id = 'event-images');

interface EventRow {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  location: string | null
  description: string | null
  image_url: string | null
  room_id: string | null
  rooms: { id: string; name: string } | null
  event_artists: { artists: { id: string; name: string } | null }[]
}

interface EventType { id: string; name: string }
interface Room      { id: string; name: string; theatre_id: string }
interface Artist    { id: string; name: string }

// ── colour helpers ────────────────────────────────────────────────────────────

const TYPE_COLOURS: Record<string, { bg: string; color: string; border: string; dot: string }> = {
  'Sesja':               { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6' },
  'Próba chóru':         { bg: '#f2ede6', color: '#5a524a', border: '#e4ddd4', dot: '#a89e92' },
  'Wynajem przestrzeni': { bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4', dot: '#14b8a6' },
  'Konferencja':         { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', dot: '#a855f7' },
  'Urodziny':            { bg: '#fdf2f8', color: '#9d174d', border: '#fbcfe8', dot: '#ec4899' },
  'Inne':                { bg: '#f9fafb', color: '#4b5563', border: '#e5e7eb', dot: '#9ca3af' },
  'Spektakl':            { bg: '#fdf0f2', color: '#9e0c24', border: '#f5c6cd', dot: '#c8102e' },
  'Premiera':            { bg: '#fdf0f2', color: '#9e0c24', border: '#f5c6cd', dot: '#c8102e' },
  'Próba':               { bg: '#f2ede6', color: '#5a524a', border: '#e4ddd4', dot: '#a89e92' },
  'Przymiarki':          { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', dot: '#22c55e' },
}
const EXTRA_PALETTES = [
  { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', dot: '#f97316' },
  { bg: '#fefce8', color: '#a16207', border: '#fef08a', dot: '#eab308' },
  { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd', dot: '#0ea5e9' },
  { bg: '#f7fee7', color: '#3f6212', border: '#d9f99d', dot: '#84cc16' },
]
function typeStyle(type: string | null, extraIndex = 0) {
  if (!type) return { bg: '#f2ede6', color: '#7a7068', border: '#e4ddd4', dot: '#cec5b8' }
  if (TYPE_COLOURS[type]) return TYPE_COLOURS[type]
  const prefix = Object.keys(TYPE_COLOURS).find(k => type.startsWith(k))
  if (prefix) return TYPE_COLOURS[prefix]
  return EXTRA_PALETTES[extraIndex % EXTRA_PALETTES.length]
}

// ── date helpers ──────────────────────────────────────────────────────────────

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                   'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
const DAYS_SHORT = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd']

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function dayKey(iso: string) { return iso.slice(0, 10) }
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}
function formatDayLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function toLocalDT(iso: string) {
  // "2025-06-15T18:00:00+00:00" → "2025-06-15T18:00" (for datetime-local input)
  if (!iso) return ''
  return iso.slice(0, 16)
}
function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const start = (first.getDay() + 6) % 7
  const days: (Date | null)[] = Array(start).fill(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ ev, extraIdx, now, onEdit }: {
  ev: EventRow; extraIdx: number; now: Date; onEdit: (ev: EventRow) => void
}) {
  const style  = typeStyle(ev.type, extraIdx)
  const actors = sortNamesByLastName(
    (ev.event_artists ?? []).map((ea: any) => ea.artists?.name).filter(Boolean) as string[]
  )
  const room   = ev.rooms?.name ?? ev.location ?? null
  const isPast = new Date(ev.end_time) < now

  return (
    <div className="rounded-2xl overflow-hidden transition-shadow hover:shadow-md group"
      style={{ background: '#fff', border: '1px solid #e4ddd4', opacity: isPast ? 0.6 : 1 }}>
      {/* Cover image */}
      {ev.image_url && (
        <div style={{ height: 140, overflow: 'hidden', position: 'relative' }}>
          <img src={ev.image_url} alt={ev.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.4))' }} />
        </div>
      )}
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="shrink-0 text-right w-16">
          <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>{formatTime(ev.start_time)}</p>
          <p className="text-[11px]" style={{ color: '#a89e92' }}>{formatTime(ev.end_time)}</p>
        </div>
        <div className="w-px self-stretch" style={{ background: '#f2ede6' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate" style={{ color: '#1a1410' }}>
                {ev.title || '(bez tytułu)'}
              </p>
              {room && (
                <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#7a7068' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
                  </svg>
                  {room}
                </p>
              )}
              {ev.description && (
                <p className="text-xs mt-1.5 line-clamp-2" style={{ color: '#7a7068' }}>{ev.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {ev.type && (
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border"
                  style={{ background: style.bg, color: style.color, borderColor: style.border }}>
                  {ev.type}
                </span>
              )}
              <button
                onClick={() => onEdit(ev)}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ background: '#f2ede6', color: '#7a7068', border: '1px solid #e4ddd4' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#e4ddd4')}
                onMouseLeave={e => (e.currentTarget.style.background = '#f2ede6')}
                title="Edytuj wydarzenie"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          </div>
          {actors.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {actors.map(name => (
                <span key={name} className="text-[11px] px-2 py-0.5 rounded-lg"
                  style={{ background: '#f2ede6', color: '#5a524a' }}>{name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── EditModal ─────────────────────────────────────────────────────────────────

function EditModal({ ev, eventTypes, rooms, artists, onClose, onSaved }: {
  ev: EventRow
  eventTypes: EventType[]
  rooms: Room[]
  artists: Artist[]
  onClose: () => void
  onSaved: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving]       = useState(false)
  const [msg,    setMsg]          = useState('')
  const [preview, setPreview]     = useState(ev.image_url || '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeImg, setRemoveImg] = useState(false)

  // Selected artist IDs
  const initArtistIds = (ev.event_artists ?? []).map((ea: any) => ea.artists?.id).filter(Boolean) as string[]
  const [selectedArtists, setSelectedArtists] = useState<string[]>(initArtistIds)

  const [form, setForm] = useState({
    title:       ev.title,
    type:        ev.type || '',
    start_time:  toLocalDT(ev.start_time),
    end_time:    toLocalDT(ev.end_time),
    location:    ev.location || '',
    room_id:     ev.room_id || '',
    description: ev.description || '',
  })

  function toggleArtist(id: string) {
    setSelectedArtists(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
    setRemoveImg(false)
  }

  async function handleSave() {
    if (!form.title.trim()) { setMsg('Tytuł jest wymagany'); return }
    if (!form.start_time || !form.end_time) { setMsg('Podaj czas rozpoczęcia i zakończenia'); return }
    setSaving(true); setMsg('')

    try {
      let image_url: string | null = ev.image_url

      // Upload new image
      if (imageFile) {
        const ext  = imageFile.name.split('.').pop()
        const path = `events/${ev.id}-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('event-images').upload(path, imageFile, { upsert: true })
        if (upErr) throw new Error('Upload zdjęcia: ' + upErr.message)
        const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(path)
        image_url = urlData.publicUrl
      } else if (removeImg) {
        image_url = null
      }

      // Update event
      const { error: updErr } = await supabase.from('events').update({
        title:       form.title.trim(),
        type:        form.type || null,
        start_time:  new Date(form.start_time).toISOString(),
        end_time:    new Date(form.end_time).toISOString(),
        location:    form.location.trim() || null,
        room_id:     form.room_id || null,
        description: form.description.trim() || null,
        image_url,
      }).eq('id', ev.id)
      if (updErr) throw new Error(updErr.message)

      // Sync event_artists: delete old, insert new
      await supabase.from('event_artists').delete().eq('event_id', ev.id)
      if (selectedArtists.length > 0) {
        const { error: artErr } = await supabase.from('event_artists').insert(
          selectedArtists.map(artist_id => ({ event_id: ev.id, artist_id }))
        )
        if (artErr) throw new Error(artErr.message)
      }

      onSaved()
    } catch (err: any) {
      setMsg('Błąd: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e4ddd4',
    fontSize: 13, color: '#1a1410', background: '#fff', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#7a7068',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', zIndex: 9999 }}
      onClick={onClose}>
      <div style={{ background: '#faf8f5', height: '100%', width: 'min(560px, 100vw)', overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4ddd4', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 1 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.1rem', fontWeight: 700, color: '#1a1410', margin: 0 }}>
              Edytuj wydarzenie
            </h2>
            <p style={{ fontSize: 12, color: '#a89e92', margin: '2px 0 0' }}>{ev.title}</p>
          </div>
          <button onClick={onClose} style={{ background: '#f2ede6', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7a7068', fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>

          {/* Zdjęcie */}
          <div>
            <label style={labelStyle}>Zdjęcie / plakat</label>
            <div style={{ border: '1px solid #e4ddd4', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              {preview && !removeImg ? (
                <div style={{ position: 'relative' }}>
                  <img src={preview} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                  <button
                    onClick={() => { setRemoveImg(true); setPreview(''); setImageFile(null) }}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
                    Usuń
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
                    Zmień
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ width: '100%', padding: '28px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cec5b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                  </svg>
                  <span style={{ fontSize: 12, color: '#a89e92' }}>Kliknij, aby dodać zdjęcie</span>
                  <span style={{ fontSize: 11, color: '#cec5b8' }}>JPG, PNG, WEBP — maks. 5 MB</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickImage} />
          </div>

          {/* Tytuł */}
          <div>
            <label style={labelStyle}>Tytuł *</label>
            <input style={inputStyle} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              onFocus={e => (e.target.style.borderColor = '#1a1410')} onBlur={e => (e.target.style.borderColor = '#e4ddd4')} />
          </div>

          {/* Typ */}
          <div>
            <label style={labelStyle}>Typ</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="">— bez typu —</option>
              {eventTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          {/* Czas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Rozpoczęcie *</label>
              <input type="datetime-local" style={inputStyle} value={form.start_time}
                onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                onFocus={e => (e.target.style.borderColor = '#1a1410')} onBlur={e => (e.target.style.borderColor = '#e4ddd4')} />
            </div>
            <div>
              <label style={labelStyle}>Zakończenie *</label>
              <input type="datetime-local" style={inputStyle} value={form.end_time}
                onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                onFocus={e => (e.target.style.borderColor = '#1a1410')} onBlur={e => (e.target.style.borderColor = '#e4ddd4')} />
            </div>
          </div>

          {/* Sala */}
          <div>
            <label style={labelStyle}>Sala</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.room_id} onChange={e => setForm(p => ({ ...p, room_id: e.target.value }))}>
              <option value="">— bez sali —</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Lokalizacja */}
          <div>
            <label style={labelStyle}>Lokalizacja / adres</label>
            <input style={inputStyle} placeholder="np. Teatr Polonia, Chocimska 28" value={form.location}
              onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
              onFocus={e => (e.target.style.borderColor = '#1a1410')} onBlur={e => (e.target.style.borderColor = '#e4ddd4')} />
          </div>

          {/* Opis */}
          <div>
            <label style={labelStyle}>Opis / notatki</label>
            <textarea rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              placeholder="Dodatkowe informacje o wydarzeniu…"
              value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              onFocus={e => (e.target.style.borderColor = '#1a1410')} onBlur={e => (e.target.style.borderColor = '#e4ddd4')} />
          </div>

          {/* Artyści */}
          <div>
            <label style={labelStyle}>Artyści ({selectedArtists.length} wybranych)</label>
            <div style={{ border: '1px solid #e4ddd4', borderRadius: 8, background: '#fff', maxHeight: 200, overflowY: 'auto' }}>
              {artists.length === 0 ? (
                <p style={{ padding: '12px 14px', fontSize: 12, color: '#a89e92' }}>Brak artystów</p>
              ) : (
                artists.map((a, i) => {
                  const checked = selectedArtists.includes(a.id)
                  return (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', borderTop: i > 0 ? '1px solid #f2ede6' : 'none', background: checked ? '#faf5f0' : 'transparent' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleArtist(a.id)}
                        style={{ accentColor: '#1a1410', width: 14, height: 14, cursor: 'pointer' }} />
                      <span style={{ fontSize: 13, color: '#1a1410' }}>{a.name}</span>
                    </label>
                  )
                })
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e4ddd4', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, position: 'sticky', bottom: 0 }}>
          {msg
            ? <span style={{ fontSize: 12, color: msg.startsWith('Błąd') ? '#c8102e' : '#166534', flex: 1 }}>{msg}</span>
            : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving}
              style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e4ddd4', background: '#fff', color: '#5a524a', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
              Anuluj
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1a1410', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Zapisuję…' : 'Zapisz zmiany'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events,      setEvents]      = useState<EventRow[]>([])
  const [eventTypes,  setEventTypes]  = useState<EventType[]>([])
  const [rooms,       setRooms]       = useState<Room[]>([])
  const [artists,     setArtists]     = useState<Artist[]>([])
  const [loading,     setLoading]     = useState(true)
  const [view,        setView]        = useState<'list' | 'calendar'>('calendar')
  const [period,      setPeriod]      = useState<'upcoming' | 'all' | 'past'>('upcoming')
  const [typeFilter,  setTypeFilter]  = useState('Wszystkie')
  const [calMonth,    setCalMonth]    = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: evData },
      { data: typesData },
      { data: roomsData },
      { data: artistsData },
    ] = await Promise.all([
      supabase.from('events')
        .select('id, title, type, start_time, end_time, location, description, image_url, room_id, rooms(id, name), event_artists(artists(id, name))')
        .is('production_id', null)
        .order('start_time', { ascending: true }),
      supabase.from('event_types').select('id, name').order('name'),
      supabase.from('rooms').select('id, name, theatre_id').order('name'),
      supabase.from('artists').select('id, name').order('name'),
    ])
    setEvents((evData ?? []) as any[])
    setEventTypes(typesData ?? [])
    setRooms(roomsData ?? [])
    setArtists(sortByLastName(artistsData ?? []))
    setLoading(false)
  }

  const now      = new Date()
  const todayStr = localDate(now)

  const extraIndexMap = useMemo(() => {
    const map = new Map<string, number>(); let idx = 0
    for (const t of eventTypes)
      if (!TYPE_COLOURS[t.name] && !Object.keys(TYPE_COLOURS).some(k => t.name.startsWith(k)))
        map.set(t.name, idx++)
    return map
  }, [eventTypes])

  const filterOptions = useMemo(() => ['Wszystkie', ...eventTypes.map(t => t.name)], [eventTypes])

  const typeFiltered = useMemo(() => {
    if (typeFilter === 'Wszystkie') return events
    return events.filter(e => e.type === typeFilter)
  }, [events, typeFilter])

  const listFiltered = useMemo(() => {
    let list = typeFiltered
    if (period === 'upcoming') list = list.filter(e => new Date(e.end_time) >= now)
    if (period === 'past')     list = list.filter(e => new Date(e.end_time) < now)
    return list
  }, [typeFiltered, period])

  const listGrouped = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of listFiltered) {
      const k = dayKey(e.start_time)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [listFiltered])

  const calYear  = calMonth.getFullYear()
  const calMon   = calMonth.getMonth()
  const grid     = useMemo(() => buildGrid(calYear, calMon), [calYear, calMon])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of typeFiltered) {
      const k = dayKey(e.start_time)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return map
  }, [typeFiltered])

  const calListEvents = useMemo(() => {
    if (selectedDay) return eventsByDay.get(selectedDay) ?? []
    const prefix = `${String(calYear)}-${String(calMon + 1).padStart(2, '0')}`
    const result: EventRow[] = []
    for (const [k, evs] of eventsByDay) if (k.startsWith(prefix)) result.push(...evs)
    return result.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }, [eventsByDay, selectedDay, calYear, calMon])

  function prevMonth() { setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelectedDay(null) }
  function nextMonth() { setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelectedDay(null) }
  function goToday()   { setCalMonth(new Date()); setSelectedDay(todayStr) }

  return (
    <div className="-m-4 md:-m-8 flex flex-col min-h-full">

      {/* Header */}
      <div className="px-4 md:px-8 py-4 md:py-5 bg-white shrink-0" style={{ borderBottom: '1px solid #e4ddd4' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
              Wydarzenia
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Zdarzenia niepowiązane z żadnym tytułem</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: '#f2ede6' }}>
              {([['calendar','Kalendarz'],['list','Lista']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setView(v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                  style={view === v
                    ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                    : { color: '#7a7068' }}>
                  {v === 'calendar'
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                  }
                  {label}
                </button>
              ))}
            </div>
            {view === 'list' && (
              <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: '#f2ede6' }}>
                {(['upcoming','all','past'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                    style={period === p
                      ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                      : { color: '#7a7068' }}>
                    {p === 'upcoming' ? 'Nadchodzące' : p === 'all' ? 'Wszystkie' : 'Archiwalne'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {filterOptions.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-3 py-1 text-xs font-medium rounded-full border transition-all"
              style={typeFilter === t
                ? { background: '#1a1410', color: '#fff', borderColor: '#1a1410' }
                : { background: '#faf8f5', color: '#7a7068', borderColor: '#e4ddd4' }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#f2ede6' }}>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#a89e92' }}>Ładowanie wydarzeń…</div>

        ) : view === 'calendar' ? (
          <div className="px-4 md:px-8 py-4 md:py-6 space-y-5 max-w-3xl">
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e4ddd4' }}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f2ede6' }}>
                <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-gray-100" style={{ color: '#7a7068' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div className="flex items-center gap-3">
                  <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.1rem', fontWeight: 700, color: '#1a1410' }}>{MONTHS_PL[calMon]}</h2>
                  <span className="text-sm font-medium" style={{ color: '#a89e92' }}>{calYear}</span>
                  <button onClick={goToday} className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                    style={{ background: '#f2ede6', color: '#7a7068', border: '1px solid #e4ddd4' }}
                    onMouseOver={e => (e.currentTarget.style.background = '#e4ddd4')} onMouseOut={e => (e.currentTarget.style.background = '#f2ede6')}>
                    Dziś
                  </button>
                </div>
                <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-gray-100" style={{ color: '#7a7068' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
              <div className="grid grid-cols-7 px-3 pt-3 pb-1">
                {DAYS_SHORT.map(d => (
                  <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: d === 'Sb' || d === 'Nd' ? '#cec5b8' : '#a89e92' }}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px px-3 pb-4">
                {grid.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} />
                  const dStr   = localDate(day)
                  const dayEvs = (eventsByDay.get(dStr) ?? [])
                  const isToday = dStr === todayStr
                  const isSel   = dStr === selectedDay
                  const isSbSn  = day.getDay() === 0 || day.getDay() === 6
                  return (
                    <button key={dStr} onClick={() => setSelectedDay(prev => prev === dStr ? null : dStr)}
                      className="flex flex-col items-center py-1.5 rounded-xl transition-all"
                      style={{ background: isSel ? '#1a1410' : isToday ? '#f2ede6' : 'transparent', border: isToday && !isSel ? '1px solid #e4ddd4' : '1px solid transparent' }}
                      onMouseOver={e => { if (!isSel) e.currentTarget.style.background = '#f8f5f1' }}
                      onMouseOut={e => { e.currentTarget.style.background = isSel ? '#1a1410' : isToday ? '#f2ede6' : 'transparent' }}>
                      <span className="text-sm font-medium w-7 h-7 flex items-center justify-center rounded-lg"
                        style={{ color: isSel ? '#fff' : isToday ? '#1a1410' : isSbSn ? '#cec5b8' : '#3e3830' }}>
                        {day.getDate()}
                      </span>
                      {dayEvs.length > 0 && (
                        <div className="flex gap-0.5 mt-1 h-1.5">
                          {dayEvs.slice(0, 3).map((e, di) => {
                            const s = typeStyle(e.type, extraIndexMap.get(e.type ?? '') ?? 0)
                            return <span key={di} className="w-1.5 h-1.5 rounded-full" style={{ background: isSel ? 'rgba(255,255,255,0.7)' : s.dot }} />
                          })}
                          {dayEvs.length > 3 && <span className="text-[8px] leading-none" style={{ color: isSel ? 'rgba(255,255,255,0.7)' : '#a89e92' }}>+</span>}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              {(() => {
                const prefix = `${calYear}-${String(calMon + 1).padStart(2, '0')}`
                const total  = [...eventsByDay.entries()].filter(([k]) => k.startsWith(prefix)).reduce((s, [, v]) => s + v.length, 0)
                return total > 0 ? (
                  <div className="px-5 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid #f2ede6' }}>
                    <span className="text-xs" style={{ color: '#a89e92' }}>{total} wydarzeń w miesiącu</span>
                    {selectedDay && (
                      <button onClick={() => setSelectedDay(null)} className="text-xs underline decoration-dotted underline-offset-2" style={{ color: '#7a7068' }}>Pokaż wszystkie</button>
                    )}
                  </div>
                ) : null
              })()}
            </div>

            {calListEvents.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm" style={{ color: '#a89e92' }}>{selectedDay ? 'Brak wydarzeń tego dnia' : 'Brak wydarzeń w tym miesiącu'}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const byDay = new Map<string, EventRow[]>()
                  for (const e of calListEvents) {
                    const k = dayKey(e.start_time)
                    if (!byDay.has(k)) byDay.set(k, [])
                    byDay.get(k)!.push(e)
                  }
                  return Array.from(byDay.entries()).map(([dk, dayEvs]) => (
                    <div key={dk}>
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: '#7a7068' }}>{formatDayLabel(dayEvs[0].start_time)}</p>
                        <div className="flex-1 h-px" style={{ background: '#e4ddd4' }} />
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#e4ddd4', color: '#7a7068' }}>{dayEvs.length}</span>
                      </div>
                      <div className="space-y-2">
                        {dayEvs.map(ev => (
                          <EventCard key={ev.id} ev={ev} extraIdx={extraIndexMap.get(ev.type ?? '') ?? 0} now={now} onEdit={setEditingEvent} />
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>

        ) : (
          <div className="px-4 md:px-8 py-4 md:py-6">
            {listGrouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#e4ddd4' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a7068" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: '#5a524a' }}>
                  {period === 'upcoming' ? 'Brak nadchodzących wydarzeń' : period === 'past' ? 'Brak archiwalnych wydarzeń' : 'Brak wydarzeń'}
                </p>
              </div>
            ) : (
              <div className="space-y-8 max-w-3xl">
                {listGrouped.map(([dk, dayEvs]) => (
                  <div key={dk}>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: '#7a7068' }}>{formatDayLabel(dayEvs[0].start_time)}</p>
                      <div className="flex-1 h-px" style={{ background: '#e4ddd4' }} />
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#e4ddd4', color: '#7a7068' }}>{dayEvs.length}</span>
                    </div>
                    <div className="space-y-2">
                      {dayEvs.map(ev => (
                        <EventCard key={ev.id} ev={ev} extraIdx={extraIndexMap.get(ev.type ?? '') ?? 0} now={now} onEdit={setEditingEvent} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingEvent && (
        <EditModal
          ev={editingEvent}
          eventTypes={eventTypes}
          rooms={rooms}
          artists={artists}
          onClose={() => setEditingEvent(null)}
          onSaved={() => { setEditingEvent(null); fetchAll() }}
        />
      )}
    </div>
  )
}
