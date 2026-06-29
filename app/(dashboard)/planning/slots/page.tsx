'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTheatre } from '@/lib/theatre-context'
import { sortByLastName } from '@/lib/names'
import SendConfirmModal from '@/components/SendConfirmModal'
import {
  windowDates, dayCoverage, suggestDays, fmtDayShort,
  type SlotRow, type DayFeasibility,
} from '@/lib/slots'

/* ── Helpers ───────────────────────────────────────────────────── */
function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
function monthLabel(k: string) { const [y, m] = k.split('-'); return `${MONTHS_PL[+m - 1]} ${y}` }
function shiftMonth(k: string, d: number) { const [y, m] = k.split('-').map(Number); return monthKey(new Date(y, m - 1 + d, 1)) }
function firstOfMonth(k: string) { return `${k}-01` }
function lastOfMonth(k: string) { const [y, m] = k.split('-').map(Number); return `${k}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }

interface FavProd { id: string; title: string; cast: { id: string; name: string }[] }

/* ── Page ──────────────────────────────────────────────────────── */
export default function SlotsPage() {
  const { selectedTheatreId } = useTheatre()
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [loading, setLoading] = useState(true)
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  const [favourites, setFavourites] = useState<FavProd[]>([])
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [avail, setAvail] = useState<Record<string, Record<string, Record<string, boolean>>>>({}) // slotId -> artist -> date -> mogę
  const [submitted, setSubmitted] = useState<Record<string, Set<string>>>({}) // slotId -> set(artistId)
  // Miesiące z zatwierdzonym/wdrożonym repertuarem — slotów się tam nie planuje
  const [lockedMonths, setLockedMonths] = useState<Set<string>>(new Set())
  const monthLocked = lockedMonths.has(month)

  // Na wejściu: ustaw pierwszy miesiąc, którego repertuar jest dopiero planowany
  // (pierwszy od bieżącego, który NIE jest zatwierdzony/wdrożony).
  useEffect(() => {
    supabase.from('repertoire_proposals').select('month').eq('status', 'approved').then(({ data }) => {
      const locked = new Set<string>((data ?? []).map((r: any) => r.month))
      setLockedMonths(locked)
      let m = monthKey(new Date())
      for (let i = 0; i < 24 && locked.has(m); i++) m = shiftMonth(m, 1)
      setMonth(m)
    })
  }, [])

  useEffect(() => { load() }, [month, selectedTheatreId])

  async function load() {
    setLoading(true)

    // Favourites dla teatru
    let favQ = supabase
      .from('productions')
      .select('id, title, theatre_id, is_favourite, artist_productions(artists(id, name))')
      .eq('is_favourite', true)
    if (selectedTheatreId) favQ = favQ.eq('theatre_id', selectedTheatreId)
    const { data: favData } = await favQ
    const favs: FavProd[] = ((favData ?? []) as any[]).map(p => ({
      id: p.id, title: p.title,
      cast: (p.artist_productions ?? []).map((ap: any) => {
        const a = Array.isArray(ap.artists) ? ap.artists[0] : ap.artists
        return a ? { id: a.id, name: a.name } : null
      }).filter(Boolean),
    }))
    favs.sort((a, b) => a.title.localeCompare(b.title, 'pl'))
    setFavourites(favs)

    // Sloty miesiąca — wg faktycznego okna grania (window_start), nie kolumny month,
    // żeby nawigator miesięcy pokazywał sloty z danego miesiąca.
    const { data: slotData, error: slotErr } = await supabase
      .from('repertoire_slots')
      .select('id, month, production_id, window_start, window_end, target_performances, status, locked_dates')
      .gte('window_start', firstOfMonth(month))
      .lte('window_start', lastOfMonth(month))
      .order('window_start')
    if (slotErr) {
      setMigrationNeeded(true); setSlots([]); setLoading(false); return
    }
    const sl = (slotData ?? []) as SlotRow[]
    setSlots(sl)

    // Dostępność + status odpowiedzi
    if (sl.length > 0) {
      const slotIds = sl.map(s => s.id)
      const [{ data: avData }, { data: invData }] = await Promise.all([
        supabase.from('slot_availability').select('slot_id, artist_id, date, available').in('slot_id', slotIds),
        supabase.from('slot_invites').select('slot_id, artist_id, submitted_at').in('slot_id', slotIds),
      ])
      const am: Record<string, Record<string, Record<string, boolean>>> = {}
      for (const r of (avData ?? []) as any[]) {
        ((am[r.slot_id] ??= {})[r.artist_id] ??= {})[r.date] = r.available
      }
      setAvail(am)
      const sm: Record<string, Set<string>> = {}
      for (const r of (invData ?? []) as any[]) {
        if (r.submitted_at) (sm[r.slot_id] ??= new Set()).add(r.artist_id)
      }
      setSubmitted(sm)
    } else {
      setAvail({}); setSubmitted({})
    }

    setLoading(false)
  }

  const slottedProdIds = useMemo(() => new Set(slots.map(s => s.production_id)), [slots])
  const availableFavs = favourites.filter(f => !slottedProdIds.has(f.id))
  const prodById = useMemo(() => { const m: Record<string, FavProd> = {}; favourites.forEach(f => m[f.id] = f); return m }, [favourites])

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-4 -mx-4 -mt-4 md:px-8 md:py-5 md:-mx-8 md:-mt-8 mb-6"
           style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <div className="flex items-center gap-2">
            <Link href="/planning" className="text-xs" style={{ color: '#a89e92' }}>← Planowanie</Link>
          </div>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
            Sloty Favourites
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Etap 1–2: okna grania i dostępność aktorów</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="w-9 h-9 flex items-center justify-center rounded-lg text-lg hover:bg-gray-100" style={{ border: '1px solid #e4ddd4', color: '#7a7068' }}>‹</button>
          <span className="text-sm font-semibold px-2 min-w-[130px] text-center" style={{ color: '#1a1410' }}>{monthLabel(month)}</span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="w-9 h-9 flex items-center justify-center rounded-lg text-lg hover:bg-gray-100" style={{ border: '1px solid #e4ddd4', color: '#7a7068' }}>›</button>
        </div>
      </div>

      {migrationNeeded && (
        <div className="mb-5 rounded-xl px-4 py-3 text-xs" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <b>Wymagana migracja.</b> Uruchom <code>supabase-migration-slots.sql</code> w Supabase, aby włączyć planowanie slotami.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-center py-16" style={{ color: '#a89e92' }}>Ładowanie…</p>
      ) : monthLocked ? (
        <div className="text-center py-16">
          <div className="flex justify-center mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cec5b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: '#7a7068' }}>Repertuar na {monthLabel(month)} jest zatwierdzony</p>
          <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: '#a89e92' }}>
            Sloty Favourites planuje się tylko dla miesięcy, których repertuar jest dopiero w planowaniu. Przejdź do miesiąca jeszcze niezatwierdzonego (strzałką „›").
          </p>
        </div>
      ) : (
        <>
          {/* Dodaj slot */}
          {availableFavs.length > 0 && (
            <SlotCreator month={month} favs={availableFavs} onCreated={load} />
          )}

          {/* Sloty */}
          {slots.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm font-medium" style={{ color: '#7a7068' }}>Brak slotów w tym miesiącu</p>
              <p className="text-xs mt-1" style={{ color: '#a89e92' }}>Dodaj slot dla tytułu Favourite powyżej, aby rozpocząć Etap 1.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              {slots.map(s => (
                <SlotCard
                  key={s.id}
                  slot={s}
                  prod={prodById[s.production_id]}
                  availability={avail[s.id] ?? {}}
                  submittedSet={submitted[s.id] ?? new Set()}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Tworzenie slotu ───────────────────────────────────────────── */
function SlotCreator({ month, favs, onCreated }: { month: string; favs: FavProd[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [prodId, setProdId] = useState('')
  const [start, setStart] = useState(firstOfMonth(month))
  const [end, setEnd] = useState('')
  const [target, setTarget] = useState('4')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setStart(firstOfMonth(month)); setEnd('') }, [month])

  async function create() {
    if (!prodId || !start || !end) return
    setSaving(true)
    await supabase.from('repertoire_slots').insert({
      // month wynika z okna grania (window_start), nie z aktualnie oglądanego miesiąca
      month: start.slice(0, 7), production_id: prodId, window_start: start, window_end: end,
      target_performances: parseInt(target) || 4, status: 'collecting',
    })
    setSaving(false)
    setOpen(false); setProdId(''); setEnd(''); setTarget('4')
    onCreated()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
        style={{ background: '#fff', border: '1px dashed #d6c9b8', color: '#7a2020' }}>
        + Dodaj slot Favourite
      </button>
    )
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Tytuł (Favourite)</label>
          <select value={prodId} onChange={e => setProdId(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c8102e]">
            <option value="">Wybierz tytuł…</option>
            {favs.map(f => <option key={f.id} value={f.id}>{f.title} ({f.cast.length} os.)</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Okno od</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Okno do</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} min={start}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Docelowa liczba grań</label>
          <input type="number" min={1} value={target} onChange={e => setTarget(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Anuluj</button>
        <button onClick={create} disabled={saving || !prodId || !end}
          className="px-5 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-40" style={{ background: '#c8102e' }}>
          {saving ? 'Tworzę…' : 'Utwórz slot'}
        </button>
      </div>
    </div>
  )
}

/* ── Karta slotu + heatmapa ────────────────────────────────────── */
const FEAS_STYLE: Record<DayFeasibility, { bg: string; label: string }> = {
  full:    { bg: '#16a34a', label: 'pełna obsada' },
  warn:    { bg: '#f59e0b', label: '1 brak' },
  blocked: { bg: '#dc2626', label: 'niewykonalny' },
}

function SlotCard({ slot, prod, availability, submittedSet, onChanged }: {
  slot: SlotRow
  prod: FavProd | undefined
  availability: Record<string, Record<string, boolean>>
  submittedSet: Set<string>
  onChanged: () => void
}) {
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [surveyText, setSurveyText] = useState('')
  const [chosen, setChosen] = useState<Set<string>>(new Set(slot.locked_dates ?? []))
  const [saving, setSaving] = useState(false)

  const castSorted = useMemo(() => sortByLastName(prod?.cast ?? []), [prod])
  const dates = windowDates(slot.window_start, slot.window_end)
  const nameOf = (id: string) => castSorted.find(c => c.id === id)?.name ?? '—'
  const coverage = useMemo(
    () => dayCoverage(dates, castSorted.map(c => c.id), availability, nameOf),
    [dates, castSorted, availability],
  )
  const respondedCount = submittedSet.size
  const castCount = castSorted.length

  // Domyślna treść ankiety — edytowalna w modalu przed wysłaniem.
  const defaultSurvey = `Prośba do obsady o zaznaczenie dni, w które mogą zagrać „${prod?.title ?? 'tytuł'}".\nOkno grania: ${fmtDayShort(slot.window_start)} – ${fmtDayShort(slot.window_end)} · docelowo ${slot.target_performances} grań.`

  async function sendInvites() {
    setSending(true)
    await fetch('/api/slots/send-invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: slot.id, message: surveyText.trim() || undefined }),
    })
    setSending(false)
    setConfirmOpen(false)
    onChanged()
  }

  function autoSuggest() {
    setChosen(new Set(suggestDays(coverage, slot.target_performances)))
  }
  function toggleDay(d: string) {
    setChosen(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n })
  }
  async function lockDays() {
    setSaving(true)
    await supabase.from('repertoire_slots')
      .update({ locked_dates: [...chosen].sort(), status: 'planned' })
      .eq('id', slot.id)
    setSaving(false)
    onChanged()
  }

  const feasByDate = useMemo(() => { const m: Record<string, DayFeasibility> = {}; coverage.forEach(c => m[c.date] = c.feasibility); return m }, [coverage])

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3" style={{ borderBottom: '1px solid #f2ede6' }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-red-500">♥</span>
            <span className="text-sm font-semibold" style={{ color: '#1a1410' }}>{prod?.title ?? 'Tytuł'}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${slot.status === 'planned' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {slot.status === 'planned' ? 'Zaplanowany' : 'Zbieranie dostępności'}
            </span>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: '#a89e92' }}>
            {fmtDayShort(slot.window_start)} – {fmtDayShort(slot.window_end)} · max {slot.target_performances} grań · {castCount} os. obsady
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: '#f2ede6', color: '#7a7068' }}>
            Odpowiedzi: {respondedCount}/{castCount}
          </span>
          <button onClick={() => { setSurveyText(defaultSurvey); setConfirmOpen(true) }} disabled={sending || castCount === 0}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: '#1a1410' }}>
            {sending ? 'Wysyłam…' : respondedCount > 0 ? 'Wyślij ponownie' : 'Wyślij ankiety'}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <SendConfirmModal
          title={`Ankieta dostępności — ${prod?.title ?? 'Tytuł'}`}
          channelLabel="Ankieta dostępności (e-mail / SMS)"
          recipients={castSorted.map(c => ({ name: c.name }))}
          content={surveyText}
          onContentChange={setSurveyText}
          note={respondedCount > 0 ? `Część obsady (${respondedCount}/${castCount}) już odpowiedziała — ankieta zostanie wysłana ponownie do wszystkich.` : undefined}
          confirmLabel={`Wyślij ankietę do ${castCount} ${castCount === 1 ? 'osoby' : 'osób'}`}
          sending={sending}
          onConfirm={sendInvites}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {/* Heatmapa */}
      {respondedCount === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: '#a89e92' }}>
          Brak odpowiedzi. Wyślij ankiety do obsady, aby zebrać dostępność.
        </p>
      ) : (
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left font-medium px-2 py-1 sticky left-0 bg-white" style={{ color: '#a89e92' }}>Aktor</th>
                  {dates.map(d => (
                    <th key={d} className="px-1 py-1 font-medium whitespace-nowrap" style={{ color: '#a89e92' }}>
                      {new Date(d + 'T12:00:00').getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {castSorted.map(c => (
                  <tr key={c.id}>
                    <td className="text-left px-2 py-1 sticky left-0 bg-white whitespace-nowrap font-medium" style={{ color: '#1a1410' }}>{c.name}</td>
                    {dates.map(d => {
                      const ans = availability[c.id]?.[d]
                      const bg = ans === true ? '#bbf7d0' : ans === false ? '#fecaca' : '#f3f4f6'
                      return <td key={d} className="px-1 py-1"><div className="w-5 h-5 rounded mx-auto" style={{ background: bg }} title={`${c.name} · ${d} · ${ans === true ? 'może' : ans === false ? 'nie może' : 'brak odpowiedzi'}`} /></td>
                    })}
                  </tr>
                ))}
                {/* Wykonalność dnia */}
                <tr>
                  <td className="text-left px-2 py-1.5 sticky left-0 bg-white font-semibold whitespace-nowrap" style={{ color: '#1a1410' }}>Wykonalność</td>
                  {dates.map(d => {
                    const f = feasByDate[d]
                    const isChosen = chosen.has(d)
                    return (
                      <td key={d} className="px-1 py-1.5">
                        <button onClick={() => toggleDay(d)} title={`${FEAS_STYLE[f].label}${isChosen ? ' · wybrany' : ''}`}
                          className="w-5 h-5 rounded mx-auto flex items-center justify-center text-[9px] font-bold"
                          style={{ background: FEAS_STYLE[f].bg, color: '#fff', outline: isChosen ? '2px solid #1a1410' : 'none', outlineOffset: '1px' }}>
                          {isChosen ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legenda + akcje */}
          <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
            <div className="flex items-center gap-3 text-[11px]" style={{ color: '#7a7068' }}>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#16a34a' }} /> pełna obsada</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#f59e0b' }} /> 1 brak</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#dc2626' }} /> niewykonalny</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={autoSuggest} className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ border: '1px solid #e4ddd4', color: '#7a2020' }}>
                ✨ Stefan: zaproponuj {slot.target_performances} dni
              </button>
              <button onClick={lockDays} disabled={saving || chosen.size === 0}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: '#16a34a' }}>
                {saving ? 'Zapisuję…' : `Zatwierdź dni (${chosen.size})`}
              </button>
            </div>
          </div>

          {chosen.size > 0 && (
            <p className="text-[11px] mt-2" style={{ color: '#7a7068' }}>
              Wybrane grania: {[...chosen].sort().map(d => fmtDayShort(d)).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
