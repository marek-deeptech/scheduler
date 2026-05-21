'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Theatre { id: string; name: string }
interface Room    { id: string; name: string; theatre_id: string }
interface Team    { id: string; name: string }

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
          className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
        <button onClick={save} disabled={busy}
          className="text-xs px-2.5 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
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
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-3 pb-1">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [theatres, setTheatres] = useState<Theatre[]>([])
  const [rooms,    setRooms]    = useState<Room[]>([])
  const [teams,    setTeams]    = useState<Team[]>([])
  const [loading,  setLoading]  = useState(true)

  // Add-form state
  const [newTheatre, setNewTheatre] = useState('')
  const [newRoom,    setNewRoom]    = useState('')
  const [newRoomTh,  setNewRoomTh]  = useState('')
  const [newTeam,    setNewTeam]    = useState('')
  const [saving,     setSaving]     = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: th }, { data: rm }, { data: tm }] = await Promise.all([
      supabase.from('theatres').select('id, name').order('name'),
      supabase.from('rooms').select('id, name, theatre_id').order('name'),
      supabase.from('teams').select('id, name').order('name'),
    ])
    setTheatres(th ?? [])
    setRooms(rm ?? [])
    setTeams(tm ?? [])
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

  // ── Shared input/button styles ───────────────────────────────────────────────

  const inputCls = 'flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black'
  const addBtnCls = (key: string) =>
    `text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors whitespace-nowrap ${saving === key ? 'opacity-50 cursor-not-allowed' : ''}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Ładowanie…</div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ustawienia</h1>
        <p className="text-sm text-gray-500 mt-0.5">Zarządzaj teatrami, salami i zespołami</p>
      </div>

      {/* ── Teatry ─────────────────────────────────────────────────────────── */}
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

      {/* ── Sale ───────────────────────────────────────────────────────────── */}
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
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white text-gray-700"
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

      {/* ── Zespoły ────────────────────────────────────────────────────────── */}
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
    </div>
  )
}
