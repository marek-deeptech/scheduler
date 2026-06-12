'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { lastName } from '@/lib/names'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubstituteInfo {
  id:         string
  name:       string
  status:     string | null
  available:  'available' | 'blocked' | 'busy' | 'unknown'
  blockReason?: string   // e.g. 'Urlop', 'Choroba'
  busyTitle?:  string   // production title of conflicting event
}

interface Props {
  artistId:    string
  artistName:  string
  conflictDate: string         // YYYY-MM-DD
  conflictStart?: string       // HH:MM
  conflictEnd?:   string       // HH:MM
  productions:    string[]     // two conflicting production titles
  onClose:    () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BLOCKING = new Set(['Urlop', 'Niedostępny', 'Choroba'])

function timesOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const DAY_PL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']

function dayLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return DAY_PL[d.getDay()]
}

// ── Availability dot ──────────────────────────────────────────────────────────

function AvailDot({ avail }: { avail: SubstituteInfo['available'] }) {
  const styles: Record<SubstituteInfo['available'], string> = {
    available: 'bg-green-500',
    blocked:   'bg-red-500',
    busy:      'bg-orange-400',
    unknown:   'bg-gray-300',
  }
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${styles[avail]}`}
      title={avail === 'available' ? 'Wolny w tym dniu' : avail === 'blocked' ? 'Niedostępny' : avail === 'busy' ? 'Ma inny spektakl' : 'Nieznana dostępność'}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConflictResolutionModal({
  artistId, artistName, conflictDate, conflictStart, conflictEnd, productions, onClose,
}: Props) {
  const router = useRouter()
  const [substitutes, setSubstitutes] = useState<SubstituteInfo[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  // Substitution flow: picked substitute → production choice → saved
  const [chooseProdFor, setChooseProdFor] = useState<SubstituteInfo | null>(null)
  const [applying,      setApplying]      = useState(false)
  const [done,          setDone]          = useState<string | null>(null)

  async function applySubstitution(sub: SubstituteInfo, prodTitle: string) {
    setApplying(true)
    setError(null)
    try {
      // Find the conflicting event of the chosen production on that date
      const { data: prods, error: pErr } = await supabase
        .from('productions').select('id').eq('title', prodTitle).limit(1)
      if (pErr) throw pErr
      const pid = prods?.[0]?.id
      if (!pid) throw new Error(`Nie znaleziono tytułu „${prodTitle}"`)

      const { data: evs, error: eErr } = await supabase
        .from('events')
        .select('id, start_time, end_time')
        .eq('production_id', pid)
        .gte('start_time', `${conflictDate}T00:00:00`)
        .lte('start_time', `${conflictDate}T23:59:59`)
      if (eErr) throw eErr

      let targets = evs ?? []
      if (conflictStart && targets.length > 1) {
        targets = targets.filter(e =>
          timesOverlap(
            String(e.start_time).slice(11, 16), String(e.end_time).slice(11, 16),
            conflictStart, conflictEnd ?? '23:59',
          )
        )
      }
      if (targets.length === 0) throw new Error('Brak wydarzenia tego dnia dla wybranego tytułu')

      // Swap in the event cast: remove the conflicted actor, add the substitute
      for (const ev of targets) {
        await supabase.from('event_artists').delete().eq('event_id', ev.id).eq('artist_id', artistId)
        await supabase.from('event_artists').delete().eq('event_id', ev.id).eq('artist_id', sub.id)
        const { error: insErr } = await supabase.from('event_artists').insert({ event_id: ev.id, artist_id: sub.id })
        if (insErr) throw insErr
      }

      setDone(`${sub.name} zastąpi: ${artistName} w „${prodTitle}" — ${dayLabel(conflictDate)}, ${fmtDate(conflictDate)}`)
    } catch (e: any) {
      setError(e?.message ?? 'Błąd zapisu zastępstwa')
    } finally {
      setApplying(false)
      setChooseProdFor(null)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        // 1. Get registered substitutes
        const { data: subRows, error: subErr } = await supabase
          .from('actor_substitutes')
          .select('substitute_id')
          .eq('actor_id', artistId)

        if (subErr) throw subErr

        if (!subRows || subRows.length === 0) {
          if (!cancelled) { setSubstitutes([]); setLoading(false) }
          return
        }

        const subIds = subRows.map((r: any) => r.substitute_id as string)

        // 2. Fetch substitute artist details
        const { data: artistRows, error: artErr } = await supabase
          .from('artists')
          .select('id, name, status')
          .in('id', subIds)

        if (artErr) throw artErr

        // 3. Check blocking day-status on conflictDate
        const { data: statusRows } = await supabase
          .from('actor_day_status')
          .select('artist_id, status')
          .in('artist_id', subIds)
          .eq('date', conflictDate)
          .in('status', ['Urlop', 'Niedostępny', 'Choroba'])

        const blockedMap = new Map<string, string>()
        for (const row of (statusRows ?? [])) {
          blockedMap.set((row as any).artist_id, (row as any).status)
        }

        // 4. Check if substitutes have events on conflictDate (via artist_productions + events)
        //    Step 4a: get production IDs per substitute
        const { data: apRows } = await supabase
          .from('artist_productions')
          .select('artist_id, production_id')
          .in('artist_id', subIds)

        const prodIdsByArtist = new Map<string, string[]>()
        for (const ap of (apRows ?? [])) {
          const aid = (ap as any).artist_id as string
          const pid = (ap as any).production_id as string
          const arr = prodIdsByArtist.get(aid) ?? []
          arr.push(pid)
          prodIdsByArtist.set(aid, arr)
        }

        //    Step 4b: get events on conflictDate for those productions
        const allProdIds = [...new Set((apRows ?? []).map((ap: any) => ap.production_id as string))]

        let busyMap = new Map<string, string>() // artistId → production title causing busy
        if (allProdIds.length > 0) {
          const { data: evRows } = await supabase
            .from('events')
            .select('id, production_id, start_time, end_time, productions(title)')
            .eq('date', conflictDate)
            .in('production_id', allProdIds)

          // For each event, find which substitutes are in the cast of that production
          for (const ev of (evRows ?? [])) {
            const evStart = ((ev as any).start_time ?? '00:00').slice(0, 5)
            const evEnd   = ((ev as any).end_time   ?? '23:59').slice(0, 5)
            const pid     = (ev as any).production_id as string
            const title   = ((ev as any).productions as any)?.title ?? '?'

            if (
              conflictStart && conflictEnd &&
              !timesOverlap(evStart, evEnd, conflictStart, conflictEnd)
            ) continue  // no time overlap

            for (const [aid, pids] of prodIdsByArtist.entries()) {
              if (pids.includes(pid) && !busyMap.has(aid)) {
                busyMap.set(aid, title)
              }
            }
          }
        }

        // 5. Build result list
        const result: SubstituteInfo[] = (artistRows ?? []).map((a: any) => {
          const blockReason = blockedMap.get(a.id)
          const busyTitle   = busyMap.get(a.id)
          let available: SubstituteInfo['available'] = 'available'
          if (blockReason) available = 'blocked'
          else if (busyTitle) available = 'busy'

          return {
            id:          a.id,
            name:        a.name,
            status:      a.status,
            available,
            blockReason,
            busyTitle,
          }
        })

        // Sort: available first, then alphabetically by surname
        result.sort((a, b) => {
          const order = { available: 0, unknown: 1, busy: 2, blocked: 3 }
          return (order[a.available] ?? 1) - (order[b.available] ?? 1)
            || lastName(a.name).localeCompare(lastName(b.name), 'pl')
        })

        if (!cancelled) { setSubstitutes(result); setLoading(false) }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message ?? 'Błąd'); setLoading(false) }
      }
    }

    load()
    return () => { cancelled = true }
  }, [artistId, conflictDate, conflictStart, conflictEnd])

  const availableCount = substitutes.filter(s => s.available === 'available').length

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,20,16,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: '#fff', border: '1px solid #e4ddd4' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #f2ede6' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                      style={{ background: '#fff0f0', color: '#c8102e', border: '1px solid #fecaca' }}>
                  ⚠ Konflikt obsady
                </span>
              </div>
              <h2 className="text-base font-bold" style={{ color: '#1a1410', fontFamily: 'var(--font-playfair), Georgia, serif' }}>
                {artistName}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#7a7068' }}>
                {dayLabel(conflictDate)}, {fmtDate(conflictDate)}
                {conflictStart && conflictEnd && ` · ${conflictStart}–${conflictEnd}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full text-2xl leading-none shrink-0 hover:bg-gray-100 transition-colors"
              style={{ color: '#9ca3af', marginTop: '-2px' }}
            >
              ×
            </button>
          </div>

          {/* Productions in conflict */}
          {productions.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#b8b0a4' }}>
                Konflikt między produkcjami
              </p>
              {productions.map((p, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
                     style={{ background: '#fff5f5', color: '#7a2020', border: '1px solid #fecaca' }}>
                  <span className="text-xs" style={{ color: '#fca5a5' }}>#{i + 1}</span>
                  {p}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Substitutes section */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#b8b0a4' }}>
              Zastępcy aktora
            </p>
            {!loading && substitutes.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      background: availableCount > 0 ? '#f0fdf4' : '#fff7ed',
                      color:      availableCount > 0 ? '#15803d'  : '#c2410c',
                      border:     `1px solid ${availableCount > 0 ? '#86efac' : '#fed7aa'}`,
                    }}>
                {availableCount > 0
                  ? `${availableCount} wolnych w tym dniu`
                  : 'brak wolnych w tym dniu'}
              </span>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#e4ddd4', borderTopColor: '#c8102e' }} />
            </div>
          )}

          {!loading && error && (
            <p className="text-xs py-4 text-center" style={{ color: '#c8102e' }}>{error}</p>
          )}

          {!loading && !error && substitutes.length === 0 && (
            <div className="py-4 text-center">
              <p className="text-sm font-medium" style={{ color: '#7a7068' }}>Brak zarejestrowanych zastępców</p>
              <p className="text-xs mt-1" style={{ color: '#a89e92' }}>
                Dodaj zastępców w profilu aktora
              </p>
            </div>
          )}

          {/* Success view */}
          {done && (
            <div className="py-4 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                   style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <p className="text-sm font-semibold" style={{ color: '#15803d' }}>Zastępstwo zapisane</p>
              <p className="text-xs mt-1 px-4" style={{ color: '#7a7068' }}>{done}</p>
            </div>
          )}

          {/* Step 2: choose which production the substitute plays in */}
          {!done && chooseProdFor && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium" style={{ color: '#1a1410' }}>
                W którym tytule zagra <b>{chooseProdFor.name}</b>?
              </p>
              {productions.map((p, i) => (
                <button
                  key={i}
                  disabled={applying}
                  onClick={() => applySubstitution(chooseProdFor, p)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors hover:bg-red-50 disabled:opacity-50"
                  style={{ background: '#fff5f5', color: '#7a2020', border: '1px solid #fecaca' }}
                >
                  <span className="text-xs" style={{ color: '#fca5a5' }}>#{i + 1}</span>
                  {p}
                  <span className="ml-auto text-[11px] font-semibold" style={{ color: '#c8102e' }}>
                    {applying ? 'Zapisuję…' : 'Wybierz →'}
                  </span>
                </button>
              ))}
              <button
                disabled={applying}
                onClick={() => setChooseProdFor(null)}
                className="text-xs py-1.5 transition-colors hover:text-gray-700"
                style={{ color: '#a89e92' }}
              >
                ← Wróć do listy zastępców
              </button>
            </div>
          )}

          {!done && !chooseProdFor && !loading && !error && substitutes.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
              {substitutes.map(sub => {
                const selectable = sub.available === 'available' || sub.available === 'unknown'
                return (
                <div
                  key={sub.id}
                  onClick={() => { if (selectable) setChooseProdFor(sub) }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${selectable ? 'cursor-pointer hover:shadow-sm' : ''}`}
                  style={{
                    background: sub.available === 'available'
                      ? '#f0fdf4'
                      : sub.available === 'blocked'
                      ? '#fff5f5'
                      : sub.available === 'busy'
                      ? '#fffbeb'
                      : '#fafaf9',
                    border: `1px solid ${
                      sub.available === 'available' ? '#bbf7d0'
                      : sub.available === 'blocked' ? '#fecaca'
                      : sub.available === 'busy'    ? '#fde68a'
                      : '#e5e7eb'
                    }`,
                  }}
                >
                  <AvailDot avail={sub.available} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium" style={{ color: '#1a1410' }}>
                      {sub.name}
                    </span>
                    <span className="ml-2 text-[10px]" style={{
                      color: sub.available === 'available' ? '#15803d'
                           : sub.available === 'blocked'   ? '#c8102e'
                           : sub.available === 'busy'      ? '#b45309'
                           : '#9ca3af'
                    }}>
                      {sub.available === 'available' && 'Wolny w tym dniu'}
                      {sub.available === 'blocked'   && (sub.blockReason ?? 'Niedostępny')}
                      {sub.available === 'busy'      && `Spektakl: ${sub.busyTitle ?? '?'}`}
                      {sub.available === 'unknown'   && 'Nieznana dostępność'}
                    </span>
                  </div>
                  {/* Select substitute */}
                  {selectable && (
                    <button
                      onClick={e => { e.stopPropagation(); setChooseProdFor(sub) }}
                      className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors"
                      style={{ background: '#c8102e', color: '#fff' }}
                    >
                      Wybierz
                    </button>
                  )}
                  {/* Quick link to artist profile */}
                  <button
                    onClick={e => { e.stopPropagation(); router.push(`/artists?select=${sub.id}`); onClose() }}
                    className="shrink-0 text-[10px] font-semibold px-2 py-1.5 rounded-lg transition-colors hover:bg-white"
                    style={{ color: '#7a7068', border: '1px solid #e4ddd4' }}
                    title="Otwórz profil zastępcy"
                  >
                    Profil →
                  </button>
                </div>
              )})}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: '1px solid #f2ede6', background: '#faf8f5' }}>
          {done ? (
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: '#15803d', color: '#fff' }}
            >
              ✓ Gotowe
            </button>
          ) : (
            <>
              <button
                onClick={() => { router.push(`/artists?select=${artistId}&edit=1`); onClose() }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: '#c8102e', color: '#fff' }}
              >
                Zarządzaj zastępcami
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-gray-100"
                style={{ color: '#7a7068', border: '1px solid #e4ddd4' }}
              >
                Zamknij
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
