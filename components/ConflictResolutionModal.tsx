'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { lastName } from '@/lib/names'
import { findActorClashes, clashMessage } from '@/lib/clash-check'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubstituteInfo {
  id:         string
  name:       string
  status:     string | null
  available:  'available' | 'blocked' | 'busy' | 'unknown'
  blockReason?: string   // e.g. 'Urlop', 'Choroba'
  busyTitle?:  string   // production title of conflicting event
}

interface ProdOption {
  id:     string
  title:  string
  subIds: string[]   // dublerzy zarejestrowani dla (aktor, ten tytuł)
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
  const [prodOptions,  setProdOptions]  = useState<ProdOption[]>([])
  const [subInfoById,  setSubInfoById]  = useState<Map<string, SubstituteInfo>>(new Map())
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  // Flow: choose production (title) → choose substitute → saved
  const [selectedProd, setSelectedProd] = useState<ProdOption | null>(null)
  const [applying,     setApplying]     = useState(false)
  const [done,         setDone]         = useState<string | null>(null)

  async function applySubstitution(sub: SubstituteInfo, prod: ProdOption) {
    setApplying(true)
    setError(null)
    try {
      const { data: evs, error: eErr } = await supabase
        .from('events')
        .select('id, start_time, end_time')
        .eq('production_id', prod.id)
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

      // Twarda blokada: dubler nie może już grać w innym wydarzeniu o tym czasie
      for (const ev of targets) {
        const clashes = await findActorClashes({
          date: conflictDate,
          startHM: String(ev.start_time).slice(11, 16),
          endHM:   String(ev.end_time).slice(11, 16),
          artistIds: [sub.id],
          excludeEventId: ev.id,
        })
        if (clashes.length > 0) { setError(clashMessage(clashes)); setApplying(false); return }
      }

      // Swap in the event cast: remove the conflicted actor, add the substitute
      const swappedEventIds: string[] = []
      for (const ev of targets) {
        await supabase.from('event_artists').delete().eq('event_id', ev.id).eq('artist_id', artistId)
        await supabase.from('event_artists').delete().eq('event_id', ev.id).eq('artist_id', sub.id)
        const { error: insErr } = await supabase.from('event_artists').insert({ event_id: ev.id, artist_id: sub.id })
        if (insErr) throw insErr
        swappedEventIds.push(ev.id)
      }

      // Powiadom zastępcę (prośba o potwierdzenie) i odwołanego aktora — bez blokowania UI
      fetch('/api/notify/substitution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          removedArtistId: artistId,
          substituteId: sub.id,
          eventIds: swappedEventIds,
          productionTitle: prod.title,
        }),
      }).catch(() => {})

      setDone(`${sub.name} zastąpi: ${artistName} w „${prod.title}" — ${dayLabel(conflictDate)}, ${fmtDate(conflictDate)}`)
    } catch (e: any) {
      setError(e?.message ?? 'Błąd zapisu zastępstwa')
    } finally {
      setApplying(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        // 1. Resolve conflicting production titles → ids
        const { data: prodRows, error: pErr } = await supabase
          .from('productions').select('id, title').in('title', productions)
        if (pErr) throw pErr

        const options: ProdOption[] = productions
          .map(title => {
            const row = (prodRows ?? []).find((r: any) => r.title === title)
            return row ? { id: (row as any).id as string, title, subIds: [] as string[] } : null
          })
          .filter(Boolean) as ProdOption[]

        const prodIds = options.map(o => o.id)

        // 2. Per-title substitutes for this actor
        let subIds: string[] = []
        if (prodIds.length > 0) {
          const { data: apsRows, error: apsErr } = await supabase
            .from('actor_production_substitutes')
            .select('production_id, substitute_id')
            .eq('actor_id', artistId)
            .in('production_id', prodIds)
          if (apsErr) throw apsErr

          for (const r of (apsRows ?? []) as any[]) {
            const opt = options.find(o => o.id === r.production_id)
            if (opt && !opt.subIds.includes(r.substitute_id)) opt.subIds.push(r.substitute_id)
          }
          subIds = [...new Set((apsRows ?? []).map((r: any) => r.substitute_id as string))]
        }

        if (subIds.length === 0) {
          if (!cancelled) { setProdOptions(options); setSubInfoById(new Map()); setLoading(false) }
          return
        }

        // 3. Substitute artist details
        const { data: artistRows, error: artErr } = await supabase
          .from('artists').select('id, name, status').in('id', subIds)
        if (artErr) throw artErr

        // 4. Blocking day-status on conflictDate
        const { data: statusRows } = await supabase
          .from('actor_day_status')
          .select('artist_id, status')
          .in('artist_id', subIds)
          .eq('date', conflictDate)
          .in('status', ['Urlop', 'Niedostępny', 'Choroba'])

        const blockedMap = new Map<string, string>()
        for (const row of (statusRows ?? [])) blockedMap.set((row as any).artist_id, (row as any).status)

        // 5. Busy: substitute has another event that day (via artist_productions + events)
        const { data: apRows } = await supabase
          .from('artist_productions').select('artist_id, production_id').in('artist_id', subIds)

        const prodIdsByArtist = new Map<string, string[]>()
        for (const ap of (apRows ?? [])) {
          const aid = (ap as any).artist_id as string
          const pid = (ap as any).production_id as string
          const arr = prodIdsByArtist.get(aid) ?? []
          arr.push(pid)
          prodIdsByArtist.set(aid, arr)
        }

        const allProdIds = [...new Set((apRows ?? []).map((ap: any) => ap.production_id as string))]
        const busyMap = new Map<string, string>()
        if (allProdIds.length > 0) {
          const { data: evRows } = await supabase
            .from('events')
            .select('id, production_id, start_time, end_time, productions(title)')
            .gte('start_time', `${conflictDate}T00:00:00`)
            .lte('start_time', `${conflictDate}T23:59:59`)
            .in('production_id', allProdIds)

          for (const ev of (evRows ?? [])) {
            const evStart = String((ev as any).start_time ?? '').slice(11, 16) || '00:00'
            const evEnd   = String((ev as any).end_time   ?? '').slice(11, 16) || '23:59'
            const pid     = (ev as any).production_id as string
            const title   = ((ev as any).productions as any)?.title ?? '?'
            if (conflictStart && conflictEnd && !timesOverlap(evStart, evEnd, conflictStart, conflictEnd)) continue
            for (const [aid, pids] of prodIdsByArtist.entries()) {
              if (pids.includes(pid) && !busyMap.has(aid)) busyMap.set(aid, title)
            }
          }
        }

        const infoMap = new Map<string, SubstituteInfo>()
        for (const a of (artistRows ?? []) as any[]) {
          const blockReason = blockedMap.get(a.id)
          const busyTitle   = busyMap.get(a.id)
          let available: SubstituteInfo['available'] = 'available'
          if (blockReason) available = 'blocked'
          else if (busyTitle) available = 'busy'
          infoMap.set(a.id, { id: a.id, name: a.name, status: a.status, available, blockReason, busyTitle })
        }

        if (!cancelled) { setProdOptions(options); setSubInfoById(infoMap); setLoading(false) }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message ?? 'Błąd'); setLoading(false) }
      }
    }

    load()
    return () => { cancelled = true }
  }, [artistId, conflictDate, conflictStart, conflictEnd])

  // Substitutes for the currently selected production, availability-sorted
  const currentSubs: SubstituteInfo[] = useMemo(() => {
    if (!selectedProd) return []
    const order = { available: 0, unknown: 1, busy: 2, blocked: 3 }
    return selectedProd.subIds
      .map(id => subInfoById.get(id))
      .filter(Boolean as any as (x: SubstituteInfo | undefined) => x is SubstituteInfo)
      .sort((a, b) =>
        (order[a.available] ?? 1) - (order[b.available] ?? 1)
        || lastName(a.name).localeCompare(lastName(b.name), 'pl'))
  }, [selectedProd, subInfoById])

  const availableCount = currentSubs.filter(s => s.available === 'available').length

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
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#e4ddd4', borderTopColor: '#c8102e' }} />
            </div>
          )}

          {!loading && error && (
            <p className="text-xs py-4 text-center" style={{ color: '#c8102e' }}>{error}</p>
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

          {/* Step 1: choose which production to fill */}
          {!done && !error && !loading && !selectedProd && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#b8b0a4' }}>
                W którym tytule szukasz zastępcy?
              </p>
              {prodOptions.length === 0 && (
                <p className="text-xs italic py-2" style={{ color: '#a89e92' }}>Nie znaleziono tytułów w konflikcie.</p>
              )}
              {prodOptions.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProd(p)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors hover:bg-red-50"
                  style={{ background: '#fff5f5', color: '#7a2020', border: '1px solid #fecaca' }}
                >
                  <span className="text-xs" style={{ color: '#fca5a5' }}>#{i + 1}</span>
                  <span className="flex-1 min-w-0">{p.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                        style={{ background: p.subIds.length ? '#fff' : '#fef2f2', color: p.subIds.length ? '#7a2020' : '#c8102e', border: '1px solid #fecaca' }}>
                    {p.subIds.length} {p.subIds.length === 1 ? 'dubler' : 'dublerów'}
                  </span>
                  <span className="text-[11px] font-semibold shrink-0" style={{ color: '#c8102e' }}>→</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: choose a substitute for the selected production */}
          {!done && !error && !loading && selectedProd && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between mb-1">
                <button onClick={() => setSelectedProd(null)}
                  className="text-xs transition-colors hover:text-gray-700" style={{ color: '#a89e92' }}>
                  ← Zmień tytuł
                </button>
                {currentSubs.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: availableCount > 0 ? '#f0fdf4' : '#fff7ed',
                          color:      availableCount > 0 ? '#15803d'  : '#c2410c',
                          border:     `1px solid ${availableCount > 0 ? '#86efac' : '#fed7aa'}`,
                        }}>
                    {availableCount > 0 ? `${availableCount} wolnych w tym dniu` : 'brak wolnych w tym dniu'}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: '#1a1410' }}>
                Dubler w „{selectedProd.title}"
              </p>

              {currentSubs.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm font-medium" style={{ color: '#7a7068' }}>Brak dublerów dla tego tytułu</p>
                  <p className="text-xs mt-1" style={{ color: '#a89e92' }}>Dodaj dublerów w zakładce Dublerzy w profilu aktora</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
                  {currentSubs.map(sub => {
                    const selectable = sub.available === 'available' || sub.available === 'unknown'
                    return (
                      <div
                        key={sub.id}
                        onClick={() => { if (selectable && !applying) applySubstitution(sub, selectedProd) }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${selectable ? 'cursor-pointer hover:shadow-sm' : ''}`}
                        style={{
                          background: sub.available === 'available' ? '#f0fdf4'
                            : sub.available === 'blocked' ? '#fff5f5'
                            : sub.available === 'busy' ? '#fffbeb' : '#fafaf9',
                          border: `1px solid ${
                            sub.available === 'available' ? '#bbf7d0'
                            : sub.available === 'blocked' ? '#fecaca'
                            : sub.available === 'busy'    ? '#fde68a' : '#e5e7eb'}`,
                        }}
                      >
                        <AvailDot avail={sub.available} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium" style={{ color: '#1a1410' }}>{sub.name}</span>
                          <span className="ml-2 text-[10px]" style={{
                            color: sub.available === 'available' ? '#15803d'
                                 : sub.available === 'blocked'   ? '#c8102e'
                                 : sub.available === 'busy'      ? '#b45309' : '#9ca3af'
                          }}>
                            {sub.available === 'available' && 'Wolny w tym dniu'}
                            {sub.available === 'blocked'   && (sub.blockReason ?? 'Niedostępny')}
                            {sub.available === 'busy'      && `Spektakl: ${sub.busyTitle ?? '?'}`}
                            {sub.available === 'unknown'   && 'Nieznana dostępność'}
                          </span>
                        </div>
                        {selectable && (
                          <button
                            onClick={e => { e.stopPropagation(); if (!applying) applySubstitution(sub, selectedProd) }}
                            disabled={applying}
                            className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            style={{ background: '#c8102e', color: '#fff' }}
                          >
                            {applying ? 'Zapisuję…' : 'Wybierz'}
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); router.push(`/artists?select=${sub.id}`); onClose() }}
                          className="shrink-0 text-[10px] font-semibold px-2 py-1.5 rounded-lg transition-colors hover:bg-white"
                          style={{ color: '#7a7068', border: '1px solid #e4ddd4' }}
                          title="Otwórz profil zastępcy"
                        >
                          Profil →
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
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
                onClick={() => { router.push(`/artists?select=${artistId}&tab=subs`); onClose() }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: '#c8102e', color: '#fff' }}
              >
                Zarządzaj dublerami
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
