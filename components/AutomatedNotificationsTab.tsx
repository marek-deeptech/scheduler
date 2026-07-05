'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Rule {
  id: string; name: string; active: boolean
  trigger_type: 'weekly' | 'monthly' | 'before_event'
  weekday: number | null; day_of_month: number | null
  event_type: string | null; days_before: number | null
  scope: string; event_types: string[]
  audience: string; audience_ref: any; personalized: boolean
  channel: 'email' | 'sms' | 'both'
  subject: string | null; body: string | null; last_run_at: string | null
}

const WEEKDAYS = ['niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę']
const AUDIENCE_LABEL: Record<string, string> = {
  all_cast: 'Cała obsada', team: 'Zespół', core: 'CORE', production: 'Obsada tytułu',
  event_cast: 'Obsada wydarzenia', custom: 'Wybrani', technique: 'Technika', sales: 'Sprzedaż',
}
const CHANNEL_LABEL: Record<string, string> = { email: 'E-mail', sms: 'SMS', both: 'E-mail + SMS' }
const CATS = [['spektakle', 'Spektakle'], ['proby', 'Próby'], ['premiery', 'Premiery']] as const

function triggerSummary(r: Rule): string {
  if (r.trigger_type === 'weekly')  return `Co ${WEEKDAYS[r.weekday ?? 1]}`
  if (r.trigger_type === 'monthly') return `Co miesiąc, ${r.day_of_month ?? 1}. dnia`
  return `${r.days_before ?? 7} dni przed: ${r.event_type ?? 'Premiera'}`
}

const EMPTY: Partial<Rule> = {
  name: '', active: true, trigger_type: 'weekly', weekday: 1, day_of_month: 1,
  event_type: 'Premiera', days_before: 7, scope: 'this_week', event_types: [],
  audience: 'all_cast', personalized: true, channel: 'email', subject: '', body: '',
}

