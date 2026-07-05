'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { sortByLastName, sortNamesByLastName } from '@/lib/names'
import { findActorClashes, clashMessage } from '@/lib/clash-check'

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
  return String(iso).slice(11, 16)  // ściana zegara (UTC) = czas Warszawa; bez przesunięcia strefy
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

// ── Type icons (Heroicons-outline style) ───────────────────────────────────────

function typeIconPath(type: string | null): string {
  const t = type ?? ''
  if (/urodzin/i.test(t)) return 'M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.38a48.474 48.474 0 0 0-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12 3.375a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0z'
  if (/próba|proba|generaln/i.test(t)) return 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.5 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z'
  if (/konferencj|wywiad|spotkani|zebrani/i.test(t)) return 'M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z'
  if (/sesj|zdjęc|zdjec/i.test(t)) return 'M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316zM16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM18.75 10.5h.008v.008h-.008V10.5z'
  if (/montaż|montaz|warsztat|wynajem|scenograf/i.test(t)) return 'M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L3 3.75l1.5-1.5L8.25 3v1.5l2.099 2.099'
  return 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z' // domyślnie: błyskawica (wydarzenie)
}
function TypeIcon({ type, size = 16 }: { type: string | null; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={typeIconPath(type)} />
    </svg>
  )
}
const ClockIc = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round"/></svg>
const PinIc   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" strokeLinejoin="round"/><circle cx="12" cy="10" r="2.5"/></svg>
const UsersIc = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0"><path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" strokeLinecap="round" strokeLinejoin="round"/></svg>

// ── EventTile (kafelek) ─────────────────────────────────────────────────────────

function EventTile({ ev, extraIdx, now, onOpen }: {
  ev: EventRow; extraIdx: number; now: Date; onOpen: (ev: EventRow) => void
}) {
  const s = typeStyle(ev.type, extraIdx)
  const past = new Date(ev.end_time) < now
  const cast = (ev.event_artists ?? []).map((a: any) => (Array.isArray(a.artists) ? a.artists[0] : a.artists)).filter(Boolean)
  const room = (ev as any).rooms?.name ?? ev.location
  return (
    <button onClick={() => onOpen(ev)}
      className="text-left rounded-2xl border p-4 transition-all hover:shadow-md w-full flex flex-col gap-2.5"
      style={{ background: '#fff', borderColor: s.border, opacity: past ? 0.65 : 1 }}>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}>
          <TypeIcon type={ev.type} size={16} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full truncate" style={{ background: s.bg, color: s.color }}>{ev.type ?? 'Inne'}</span>
        <span className="ml-auto text-sm font-bold tabular-nums shrink-0" style={{ color: '#1a1410' }}>{formatTime(ev.start_time)}</span>
      </div>
      <p className="text-sm font-bold leading-snug line-clamp-2" style={{ color: '#1a1410' }}>{ev.title}</p>
      <div className="flex flex-col gap-1 text-[11px]" style={{ color: '#7a7068' }}>
        <span className="flex items-center gap-1.5"><ClockIc /> {formatTime(ev.start_time)}–{formatTime(ev.end_time)}</span>
        {room && <span className="flex items-center gap-1.5 truncate"><PinIc /> <span className="truncate">{room}</span></span>}
        {cast.length > 0 && <span className="flex items-center gap-1.5 truncate"><UsersIc /> <span className="truncate">{cast.length === 1 ? cast[0].name : `${cast[0].name} +${cast.length - 1}`}</span></span>}
      </div>
    </button>
  )
}

// ── EventDrawer (panel z prawej) ─────────────────────────────────────────────────

