'use client'

import { useRouter } from 'next/navigation'
import { type ConflictReason, CONFLICT_LABEL, CONFLICT_ICON } from '@/lib/conflicts'
import { IconMapPin, IconTheatre } from '@/lib/icons'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConflictEventInfo {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  room_id: string | null
  theatre_id: string | null
  production_title: string | null
}

export interface ConflictEntry {
  a: ConflictEventInfo
  b: ConflictEventInfo
  reasons: ConflictReason[]
  sharedArtistIds: string[]
}

interface SimpleRecord { id: string; name: string }

interface Props {
  conflicts: ConflictEntry[]
  allArtists: SimpleRecord[]
  allRooms: SimpleRecord[]
  allTheatres: SimpleRecord[]
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReasonBadge({
  entry, allArtists, allRooms, allTheatres,
}: {
  entry: ConflictEntry
  allArtists: SimpleRecord[]
  allRooms: SimpleRecord[]
  allTheatres: SimpleRecord[]
}) {
  const artistNames = entry.sharedArtistIds
    .map(id => allArtists.find(a => a.id === id)?.name ?? '—')
    .join(', ')
  const roomA      = entry.a.room_id ? allRooms.find(r => r.id === entry.a.room_id)?.name : null
  const theatreA   = entry.a.theatre_id ? allTheatres.find(t => t.id === entry.a.theatre_id)?.name : null
  const theatreB   = entry.b.theatre_id ? allTheatres.find(t => t.id === entry.b.theatre_id)?.name : null

  const detail: Record<ConflictReason, string | null> = {
    artist:     artistNames || null,
    room:       roomA       || null,
    tech_venue: (theatreA && theatreB) ? `${theatreA} ↔ ${theatreB}` : null,
  }

  return (
    <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 flex flex-wrap gap-1.5">
      {entry.reasons.map(r => (
        <span key={r} className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-white border border-red-200 rounded-full px-2 py-0.5">
          {CONFLICT_ICON[r]}
          {CONFLICT_LABEL[r]}
          {detail[r] && <span className="font-normal text-red-500">· {detail[r]}</span>}
        </span>
      ))}
    </div>
  )
}

function EventCard({
  event, allRooms, allTheatres, onEdit,
}: {
  event: ConflictEventInfo
  allRooms: SimpleRecord[]
  allTheatres: SimpleRecord[]
  onEdit: () => void
}) {
  const room    = event.room_id    ? allRooms.find(r => r.id === event.room_id)?.name    : null
  const theatre = event.theatre_id ? allTheatres.find(t => t.id === event.theatre_id)?.name : null

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {event.type ?? event.title}
        </p>
        {event.type && event.title !== event.type && (
          <p className="text-xs text-gray-500 truncate">{event.title}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {fmtDate(event.start_time)} · {fmtTime(event.start_time)} – {fmtTime(event.end_time)}
        </p>
        {(room || theatre) && (
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <IconMapPin size={12} className="text-gray-500 inline" /> {[room, theatre].filter(Boolean).join(' · ')}
          </p>
        )}
        {event.production_title && (
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><IconTheatre size={12} className="text-gray-500 inline" /> {event.production_title}</p>
        )}
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 mt-0.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
      >
        Edytuj →
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ConflictPanel({ conflicts, allArtists, allRooms, allTheatres, onClose }: Props) {
  const router = useRouter()

  function goEdit(eventId: string) {
    onClose()
    router.push(`/calendar?editEvent=${eventId}`)
  }

  const countByType = (r: ConflictReason) => conflicts.filter(c => c.reasons.includes(r)).length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden mb-8">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Konflikty grafiku</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {conflicts.length} {conflicts.length === 1 ? 'konflikt' : conflicts.length < 5 ? 'konflikty' : 'konfliktów'}
                {' — '}kliknij <strong>Edytuj →</strong> aby zmienić godzinę, salę lub obsadę
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-2xl leading-none ml-3 shrink-0"
            >
              ×
            </button>
          </div>

          {/* Type summary chips */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {(['artist', 'room', 'tech_venue'] as ConflictReason[]).map(r => {
              const n = countByType(r)
              if (!n) return null
              return (
                <span key={r} className="text-[11px] font-semibold px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100">
                  {CONFLICT_ICON[r]} {n} × {CONFLICT_LABEL[r]}
                </span>
              )
            })}
          </div>
        </div>

        {/* Conflict list */}
        <div className="divide-y divide-gray-100">
          {conflicts.map((entry, i) => (
            <div key={i}>
              <ReasonBadge
                entry={entry}
                allArtists={allArtists}
                allRooms={allRooms}
                allTheatres={allTheatres}
              />
              <EventCard
                event={entry.a}
                allRooms={allRooms}
                allTheatres={allTheatres}
                onEdit={() => goEdit(entry.a.id)}
              />
              {/* divider */}
              <div className="mx-4 flex items-center gap-2">
                <div className="flex-1 border-t border-dashed border-gray-200" />
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">vs</span>
                <div className="flex-1 border-t border-dashed border-gray-200" />
              </div>
              <EventCard
                event={entry.b}
                allRooms={allRooms}
                allTheatres={allTheatres}
                onEdit={() => goEdit(entry.b.id)}
              />
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          Zmiany dokonane w kalendarzu (data, sala, obsada) automatycznie usuwają konflikt.
        </div>
      </div>
    </div>
  )
}
