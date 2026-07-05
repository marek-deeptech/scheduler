'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

// ── Pomocnicze ────────────────────────────────────────────────────────────────

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
function monthOptions(n = 8): { value: string; label: string }[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { value, label: `${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}` }
  })
}
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

const STATUS_CODES: Record<string, string> = {
  d: 'Dostępny', u: 'Urlop', n: 'Niedostępny', '?': 'Niepewny', w: 'Dostępny tylko w Warszawie',
}
const VALID_STATUSES = new Set(['Dostępny', 'Dostępny tylko w Warszawie', 'Niepewny', 'Niedostępny', 'Urlop'])
function codeToStatus(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  // Zgodność wstecz: dawny kod „C"/„Choroba" → „Niedostępny" (bez danych o zdrowiu)
  if (t.toLowerCase() === 'c' || t.toLowerCase() === 'choroba') return 'Niedostępny'
  if (STATUS_CODES[t.toLowerCase()]) return STATUS_CODES[t.toLowerCase()]
  const hit = [...VALID_STATUSES].find(s => s.toLowerCase() === t.toLowerCase())
  return hit ?? null
}

function fmtDate(v: unknown): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const s = (v ?? '').toString().trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/.exec(s) // DD.MM.YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
function foldPl(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
}
function findKey(obj: Record<string, unknown>, needles: string[]): string | undefined {
  return Object.keys(obj).find(k => needles.some(n => foldPl(k).includes(n)))
}

// ── Wynik importu ─────────────────────────────────────────────────────────────

interface ImportResult { ok: boolean; kind: 'availability' | 'schedule'; text: string; warns: string[]; proposalId?: string }

function ResultBox({ r }: { r: ImportResult }) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm" style={{ background: r.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${r.ok ? '#bbf7d0' : '#fecaca'}` }}>
      <p className="font-semibold" style={{ color: r.ok ? '#15803d' : '#b91c1c' }}>{r.ok ? '✓ ' : '✕ '}{r.text}</p>
      {r.warns.map((w, i) => <p key={i} className="text-xs mt-1" style={{ color: '#a16207' }}>⚠ {w}</p>)}
      {r.proposalId && (
        <Link href={`/planning/${r.proposalId}`} className="inline-block mt-2 text-xs font-semibold underline" style={{ color: '#1d4ed8' }}>
          Otwórz zaimportowaną propozycję →
        </Link>
      )}
    </div>
  )
}

// ── Główny komponent ─────────────────────────────────────────────────────────

