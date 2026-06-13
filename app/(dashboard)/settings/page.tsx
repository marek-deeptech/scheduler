'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Theatre   { id: string; name: string }
interface Room      { id: string; name: string; theatre_id: string }
interface Team      { id: string; name: string }
interface EventType { id: string; name: string }

// ─── Icons ────────────────────────────────────────────────────────────────────

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
)

// ─── Reusable editable row ────────────────────────────────────────────────────

function EditableRow({ name, sub, onSave, onDelete }: {
  name: string
  sub?: string
  onSave: (newName: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(name)
  const [busy, setBusy]       = useState(false)

  async function save() {
    const v = val.trim()
    if (!v || v === name) { cancel(); return }
    setBusy(true)
    await onSave(v)
    setBusy(false)
    setEditing(false)
  }

  function cancel() { setEditing(false); setVal(name) }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
        />
        <button onClick={save} disabled={busy}
          className="text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: '#1a1410', color: '#fff' }}>
          {busy ? '…' : 'Zapisz'}
        </button>
        <button onClick={cancel}
          className="text-xs px-2 py-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
          Anuluj
        </button>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 rounded-xl transition-colors">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-800 font-medium">{name}</span>
        {sub && <span className="text-xs text-gray-500 ml-2">{sub}</span>}
      </div>
      <div className="flex gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button title="Zmień nazwę" onClick={() => setEditing(true)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <PencilIcon />
        </button>
        <button title="Usuń" onClick={onDelete}
          className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors">
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold" style={{ color: '#1a1410' }}>{title}</h2>
        {description && <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-3 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#b8b0a4' }}>{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// ─── Template variable pills ──────────────────────────────────────────────────

const TEMPLATE_VARS = [
  '{name}', '{eventTitle}', '{date}', '{startTime}', '{endTime}',
  '{confirmLink}', '{declineLink}', '{maybeLink}',
]

// ─── Notifications Tab ────────────────────────────────────────────────────────

type FieldKey = 'notification_email_subject' | 'notification_email_intro' | 'notification_sms' | 'coordinator_email'

interface SettingField {
  key: FieldKey
  label: string
  type: 'input' | 'textarea'
  rows?: number
  smsLimit?: boolean
  noVars?: boolean
}

const FIELDS: SettingField[] = [
  { key: 'coordinator_email',          label: 'Email koordynatora (alarmy o chorobie i zmianach dostępności)', type: 'input', noVars: true },
  { key: 'notification_email_subject', label: 'Temat emaila',  type: 'input' },
  { key: 'notification_email_intro',   label: 'Wstęp emaila',  type: 'textarea', rows: 3 },
  { key: 'notification_sms',           label: 'Treść SMS',     type: 'textarea', rows: 4, smsLimit: true },
]

function TemplateField({
  field,
  value,
  onChange,
}: {
  field: SettingField
  value: string
  onChange: (val: string) => void
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy]   = useState(false)

  function insertVar(v: string) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart ?? value.length
    const end   = el.selectionEnd   ?? value.length
    const next  = value.slice(0, start) + v + value.slice(end)
    onChange(next)
    // restore cursor after React re-render
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + v.length, start + v.length)
    }, 0)
  }

  async function save() {
    setBusy(true)
    await supabase
      .from('app_settings')
      .upsert({ key: field.key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const over160 = field.smsLimit && value.length > 160

  return (
    <div className="px-5 py-4 border-b border-gray-100 last:border-b-0">
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{field.label}</label>

      {field.type === 'input' ? (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
        />
      ) : (
        <div className="relative">
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            value={value}
            rows={field.rows ?? 3}
            onChange={e => onChange(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e] resize-none"
          />
          {field.smsLimit && (
            <span className={`absolute bottom-2 right-2.5 text-[11px] font-mono ${over160 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
              {value.length}/160
            </span>
          )}
        </div>
      )}

      {/* Variable pills */}
      <div className={`flex flex-wrap gap-1.5 mt-2 ${field.noVars ? 'hidden' : ''}`}>
        {TEMPLATE_VARS.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => insertVar(v)}
            className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 hover:text-gray-700 transition-colors font-mono"
          >
            {v}
          </button>
        ))}
      </div>

      {/* Save row */}
      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
          style={{ background: '#1a1410', color: '#fff' }}
        >
          {busy ? '…' : 'Zapisz'}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">✓ Zapisano</span>}
      </div>
    </div>
  )
}

function NotificationsTab() {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    coordinator_email:          '',
    notification_email_subject: '',
    notification_email_intro:   '',
    notification_sms:           '',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['coordinator_email', 'notification_email_subject', 'notification_email_intro', 'notification_sms'])
      if (data) {
        const map: Partial<Record<FieldKey, string>> = {}
        for (const row of data) {
          map[row.key as FieldKey] = row.value ?? ''
        }
        setValues(prev => ({ ...prev, ...map }))
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <Section title="Powiadomienia" description="Szablony wiadomości email i SMS">
        <div className="px-5 py-6 text-sm text-gray-400">Ładowanie…</div>
      </Section>
    )
  }

  return (
    <Section title="Powiadomienia" description="Szablony wiadomości email i SMS wysyłanych do artystów">
      {FIELDS.map(field => (
        <TemplateField
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={val => setValues(prev => ({ ...prev, [field.key]: val }))}
        />
      ))}
    </Section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [theatres,   setTheatres]   = useState<Theatre[]>([])
  const [rooms,      setRooms]      = useState<Room[]>([])
  const [teams,      setTeams]      = useState<Team[]>([])
  const [eventTypes,    setEventTypes]    = useState<EventType[]>([])
  const [etTableError,  setEtTableError]  = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [activeTab, setActiveTab] = useState<'general' | 'notifications'>('general')

  // Add-form state
  const [newTheatre,   setNewTheatre]   = useState('')
  const [newRoom,      setNewRoom]      = useState('')
  const [newRoomTh,    setNewRoomTh]    = useState('')
  const [newTeam,      setNewTeam]      = useState('')
  const [newEventType, setNewEventType] = useState('')
  const [saving,       setSaving]       = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: th }, { data: rm }, { data: tm }, { data: et, error: etErr }] = await Promise.all([
      supabase.from('theatres').select('id, name').order('name'),
      supabase.from('rooms').select('id, name, theatre_id').order('name'),
      supabase.from('teams').select('id, name').order('name'),
      supabase.from('event_types').select('id, name').order('name'),
    ])
    setTheatres(th ?? [])
    setRooms(rm ?? [])
    setTeams(tm ?? [])
    if (etErr) {
      console.error('event_types error:', etErr)
      setEtTableError(true)
    } else {
      setEtTableError(false)
      setEventTypes(et ?? [])
    }
    if (!newRoomTh && th && th.length > 0) setNewRoomTh(th[0].id)
    setLoading(false)
  }

  // ── Theatres ────────────────────────────────────────────────────────────────

  async function addTheatre(e: React.FormEvent) {
    e.preventDefault()
    const name = newTheatre.trim()
    if (!name) return
    setSaving('theatre')
    await supabase.from('theatres').insert({ name })
    setNewTheatre('')
    setSaving(null)
    load()
  }

  async function renameTheatre(id: string, name: string) {
    await supabase.from('theatres').update({ name }).eq('id', id)
    load()
  }

  async function deleteTheatre(id: string, name: string) {
    const roomCount = rooms.filter(r => r.theatre_id === id).length
    const msg = roomCount > 0
      ? `Usunąć teatr "${name}"? Usunie też ${roomCount} powiązanych sal.`
      : `Usunąć teatr "${name}"?`
    if (!confirm(msg)) return
    await supabase.from('rooms').delete().eq('theatre_id', id)
    await supabase.from('theatres').delete().eq('id', id)
    load()
  }

  // ── Rooms ────────────────────────────────────────────────────────────────────

  async function addRoom(e: React.FormEvent) {
    e.preventDefault()
    const name = newRoom.trim()
    if (!name || !newRoomTh) return
    setSaving('room')
    await supabase.from('rooms').insert({ name, theatre_id: newRoomTh })
    setNewRoom('')
    setSaving(null)
    load()
  }

  async function renameRoom(id: string, name: string) {
    await supabase.from('rooms').update({ name }).eq('id', id)
    load()
  }

  async function deleteRoom(id: string, name: string) {
    if (!confirm(`Usunąć salę "${name}"?`)) return
    await supabase.from('rooms').delete().eq('id', id)
    load()
  }

  // ── Teams ────────────────────────────────────────────────────────────────────

  async function addTeam(e: React.FormEvent) {
    e.preventDefault()
    const name = newTeam.trim()
    if (!name) return
    setSaving('team')
    await supabase.from('teams').insert({ name })
    setNewTeam('')
    setSaving(null)
    load()
  }

  async function renameTeam(id: string, name: string) {
    await supabase.from('teams').update({ name }).eq('id', id)
    load()
  }

  async function deleteTeam(id: string, name: string) {
    if (!confirm(`Usunąć zespół "${name}"? Osoby przypisane do tego zespołu stracą przynależność.`)) return
    await supabase.from('teams').delete().eq('id', id)
    load()
  }

  // ── Event Types ──────────────────────────────────────────────────────────────

  async function addEventType(e: React.FormEvent) {
    e.preventDefault()
    const name = newEventType.trim()
    if (!name) return
    setSaving('eventType')
    const { error } = await supabase.from('event_types').insert({ name })
    if (error) {
      console.error('addEventType error:', error)
      alert(`Błąd zapisu: ${error.message}`)
    } else {
      setNewEventType('')
    }
    setSaving(null)
    load()
  }

  async function renameEventType(id: string, name: string) {
    const { error } = await supabase.from('event_types').update({ name }).eq('id', id)
    if (error) console.error('renameEventType error:', error)
    load()
  }

  async function deleteEventType(id: string, name: string) {
    if (!confirm(`Usunąć typ "${name}"?`)) return
    await supabase.from('event_types').delete().eq('id', id)
    load()
  }

  // ── Shared input/button styles ───────────────────────────────────────────────

  const inputCls = 'flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]'
  const addBtnCls = (key: string) =>
    `text-xs px-3 py-1.5 bg-[#1a1410] text-white rounded-lg hover:bg-[#3e3830] disabled:opacity-40 transition-colors whitespace-nowrap ${saving === key ? 'opacity-50 cursor-not-allowed' : ''}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Ładowanie…</div>
    )
  }

  return (
    <div className="-m-4 md:-m-8 flex flex-col min-h-full">
      {/* Full-width header */}
      <div className="flex items-start gap-4 px-4 md:px-8 py-4 md:py-5 shrink-0" style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>Ustawienia</h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Zarządzaj teatrami, salami i zespołami</p>
        </div>
      </div>
    <div className="max-w-2xl mx-auto w-full space-y-6 px-4 md:px-8 py-4 md:py-6">

      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('general')}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'general'
              ? ''
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
          }`}
          style={activeTab === 'general' ? { background: '#1a1410', color: '#fff' } : undefined}
        >
          Ogólne
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'notifications'
              ? ''
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
          }`}
          style={activeTab === 'notifications' ? { background: '#1a1410', color: '#fff' } : undefined}
        >
          Powiadomienia
        </button>
      </div>

      {activeTab === 'general' && (
        <>
          {/* ── Teatry ───────────────────────────────────────────────────────── */}
          <Section title="Teatry" description="Placówki teatralne widoczne w całej aplikacji">
            <div className="py-2">
              {theatres.length === 0 && (
                <p className="text-xs text-gray-500 px-4 py-3 italic">Brak teatrów</p>
              )}
              {theatres.map(th => (
                <EditableRow
                  key={th.id}
                  name={th.name}
                  sub={`${rooms.filter(r => r.theatre_id === th.id).length} sal`}
                  onSave={name => renameTheatre(th.id, name)}
                  onDelete={() => deleteTheatre(th.id, th.name)}
                />
              ))}
            </div>
            <div className="border-t border-gray-100 px-4 py-3">
              <form onSubmit={addTheatre} className="flex gap-2">
                <input
                  value={newTheatre}
                  onChange={e => setNewTheatre(e.target.value)}
                  placeholder="Nazwa nowego teatru…"
                  className={inputCls}
                />
                <button type="submit" disabled={!newTheatre.trim() || saving === 'theatre'}
                  className={addBtnCls('theatre')}>
                  + Dodaj
                </button>
              </form>
            </div>
          </Section>

          {/* ── Sale ─────────────────────────────────────────────────────────── */}
          <Section title="Sale i sceny" description="Sale prób i spektakli przypisane do teatrów">
            <div className="py-2">
              {theatres.length === 0 && (
                <p className="text-xs text-gray-500 px-4 py-3 italic">Najpierw dodaj teatr</p>
              )}
              {theatres.map(th => {
                const thRooms = rooms.filter(r => r.theatre_id === th.id)
                return (
                  <div key={th.id}>
                    <Divider label={th.name} />
                    {thRooms.length === 0 && (
                      <p className="text-xs text-gray-500 px-4 py-2 italic">Brak sal</p>
                    )}
                    {thRooms.map(rm => (
                      <EditableRow
                        key={rm.id}
                        name={rm.name}
                        onSave={name => renameRoom(rm.id, name)}
                        onDelete={() => deleteRoom(rm.id, rm.name)}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="border-t border-gray-100 px-4 py-3">
              <form onSubmit={addRoom} className="flex gap-2">
                <select
                  value={newRoomTh}
                  onChange={e => setNewRoomTh(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e] bg-white text-gray-700"
                >
                  {theatres.map(th => <option key={th.id} value={th.id}>{th.name}</option>)}
                </select>
                <input
                  value={newRoom}
                  onChange={e => setNewRoom(e.target.value)}
                  placeholder="Nazwa sali…"
                  className={inputCls}
                />
                <button type="submit" disabled={!newRoom.trim() || !newRoomTh || saving === 'room'}
                  className={addBtnCls('room')}>
                  + Dodaj
                </button>
              </form>
            </div>
          </Section>

          {/* ── Zespoły ──────────────────────────────────────────────────────── */}
          <Section title="Zespoły" description="Grupy pracowników — używane do filtrowania i przypisywania">
            <div className="py-2">
              {teams.length === 0 && (
                <p className="text-xs text-gray-500 px-4 py-3 italic">Brak zespołów</p>
              )}
              {teams.map(tm => (
                <EditableRow
                  key={tm.id}
                  name={tm.name}
                  onSave={name => renameTeam(tm.id, name)}
                  onDelete={() => deleteTeam(tm.id, tm.name)}
                />
              ))}
            </div>
            <div className="border-t border-gray-100 px-4 py-3">
              <form onSubmit={addTeam} className="flex gap-2">
                <input
                  value={newTeam}
                  onChange={e => setNewTeam(e.target.value)}
                  placeholder="Nazwa nowego zespołu…"
                  className={inputCls}
                />
                <button type="submit" disabled={!newTeam.trim() || saving === 'team'}
                  className={addBtnCls('team')}>
                  + Dodaj
                </button>
              </form>
            </div>
          </Section>

          {/* ── Typy Wydarzeń ────────────────────────────────────────────────── */}
          <Section title="Typy Wydarzeń" description="Kategorie używane w zakładce Wydarzenia (niepowiązane z tytułami)">
            {etTableError ? (
              <div className="px-5 py-4 m-4 rounded-xl text-sm" style={{ background: '#fdf0f2', border: '1px solid #f5c6cd', color: '#9e0c24' }}>
                <p className="font-semibold mb-1">Tabela nie istnieje w bazie danych</p>
                <p className="text-xs mb-3" style={{ color: '#7a3040' }}>Uruchom poniższy SQL w Supabase → SQL Editor, a następnie odśwież stronę:</p>
                <pre className="text-[11px] p-3 rounded-lg overflow-x-auto" style={{ background: '#fff8f9', border: '1px solid #f5c6cd', color: '#5a1020' }}>{`CREATE TABLE IF NOT EXISTS event_types (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);
INSERT INTO event_types (name) VALUES
  ('Sesja'), ('Próba chóru'),
  ('Wynajem przestrzeni'), ('Konferencja'),
  ('Urodziny'), ('Inne')
ON CONFLICT (name) DO NOTHING;`}</pre>
                <button onClick={() => load()} className="mt-3 text-xs px-3 py-1.5 rounded-lg" style={{ background: '#9e0c24', color: '#fff' }}>
                  Odśwież
                </button>
              </div>
            ) : (
              <>
                <div className="py-2">
                  {eventTypes.length === 0 && (
                    <p className="text-xs text-gray-500 px-4 py-3 italic">Brak typów — dodaj pierwszy poniżej</p>
                  )}
                  {eventTypes.map(et => (
                    <EditableRow
                      key={et.id}
                      name={et.name}
                      onSave={name => renameEventType(et.id, name)}
                      onDelete={() => deleteEventType(et.id, et.name)}
                    />
                  ))}
                </div>
                <div className="border-t border-gray-100 px-4 py-3">
                  <form onSubmit={addEventType} className="flex gap-2">
                    <input
                      value={newEventType}
                      onChange={e => setNewEventType(e.target.value)}
                      placeholder="Np. Wynajem przestrzeni…"
                      className={inputCls}
                    />
                    <button type="submit" disabled={!newEventType.trim() || saving === 'eventType'}
                      className={addBtnCls('eventType')}>
                      + Dodaj
                    </button>
                  </form>
                </div>
              </>
            )}
          </Section>
        </>
      )}

      {activeTab === 'notifications' && <NotificationsTab />}
    </div>
    </div>
  )
}