export default function AutomatedNotificationsTab() {
  const [rules, setRules] = useState<Rule[]>([])
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [prods, setProds] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Rule> | null>(null)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: t }, { data: p }] = await Promise.all([
      supabase.from('notification_rules').select('*').order('created_at'),
      supabase.from('teams').select('id, name').order('name'),
      supabase.from('productions').select('id, title').order('title'),
    ])
    setRules((r ?? []) as Rule[]); setTeams((t ?? []) as any); setProds((p ?? []) as any)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggleActive(rule: Rule) {
    await supabase.from('notification_rules').update({ active: !rule.active }).eq('id', rule.id)
    load()
  }
  async function runTest(rule: Rule) {
    setBusyId(rule.id); setTestMsg(null)
    try {
      const res = await fetch('/api/notifications/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruleId: rule.id }) })
      const j = await res.json()
      if (j.error) throw new Error(j.error)
      setTestMsg(`„${rule.name}": wysłano testowo ${j.sent} wiadomości${j.testEmail ? ` na ${j.testEmail}` : ''}.`)
    } catch (e) { setTestMsg(e instanceof Error ? e.message : 'Błąd testu') }
    finally { setBusyId(null) }
  }
  async function save(form: Partial<Rule>) {
    const ref = form.audience === 'team' ? { team_id: (form as any)._team_id }
      : form.audience === 'production' ? { production_id: (form as any)._prod_id } : null
    const payload: any = {
      name: form.name, active: form.active, trigger_type: form.trigger_type,
      weekday: form.trigger_type === 'weekly' ? form.weekday : null,
      day_of_month: form.trigger_type === 'monthly' ? form.day_of_month : null,
      event_type: form.trigger_type === 'before_event' ? form.event_type : null,
      days_before: form.trigger_type === 'before_event' ? form.days_before : null,
      scope: form.trigger_type === 'before_event' ? 'event' : form.scope,
      event_types: form.event_types ?? [], audience: form.audience, audience_ref: ref,
      personalized: form.personalized, channel: form.channel, subject: form.subject, body: form.body,
    }
    if ((form as any).id) await supabase.from('notification_rules').update(payload).eq('id', (form as any).id)
    else await supabase.from('notification_rules').insert(payload)
    setEditing(null); load()
  }
  async function remove(id: string) {
    if (!confirm('Usunąć tę regułę?')) return
    await supabase.from('notification_rules').delete().eq('id', id); load()
  }

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: '#a89e92' }}>Ładowanie…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs" style={{ color: '#7a7068' }}>
          Reguły wysyłane automatycznie (dziennie o 08:00). Aktorzy dostają swój plan; działy — powiadomienia.
        </p>
        <button onClick={() => setEditing({ ...EMPTY })} className="px-3.5 py-2 text-xs font-semibold rounded-xl" style={{ background: '#1a1410', color: '#fff' }}>+ Nowa reguła</button>
      </div>

      {testMsg && <div className="rounded-xl px-4 py-2.5 text-xs" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>{testMsg}</div>}

      <div className="space-y-2">
        {rules.length === 0 && <p className="text-sm italic py-6 text-center" style={{ color: '#a89e92' }}>Brak reguł — dodaj pierwszą.</p>}
        {rules.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-[#e4ddd4] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold" style={{ color: '#1a1410' }}>{r.name}</span>
                {!r.active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#f2ede6', color: '#a89e92' }}>wyłączona</span>}
                {r.personalized && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#6d28d9' }}>personalizowana</span>}
              </div>
              <p className="text-xs mt-1" style={{ color: '#7a7068' }}>
                {triggerSummary(r)} · {AUDIENCE_LABEL[r.audience] ?? r.audience} · {CHANNEL_LABEL[r.channel]}
                {r.event_types?.length ? ` · ${r.event_types.join(', ')}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => runTest(r)} disabled={busyId === r.id} className="px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50" style={{ border: '1px solid #e4ddd4', color: '#7a7068' }}>{busyId === r.id ? 'Wysyłam…' : 'Testuj'}</button>
              <button onClick={() => setEditing({ ...r, _team_id: r.audience_ref?.team_id, _prod_id: r.audience_ref?.production_id } as any)} className="px-3 py-1.5 text-xs font-medium rounded-lg" style={{ border: '1px solid #e4ddd4', color: '#7a7068' }}>Edytuj</button>
              <button onClick={() => toggleActive(r)} className="px-3 py-1.5 text-xs font-semibold rounded-lg" style={r.active ? { background: '#dcfce7', color: '#15803d' } : { background: '#1a1410', color: '#fff' }}>{r.active ? 'Wł.' : 'Wył.'}</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <RuleEditor form={editing} teams={teams} prods={prods} onCancel={() => setEditing(null)} onSave={save} onDelete={remove} />
      )}
    </div>
  )
}

function RuleEditor({ form: initial, teams, prods, onCancel, onSave, onDelete }: {
  form: Partial<Rule>; teams: { id: string; name: string }[]; prods: { id: string; title: string }[]
  onCancel: () => void; onSave: (f: Partial<Rule>) => void; onDelete: (id: string) => void
}) {
  const [f, setF] = useState<any>(initial)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  const toggleCat = (c: string) => set('event_types', (f.event_types ?? []).includes(c) ? f.event_types.filter((x: string) => x !== c) : [...(f.event_types ?? []), c])
  const inp = 'w-full rounded-xl px-3 py-2 text-sm'
  const inpStyle = { border: '1px solid #e4ddd4', color: '#3e3830' } as const
  const lbl = 'block text-[10px] font-semibold uppercase tracking-wider mb-1'

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-5 space-y-3">
        <h2 className="text-base font-bold" style={{ color: '#1a1410' }}>{f.id ? 'Edytuj regułę' : 'Nowa reguła'}</h2>

        <div><label className={lbl} style={{ color: '#b8b0a4' }}>Nazwa</label><input className={inp} style={inpStyle} value={f.name ?? ''} onChange={e => set('name', e.target.value)} /></div>

        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl} style={{ color: '#b8b0a4' }}>Wyzwalacz</label>
            <select className={inp} style={inpStyle} value={f.trigger_type} onChange={e => set('trigger_type', e.target.value)}>
              <option value="weekly">Co tydzień</option><option value="monthly">Co miesiąc</option><option value="before_event">Przed wydarzeniem</option>
            </select></div>
          {f.trigger_type === 'weekly' && (
            <div><label className={lbl} style={{ color: '#b8b0a4' }}>Dzień</label>
              <select className={inp} style={inpStyle} value={f.weekday} onChange={e => set('weekday', +e.target.value)}>
                {['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'].map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select></div>
          )}
          {f.trigger_type === 'monthly' && (
            <div><label className={lbl} style={{ color: '#b8b0a4' }}>Dzień miesiąca (1–28)</label><input type="number" min={1} max={28} className={inp} style={inpStyle} value={f.day_of_month} onChange={e => set('day_of_month', +e.target.value)} /></div>
          )}
          {f.trigger_type === 'before_event' && (
            <div><label className={lbl} style={{ color: '#b8b0a4' }}>Dni przed</label><input type="number" min={0} className={inp} style={inpStyle} value={f.days_before} onChange={e => set('days_before', +e.target.value)} /></div>
          )}
        </div>

        {f.trigger_type === 'before_event' && (
          <div><label className={lbl} style={{ color: '#b8b0a4' }}>Typ wydarzenia</label><input className={inp} style={inpStyle} value={f.event_type ?? ''} onChange={e => set('event_type', e.target.value)} placeholder="Premiera" /></div>
        )}

        {f.trigger_type !== 'before_event' && (
          <div><label className={lbl} style={{ color: '#b8b0a4' }}>Zakres treści</label>
            <select className={inp} style={inpStyle} value={f.scope} onChange={e => set('scope', e.target.value)}>
              <option value="this_week">Ten tydzień</option><option value="next_week">Przyszły tydzień</option>
              <option value="this_month">Ten miesiąc</option><option value="next_month">Przyszły miesiąc</option>
            </select></div>
        )}

        <div><label className={lbl} style={{ color: '#b8b0a4' }}>Uwzględnij (puste = wszystko)</label>
          <div className="flex gap-2">{CATS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => toggleCat(k)} className="px-3 py-1.5 text-xs font-semibold rounded-lg" style={(f.event_types ?? []).includes(k) ? { background: '#1a1410', color: '#fff' } : { border: '1px solid #e4ddd4', color: '#a89e92' }}>{l}</button>
          ))}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl} style={{ color: '#b8b0a4' }}>Do kogo</label>
            <select className={inp} style={inpStyle} value={f.audience} onChange={e => set('audience', e.target.value)}>
              {Object.entries(AUDIENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div><label className={lbl} style={{ color: '#b8b0a4' }}>Kanał</label>
            <select className={inp} style={inpStyle} value={f.channel} onChange={e => set('channel', e.target.value)}>
              <option value="email">E-mail</option><option value="sms">SMS</option><option value="both">E-mail + SMS</option>
            </select></div>
        </div>
        {f.audience === 'team' && (
          <div><label className={lbl} style={{ color: '#b8b0a4' }}>Zespół</label><select className={inp} style={inpStyle} value={f._team_id ?? ''} onChange={e => set('_team_id', e.target.value)}><option value="">—</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        )}
        {f.audience === 'production' && (
          <div><label className={lbl} style={{ color: '#b8b0a4' }}>Tytuł</label><select className={inp} style={inpStyle} value={f._prod_id ?? ''} onChange={e => set('_prod_id', e.target.value)}><option value="">—</option>{prods.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
        )}

        <label className="flex items-center gap-2 text-sm" style={{ color: '#3e3830' }}>
          <input type="checkbox" checked={!!f.personalized} onChange={e => set('personalized', e.target.checked)} /> Personalizowana (każdy dostaje swój grafik)
        </label>

        <div><label className={lbl} style={{ color: '#b8b0a4' }}>Temat</label><input className={inp} style={inpStyle} value={f.subject ?? ''} onChange={e => set('subject', e.target.value)} /></div>
        <div><label className={lbl} style={{ color: '#b8b0a4' }}>Treść <span className="normal-case font-normal" style={{ color: '#cbb' }}>· zmienne: {'{name} {weekLabel} {monthLabel} {eventTitle} {date} {count}'}</span></label>
          <textarea rows={3} className={inp} style={inpStyle} value={f.body ?? ''} onChange={e => set('body', e.target.value)} /></div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {f.id ? <button onClick={() => onDelete(f.id)} className="text-xs font-medium" style={{ color: '#c8102e' }}>Usuń</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-xl" style={{ border: '1px solid #e4ddd4', color: '#7a7068' }}>Anuluj</button>
            <button onClick={() => onSave(f)} disabled={!f.name?.trim()} className="px-5 py-2 text-sm font-semibold rounded-xl disabled:opacity-50" style={{ background: '#16a34a', color: '#fff' }}>Zapisz</button>
          </div>
        </div>
      </div>
    </div>
  )
}