export default function ExcelImportTab({
  theatreId, theatreName, onScheduleImported,
}: {
  theatreId: string | null
  theatreName: string
  onScheduleImported?: () => void
}) {
  const months = useMemo(() => monthOptions(8), [])
  const [availMonth, setAvailMonth] = useState(months[1]?.value ?? months[0].value)
  const [schedMonth, setSchedMonth] = useState(months[1]?.value ?? months[0].value)
  const [artists, setArtists] = useState<string[]>([])
  const [busy, setBusy] = useState<null | 'avail' | 'sched'>(null)
  const [availResult, setAvailResult] = useState<ImportResult | null>(null)
  const [schedResult, setSchedResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    supabase.from('artists').select('name').order('name').then(({ data }) => {
      setArtists(((data ?? []) as any[]).map(a => a.name).filter(Boolean))
    })
  }, [])

  // ── Szablony do pobrania ──
  function downloadAvailTemplate() {
    const n = daysInMonth(availMonth)
    const header = ['Aktor', ...Array.from({ length: n }, (_, i) => i + 1)]
    const rows = (artists.length ? artists : ['Jan Kowalski', 'Anna Nowak']).map(name => [name])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [{ wch: 24 }, ...Array.from({ length: n }, () => ({ wch: 3 }))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Zajętości')
    XLSX.writeFile(wb, `zajetosci_${availMonth}.xlsx`)
  }
  function downloadSchedTemplate() {
    const ex = [
      ['Data', 'Godz.', 'Tytuł', 'Typ', 'Scena'],
      [`${schedMonth}-03`, '19:00-21:00', artists.length ? '' : 'Lalka', 'Spektakl', 'Duża'],
      [`${schedMonth}-04`, '11:00-13:00', artists.length ? '' : 'Lalka', 'Próba', 'Duża'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(ex)
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 12 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rozkład')
    XLSX.writeFile(wb, `rozklad_${schedMonth}.xlsx`)
  }

  // ── Import zajętości (macierz aktorzy × dni) ──
  async function importAvailability(file: File) {
    setBusy('avail'); setAvailResult(null)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false })
      if (aoa.length < 2) throw new Error('Arkusz jest pusty.')
      const [y, mm] = availMonth.split('-')
      const header = aoa[0]
      const dayCols: { col: number; day: number }[] = []
      for (let c = 1; c < header.length; c++) {
        const h = header[c]
        let day = 0
        if (h instanceof Date) day = h.getDate()
        else day = parseInt((h ?? '').toString().replace(/[^\d]/g, ''), 10)
        if (day >= 1 && day <= 31) dayCols.push({ col: c, day })
      }
      if (dayCols.length === 0) throw new Error('Nie rozpoznano kolumn z dniami w nagłówku.')
      const entries: { actor: string; date: string; status: string }[] = []
      const badCodes = new Set<string>()
      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r]; if (!row) continue
        const actor = (row[0] ?? '').toString().trim(); if (!actor) continue
        for (const { col, day } of dayCols) {
          const cell = (row[col] ?? '').toString().trim(); if (!cell) continue
          const status = codeToStatus(cell)
          if (!status) { badCodes.add(cell); continue }
          entries.push({ actor, date: `${y}-${mm}-${String(day).padStart(2, '0')}`, status })
        }
      }
      if (entries.length === 0) throw new Error('Brak wpisów do zaimportowania (puste komórki = bez zmian).')
      const res = await fetch('/api/import/availability', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }),
      })
      const j = await res.json()
      if (j.error) throw new Error(j.error)
      const warns: string[] = []
      if (j.unmatchedActors?.length) warns.push(`Niedopasowani aktorzy (pominięci): ${j.unmatchedActors.join(', ')}`)
      if (badCodes.size) warns.push(`Nieznane kody statusu (pominięte): ${[...badCodes].join(', ')}`)
      if (j.invalidStatuses?.length) warns.push(`Nieprawidłowe statusy: ${j.invalidStatuses.join(', ')}`)
      setAvailResult({ ok: true, kind: 'availability', text: `Zaktualizowano zajętości: ${j.entriesWritten} wpisów dla ${j.actorsMatched} aktorów.`, warns })
    } catch (e) {
      setAvailResult({ ok: false, kind: 'availability', text: e instanceof Error ? e.message : 'Błąd importu', warns: [] })
    } finally { setBusy(null) }
  }

  // ── Import rozkładu (spektakle + próby) ──
  async function importSchedule(file: File) {
    setBusy('sched'); setSchedResult(null)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      if (json.length === 0) throw new Error('Arkusz jest pusty.')
      const k0 = json[0]
      const kDate  = findKey(k0, ['data', 'date'])
      const kTime  = findKey(k0, ['godz', 'czas', 'time'])
      const kStart = findKey(k0, ['od', 'start'])
      const kEnd   = findKey(k0, ['do', 'koniec', 'end'])
      const kTitle = findKey(k0, ['tytul', 'title', 'spektakl'])
      const kType  = findKey(k0, ['typ', 'type', 'rodzaj'])
      const kScene = findKey(k0, ['scena', 'sala', 'scene'])
      if (!kDate || !kTitle) throw new Error('Brak wymaganych kolumn: Data i Tytuł.')
      const rows: any[] = []
      let badDates = 0
      for (const row of json) {
        const date = fmtDate(row[kDate])
        if (!date) { if ((row[kDate] ?? '').toString().trim()) badDates++; continue }
        let start = '', end = ''
        if (kTime && String(row[kTime] ?? '').trim()) {
          const parts = String(row[kTime]).split(/[-–—]/)
          start = (parts[0] ?? '').trim(); end = (parts[1] ?? '').trim()
        }
        if (kStart && String(row[kStart] ?? '').trim()) start = String(row[kStart]).trim()
        if (kEnd && String(row[kEnd] ?? '').trim()) end = String(row[kEnd]).trim()
        rows.push({
          date, start, end,
          title: (row[kTitle] ?? '').toString().trim(),
          type: kType ? (row[kType] ?? '').toString().trim() : '',
          scene: kScene ? (row[kScene] ?? '').toString().trim() : '',
        })
      }
      if (rows.length === 0) throw new Error('Brak wierszy z poprawną datą.')
      const res = await fetch('/api/import/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: schedMonth, theatreId, label: `Import Excel — ${file.name.replace(/\.xlsx?$/i, '')}`, rows }),
      })
      const j = await res.json()
      if (j.error) throw new Error(j.error)
      const warns: string[] = []
      if (badDates) warns.push(`Pominięto ${badDates} wierszy bez poprawnej daty.`)
      if (j.skipped) warns.push(`Pominięto ${j.skipped} wierszy (inny miesiąc / brak tytułu).`)
      if (j.unmatchedTitles?.length) warns.push(`Tytuły bez dopasowania do bazy (zapisane jako tekst): ${j.unmatchedTitles.join(', ')}`)
      setSchedResult({ ok: true, kind: 'schedule', text: `Utworzono propozycję (draft): ${j.rowsImported} pozycji.`, warns, proposalId: j.proposalId })
      onScheduleImported?.()
    } catch (e) {
      setSchedResult({ ok: false, kind: 'schedule', text: e instanceof Error ? e.message : 'Błąd importu', warns: [] })
    } finally { setBusy(null) }
  }

  const selectCls = 'w-full sm:w-52 rounded-xl px-3 py-2.5 text-sm'
  const selectStyle = { border: '1px solid #e4ddd4', color: '#3e3830' } as const

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Karta 1: Zajętości aktorów ── */}
      <div className="bg-white rounded-2xl border border-[#e4ddd4] p-5 space-y-4">
        <div>
          <p className="text-sm font-bold" style={{ color: '#1a1410' }}>1. Zajętości aktorów</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#7a7068' }}>
            Macierz <b>aktorzy × dni</b>. W komórce kod: <b>U</b>=Urlop, <b>N</b>=Niedostępny,
            <b> ?</b>=Niepewny, <b>W</b>=tylko&nbsp;Warszawa, <b>D</b>=Dostępny. Puste = bez zmian.
            Po wczytaniu zajętości aktorów są od razu aktualizowane.
          </p>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Miesiąc (dla numerów dni)</label>
          <select value={availMonth} onChange={e => setAvailMonth(e.target.value)} className={selectCls} style={selectStyle}>
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
            style={{ background: busy === 'avail' ? '#9ca3af' : '#1a1410', color: '#fff' }}>
            {busy === 'avail' ? 'Wczytuję…' : 'Wczytaj plik .xlsx'}
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy !== null}
              onChange={e => { const f = e.target.files?.[0]; if (f) importAvailability(f); e.target.value = '' }} />
          </label>
          <button onClick={downloadAvailTemplate} type="button"
            className="px-4 py-2 text-xs font-semibold rounded-xl transition-colors"
            style={{ border: '1px solid #e4ddd4', color: '#7a7068', background: '#fff' }}>
            Pobierz szablon
          </button>
        </div>
        {availResult && <ResultBox r={availResult} />}
      </div>

      {/* ── Karta 2: Roboczy rozkład spektakli i prób ── */}
      <div className="bg-white rounded-2xl border border-[#e4ddd4] p-5 space-y-4">
        <div>
          <p className="text-sm font-bold" style={{ color: '#1a1410' }}>2. Roboczy rozkład spektakli i prób</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#7a7068' }}>
            Kolumny: <b>Data</b>, <b>Godz.</b> (np. 19:00-21:00), <b>Tytuł</b>, <b>Typ</b> (Spektakl / Próba),
            <b> Scena</b>. Tworzy roboczą <b>propozycję</b> repertuaru na wybrany miesiąc
            {theatreName ? <> dla teatru <b>{theatreName}</b></> : null} — wchodzi w proces Zatwierdzenie → Konsultacje → Sprzedaż.
          </p>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Miesiąc propozycji</label>
          <select value={schedMonth} onChange={e => setSchedMonth(e.target.value)} className={selectCls} style={selectStyle}>
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
            style={{ background: busy === 'sched' ? '#9ca3af' : '#1a1410', color: '#fff' }}>
            {busy === 'sched' ? 'Wczytuję…' : 'Wczytaj plik .xlsx'}
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy !== null}
              onChange={e => { const f = e.target.files?.[0]; if (f) importSchedule(f); e.target.value = '' }} />
          </label>
          <button onClick={downloadSchedTemplate} type="button"
            className="px-4 py-2 text-xs font-semibold rounded-xl transition-colors"
            style={{ border: '1px solid #e4ddd4', color: '#7a7068', background: '#fff' }}>
            Pobierz szablon
          </button>
        </div>
        {schedResult && <ResultBox r={schedResult} />}
      </div>
    </div>
  )
}
