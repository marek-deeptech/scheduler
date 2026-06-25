'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const card = 'bg-white rounded-2xl border border-[#e4ddd4] p-5'
const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]'
const inputStyle = { border: '1px solid #e4ddd4', color: '#3e3830' } as const
const lblCls = 'block text-[10px] font-semibold uppercase tracking-wider mb-1.5'
const lblStyle = { color: '#b8b0a4' } as const

const WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'] // 1..7 (ISO)

// ── a) Sloty Favourites — link do istniejącego edytora ──────────────────────
export function SlotsTab() {
  return (
    <div className={card}>
      <h2 className="text-sm font-semibold mb-1" style={{ color: '#1a1410' }}>Sloty Favourites</h2>
      <p className="text-xs mb-4" style={{ color: '#a89e92' }}>
        Zatwierdzone dni spektakli Favourites brane jako stałe przy generowaniu (gdy warunek włączony).
      </p>
      <Link href="/planning/slots"
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl"
        style={{ background: '#1a1410', color: '#fff' }}>
        <span style={{ color: '#fca5a5' }}>♥</span> Otwórz edytor slotów →
      </Link>
    </div>
  )
}

// ── b) Założenia finansowe — edycja app_settings ────────────────────────────
export function FinanceTab() {
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('key, value').then(({ data }) => {
      const m: Record<string, string> = {}
      for (const r of (data ?? []) as any[]) m[r.key] = String(r.value ?? '')
      setCfg(m); setLoading(false)
    })
  }, [])

  const num = (k: string, def = '') => cfg[k] ?? def
  const setNum = (k: string, v: string) => setCfg(c => ({ ...c, [k]: v }))
  let mix = { normal: 0.7, reduced: 0.2, last_minute: 0.1 }
  try { if (cfg.finance_ticket_mix) mix = { ...mix, ...JSON.parse(cfg.finance_ticket_mix) } } catch {}
  let dark: number[] = []
  try { if (cfg.planning_dark_weekdays) dark = JSON.parse(cfg.planning_dark_weekdays) } catch {}

  function setMix(part: 'normal' | 'reduced' | 'last_minute', v: string) {
    const m = { ...mix, [part]: parseFloat(v) || 0 }
    setCfg(c => ({ ...c, finance_ticket_mix: JSON.stringify(m) }))
  }
  function toggleDark(d: number) {
    const next = dark.includes(d) ? dark.filter(x => x !== d) : [...dark, d].sort()
    setCfg(c => ({ ...c, planning_dark_weekdays: JSON.stringify(next) }))
  }

  async function save() {
    setSaving(true)
    const keys = ['finance_default_attendance', 'finance_weekend_uplift', 'finance_vat_rate',
      'finance_default_fixed_cost', 'finance_ticket_mix', 'planning_stage_monthly_cap', 'planning_dark_weekdays']
    const rows = keys.filter(k => cfg[k] !== undefined).map(k => ({ key: k, value: cfg[k] }))
    await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className={card}><p className="text-sm" style={{ color: '#cec5b8' }}>Ładowanie…</p></div>

  return (
    <div className={card}>
      <h2 className="text-sm font-semibold mb-1" style={{ color: '#1a1410' }}>Założenia finansowe</h2>
      <p className="text-xs mb-4" style={{ color: '#a89e92' }}>Parametry użyte przy wariantach finansowych generowania.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={lblCls} style={lblStyle}>Domyślna frekwencja (0–1)</label>
          <input className={inputCls} style={inputStyle} value={num('finance_default_attendance', '0.75')} onChange={e => setNum('finance_default_attendance', e.target.value)} />
        </div>
        <div>
          <label className={lblCls} style={lblStyle}>Dopłata weekendowa (0–1)</label>
          <input className={inputCls} style={inputStyle} value={num('finance_weekend_uplift', '0.10')} onChange={e => setNum('finance_weekend_uplift', e.target.value)} />
        </div>
        <div>
          <label className={lblCls} style={lblStyle}>Stawka VAT (0–1)</label>
          <input className={inputCls} style={inputStyle} value={num('finance_vat_rate', '0.08')} onChange={e => setNum('finance_vat_rate', e.target.value)} />
        </div>
        <div>
          <label className={lblCls} style={lblStyle}>Koszt stały / spektakl (zł)</label>
          <input className={inputCls} style={inputStyle} value={num('finance_default_fixed_cost', '8000')} onChange={e => setNum('finance_default_fixed_cost', e.target.value)} />
        </div>
        <div>
          <label className={lblCls} style={lblStyle}>Limit spektakli na scenę / mies.</label>
          <input className={inputCls} style={inputStyle} value={num('planning_stage_monthly_cap', '')} placeholder="np. 22" onChange={e => setNum('planning_stage_monthly_cap', e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className={lblCls} style={lblStyle}>Struktura biletów (suma ≈ 1)</label>
        <div className="grid grid-cols-3 gap-3">
          {(['normal', 'reduced', 'last_minute'] as const).map(p => (
            <div key={p}>
              <span className="text-[11px]" style={{ color: '#7a7068' }}>{p === 'normal' ? 'Normalny' : p === 'reduced' ? 'Ulgowy' : 'Last minute'}</span>
              <input className={inputCls} style={inputStyle} value={String(mix[p])} onChange={e => setMix(p, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className={lblCls} style={lblStyle}>Dni „ciemne" (bez spektakli)</label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((w, i) => {
            const d = i + 1
            const on = dark.includes(d)
            return (
              <button key={d} type="button" onClick={() => toggleDark(d)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                style={on ? { background: '#1a1410', color: '#fff' } : { background: '#f2ede6', color: '#7a7068' }}>
                {w}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-xl disabled:opacity-50" style={{ background: '#c8102e', color: '#fff' }}>
          {saving ? 'Zapisuję…' : 'Zapisz założenia'}
        </button>
        {saved && <span className="text-xs font-medium" style={{ color: '#15803d' }}>✓ Zapisano</span>}
      </div>
    </div>
  )
}

// ── c) Dostępność aktorów CORE — read-only + link do Aktorów ────────────────
export function CoreTab({ month }: { month: string }) {
  const [rows, setRows] = useState<{ id: string; name: string; days: string[] }[] | null>(null)
  const [noCol, setNoCol] = useState(false)

  useEffect(() => {
    (async () => {
      let r = await supabase.from('artists').select('id, name, is_core').eq('is_core', true).order('name')
      if (r.error) { setNoCol(true); setRows([]); return }
      const core = (r.data ?? []) as any[]
      if (!core.length) { setRows([]); return }
      const ids = core.map(a => a.id)
      const start = `${month}-01T00:00:00`, end = `${month}-31T23:59:59`
      const { data: av } = await supabase.from('availabilities').select('artist_id, start_time, end_time')
        .in('artist_id', ids).lte('start_time', end).gte('end_time', start)
      const byArtist: Record<string, string[]> = {}
      for (const a of (av ?? []) as any[]) {
        (byArtist[a.artist_id] ??= []).push(`${a.start_time.slice(0, 10)} – ${a.end_time.slice(0, 10)}`)
      }
      setRows(core.map(a => ({ id: a.id, name: a.name, days: byArtist[a.id] ?? [] })))
    })()
  }, [month])

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-semibold" style={{ color: '#1a1410' }}>Dostępność aktorów CORE</h2>
        <Link href="/artists" className="text-xs font-medium hover:underline" style={{ color: '#7a2020' }}>Zarządzaj w Aktorzy →</Link>
      </div>
      <p className="text-xs mb-4" style={{ color: '#a89e92' }}>
        Aktorzy oznaczeni jako CORE (w panelu edycji aktora). Gdy warunek włączony, ich dni niedostępne w wybranym miesiącu są twardymi blokadami.
      </p>
      {noCol && (
        <div className="px-4 py-3 rounded-xl text-xs mb-3" style={{ background: '#fdf6e3', border: '1px solid #f0e0b0', color: '#7a5c10' }}>
          Brak kolumny <code>is_core</code> — uruchom <b>supabase-migration-core.sql</b> w Supabase.
        </div>
      )}
      {rows === null ? (
        <p className="text-sm" style={{ color: '#cec5b8' }}>Ładowanie…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm italic" style={{ color: '#bdb4a8' }}>Brak aktorów CORE — oznacz aktora w panelu edycji aktora.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: '#f2ede6' }}>
          {rows.map(a => (
            <div key={a.id} className="py-2.5 flex items-start justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: '#1a1410' }}>★ {a.name}</span>
              <span className="text-xs text-right" style={{ color: a.days.length ? '#b45309' : '#a89e92' }}>
                {a.days.length ? a.days.join(', ') : 'pełna dostępność'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── d) Założenia dodatkowe — per teatr (planning_assumptions) ────────────────
export function ExtraTab({ theatreId, theatreName }: { theatreId: string | null; theatreName: string }) {
  const [items, setItems] = useState<{ id: string; text: string; active: boolean }[] | null>(null)
  const [noTable, setNoTable] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!theatreId) { setItems([]); return }
    const r = await supabase.from('planning_assumptions').select('id, text, active').eq('theatre_id', theatreId).order('created_at')
    if (r.error) { setNoTable(true); setItems([]); return }
    setItems((r.data ?? []) as any[])
  }
  useEffect(() => { setItems(null); setNoTable(false); load() }, [theatreId])

  async function add() {
    if (!text.trim() || !theatreId) return
    setBusy(true)
    await supabase.from('planning_assumptions').insert({ theatre_id: theatreId, text: text.trim(), active: true })
    setText(''); setBusy(false); load()
  }
  async function toggle(id: string, active: boolean) { await supabase.from('planning_assumptions').update({ active: !active }).eq('id', id); load() }
  async function remove(id: string) { await supabase.from('planning_assumptions').delete().eq('id', id); load() }

  return (
    <div className={card}>
      <h2 className="text-sm font-semibold mb-1" style={{ color: '#1a1410' }}>Założenia dodatkowe</h2>
      <p className="text-xs mb-4" style={{ color: '#a89e92' }}>
        Reguły zapisywane osobno dla <b style={{ color: '#7a2020' }}>{theatreName || 'tego teatru'}</b> (np. „Janda nie gra spektakli 24 grudnia"). Uwzględniane przy generowaniu, gdy warunek włączony.
      </p>
      {noTable && (
        <div className="px-4 py-3 rounded-xl text-xs mb-3" style={{ background: '#fdf6e3', border: '1px solid #f0e0b0', color: '#7a5c10' }}>
          Brak tabeli <code>planning_assumptions</code> — uruchom <b>supabase-migration-planning-assumptions.sql</b> w Supabase.
        </div>
      )}
      <div className="flex gap-2 mb-3">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="np. Pani Janda nie gra 24 grudnia…" className={inputCls} style={inputStyle} disabled={noTable || !theatreId} />
        <button onClick={add} disabled={busy || !text.trim() || noTable || !theatreId}
          className="px-4 py-2 text-sm font-semibold rounded-xl disabled:opacity-50 shrink-0" style={{ background: '#c8102e', color: '#fff' }}>+ Dodaj</button>
      </div>
      {items === null ? (
        <p className="text-sm" style={{ color: '#cec5b8' }}>Ładowanie…</p>
      ) : items.length === 0 ? (
        <p className="text-sm italic" style={{ color: '#bdb4a8' }}>Brak założeń dla tego teatru.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: '#f2ede6' }}>
          {items.map(it => (
            <div key={it.id} className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm" style={{ color: it.active ? '#1a1410' : '#bdb4a8', textDecoration: it.active ? 'none' : 'line-through' }}>{it.text}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggle(it.id, it.active)} className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                  style={it.active ? { background: '#dcfce7', color: '#15803d' } : { background: '#f2ede6', color: '#a89e92' }}>
                  {it.active ? 'Aktywne' : 'Wyłączone'}
                </button>
                <button onClick={() => remove(it.id)} className="text-[11px] font-medium hover:underline" style={{ color: '#9e0c24' }}>Usuń</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