function EventDrawer({ ev, onClose, onEdit }: {
  ev: EventRow; onClose: () => void; onEdit: (ev: EventRow) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOpen(true), 10); return () => clearTimeout(t) }, [])
  const close = () => { setOpen(false); setTimeout(onClose, 200) }
  const s = typeStyle(ev.type, 0)
  const cast = (ev.event_artists ?? []).map((a: any) => (Array.isArray(a.artists) ? a.artists[0] : a.artists)).filter(Boolean)
  const room = (ev as any).rooms?.name ?? null
  return (
    <div className="fixed inset-0 z-[80]">
      <div className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={close} />
      <div className={`absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl overflow-y-auto transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {(ev as any).image_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={(ev as any).image_url} alt="" className="w-full h-44 object-cover" />
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full" style={{ background: s.bg, color: s.color }}>
              <TypeIcon type={ev.type} size={14} /> {ev.type ?? 'Inne'}
            </span>
            <button onClick={close} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#f2ede6', color: '#7a7068' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.4rem', fontWeight: 700, color: '#1a1410', lineHeight: 1.2 }}>{ev.title}</h2>
          <p className="text-sm capitalize mt-1" style={{ color: '#7a7068' }}>{formatDayLabel(ev.start_time)}</p>

          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2.5 text-sm" style={{ color: '#3e3830' }}>
              <span style={{ color: '#a89e92' }}><ClockIc /></span>{formatTime(ev.start_time)}–{formatTime(ev.end_time)}
            </div>
            {room && <div className="flex items-center gap-2.5 text-sm" style={{ color: '#3e3830' }}><span style={{ color: '#a89e92' }}><PinIc /></span>{room}</div>}
            {ev.location && <div className="flex items-center gap-2.5 text-sm" style={{ color: '#3e3830' }}><span style={{ color: '#a89e92' }}><PinIc /></span>{ev.location}</div>}
          </div>

          {ev.description && (
            <div className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Opis</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#5a524a' }}>{ev.description}</p>
            </div>
          )}

          {cast.length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#b8b0a4' }}>Obsada / udział ({cast.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {cast.map((a: any) => (
                  <span key={a.id} className="text-xs px-2.5 py-1 rounded-full" style={{ background: '#f2ede6', color: '#5a524a' }}>{a.name}</span>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => { onEdit(ev); close() }}
            className="mt-6 w-full px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors"
            style={{ background: '#1a1410', color: '#fff' }}>
            Edytuj wydarzenie
          </button>
        </div>
      </div>
    </div>
  )
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

    // Twarda blokada podwójnego przypisania w tym samym czasie
    if (selectedArtists.length > 0) {
      const clashes = await findActorClashes({
        date: form.start_time.slice(0, 10), startHM: form.start_time.slice(11, 16), endHM: form.end_time.slice(11, 16),
        artistIds: selectedArtists, excludeEventId: ev.id,
      })
      if (clashes.length > 0) { setMsg(clashMessage(clashes)); return }
    }

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
            ? <span style={{ fontSize: 12, color: (msg.startsWith('Błąd') || msg.startsWith('Konflikt')) ? '#c8102e' : '#166534', flex: 1, whiteSpace: 'pre-line' }}>{msg}</span>
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
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)

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
          <div className="px-4 md:px-8 py-4 md:py-6 space-y-5">
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
              <div className="grid grid-cols-7 gap-1 px-3 pb-4">
                {grid.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} />
                  const dStr   = localDate(day)
                  const dayEvs = (eventsByDay.get(dStr) ?? [])
                  const isToday = dStr === todayStr
                  const isSel   = dStr === selectedDay
                  const isSbSn  = day.getDay() === 0 || day.getDay() === 6
                  return (
                    <button key={dStr} onClick={() => setSelectedDay(prev => prev === dStr ? null : dStr)}
                      className="flex flex-col items-stretch gap-1 p-1.5 rounded-xl transition-all text-left min-h-[80px] overflow-hidden"
                      style={{ background: isSel ? '#1a1410' : isToday ? '#f2ede6' : 'transparent', border: isToday && !isSel ? '1px solid #e4ddd4' : '1px solid transparent' }}
                      onMouseOver={e => { if (!isSel) e.currentTarget.style.background = '#f8f5f1' }}
                      onMouseOut={e => { e.currentTarget.style.background = isSel ? '#1a1410' : isToday ? '#f2ede6' : 'transparent' }}>
                      <span className="text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-lg self-start shrink-0"
                        style={{ color: isSel ? '#fff' : isToday ? '#1a1410' : isSbSn ? '#cec5b8' : '#3e3830' }}>
                        {day.getDate()}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        {dayEvs.slice(0, 2).map((e, di) => {
                          const s = typeStyle(e.type, extraIndexMap.get(e.type ?? '') ?? 0)
                          return (
                            <span key={di} className="text-[9px] leading-tight px-1 py-0.5 rounded truncate flex items-center gap-0.5"
                              style={{ background: isSel ? 'rgba(255,255,255,0.15)' : s.bg, color: isSel ? '#fff' : s.color }}>
                              {/urodzin/i.test(e.type ?? '') && <span className="shrink-0"><TypeIcon type={e.type} size={9} /></span>}
                              <span className="truncate">{e.title}</span>
                            </span>
                          )
                        })}
                        {dayEvs.length > 2 && (
                          <span className="text-[9px] px-1 font-medium" style={{ color: isSel ? 'rgba(255,255,255,0.7)' : '#a89e92' }}>+{dayEvs.length - 2} więcej</span>
                        )}
                      </div>
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
                      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {dayEvs.map(ev => (
                          <EventTile key={ev.id} ev={ev} extraIdx={extraIndexMap.get(ev.type ?? '') ?? 0} now={now} onOpen={setSelectedEvent} />
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
              <div className="space-y-8">
                {listGrouped.map(([dk, dayEvs]) => (
                  <div key={dk}>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: '#7a7068' }}>{formatDayLabel(dayEvs[0].start_time)}</p>
                      <div className="flex-1 h-px" style={{ background: '#e4ddd4' }} />
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#e4ddd4', color: '#7a7068' }}>{dayEvs.length}</span>
                    </div>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {dayEvs.map(ev => (
                        <EventTile key={ev.id} ev={ev} extraIdx={extraIndexMap.get(ev.type ?? '') ?? 0} now={now} onOpen={setSelectedEvent} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawer ze szczegółami (z prawej) */}
      {selectedEvent && (
        <EventDrawer
          ev={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={(e) => setEditingEvent(e)}
        />
      )}

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
