'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ArtistRecord {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  avatar_url?: string | null
}

interface Production {
  id: string
  title: string
  theatres?: { name: string } | null
}

interface VacationRecord {
  id: string
  start_time: string
  end_time: string
  note: string | null
}

interface Props {
  artist: ArtistRecord | null  // null = create mode
  productions: Production[]
  presetTeamId?: string
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTIONS = [
  'Aktywny',
  'Na urlopie',
  'Choroba',
  'Nieaktywny',
  'Kontrakt zakończony',
]

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
const labelCls = 'block text-sm font-medium text-gray-500 mb-1.5'

function toDateInput(iso: string) {
  return iso.slice(0, 10)
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export default function ArtistModal({ artist, productions, presetTeamId, onClose, onSaved }: Props) {
  const isEdit = !!artist

  const [form, setForm] = useState({
    name:   artist?.name   ?? '',
    email:  artist?.email  ?? '',
    phone:  artist?.phone  ?? '',
    role:   artist?.role   ?? '',
    status: artist?.status ?? 'Aktywny',
  })
  const [assignedIds,  setAssignedIds]  = useState<string[]>([])
  const [vacations,    setVacations]    = useState<VacationRecord[]>([])
  const [sicknesses,   setSicknesses]   = useState<VacationRecord[]>([])
  const [newVacation,  setNewVacation]  = useState({ start: '', end: '', note: '' })
  const [newSickness,  setNewSickness]  = useState({ start: '', end: '', note: '' })
  const [showVacForm,  setShowVacForm]  = useState(false)
  const [showSickForm, setShowSickForm] = useState(false)
  const [avatarUrl,    setAvatarUrl]    = useState<string | null>(artist?.avatar_url ?? null)
  const [uploading,    setUploading]    = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [vacSaving,    setVacSaving]    = useState(false)
  const [sickSaving,   setSickSaving]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    if (!artist) return
    supabase.from('artist_productions').select('production_id').eq('artist_id', artist.id)
      .then(({ data }) => setAssignedIds((data ?? []).map(r => r.production_id)))
    loadAvailability(artist.id)
  }, [artist?.id])

  async function loadAvailability(artistId: string) {
    const { data } = await supabase
      .from('availabilities')
      .select('id, start_time, end_time, note, type')
      .eq('artist_id', artistId)
      .in('type', ['Urlop', 'Choroba'])
      .order('start_time')
    const records = (data ?? []) as (VacationRecord & { type: string })[]
    setVacations(records.filter(r => r.type === 'Urlop'))
    setSicknesses(records.filter(r => r.type === 'Choroba'))
    return records
  }

  // After any add/remove, recalculate status based on today
  async function syncStatus(artistId: string, updatedRecords?: (VacationRecord & { type: string })[]) {
    const records = updatedRecords ?? (await loadAvailability(artistId))
    const today = new Date().toISOString().slice(0, 10)

    const activeToday = records.find(r => {
      const start = r.start_time.slice(0, 10)
      const end   = r.end_time.slice(0, 10)
      return today >= start && today <= end
    })

    let newStatus: string | null = null
    if (activeToday?.type === 'Choroba')  newStatus = 'Choroba'
    else if (activeToday?.type === 'Urlop') newStatus = 'Na urlopie'
    else if (form.status === 'Choroba' || form.status === 'Na urlopie') newStatus = 'Aktywny'

    if (newStatus && newStatus !== form.status) {
      await supabase.from('artists').update({ status: newStatus }).eq('id', artistId)
      setForm(f => ({ ...f, status: newStatus! }))
    }
  }

  // Check if new date range overlaps any existing availability
  async function hasOverlap(start: string, end: string): Promise<string | null> {
    const { data } = await supabase
      .from('availabilities')
      .select('id, type, start_time, end_time')
      .eq('artist_id', artist!.id)
      .lt('start_time', `${end}T23:59:59`)
      .gt('end_time',   `${start}T00:00:00`)
    if (!data || data.length === 0) return null
    const clash = data[0] as any
    const clashType = clash.type === 'Urlop' ? 'urlop' : 'choroba'
    return `Zakres nakłada się z istniejącym wpisem (${clashType}: ${clash.start_time.slice(0,10)} – ${clash.end_time.slice(0,10)}).`
  }

  async function addEntry(type: 'Urlop' | 'Choroba', entry: { start: string; end: string; note: string }) {
    if (!artist || !entry.start || !entry.end) return false
    if (entry.end < entry.start) {
      setError('Data końca nie może być wcześniejsza niż data początku.')
      return false
    }
    setError(null)
    const overlap = await hasOverlap(entry.start, entry.end)
    if (overlap) { setError(overlap); return false }

    const { error: err } = await supabase.from('availabilities').insert({
      artist_id:  artist.id,
      type,
      start_time: `${entry.start}T00:00:00`,
      end_time:   `${entry.end}T23:59:59`,
      note:       entry.note || null,
    })
    if (err) { setError(err.message); return false }
    await syncStatus(artist.id)
    return true
  }

  async function addVacation() {
    setVacSaving(true)
    const ok = await addEntry('Urlop', newVacation)
    if (ok) { setNewVacation({ start: '', end: '', note: '' }); setShowVacForm(false) }
    setVacSaving(false)
  }

  async function addSickness() {
    setSickSaving(true)
    const ok = await addEntry('Choroba', newSickness)
    if (ok) { setNewSickness({ start: '', end: '', note: '' }); setShowSickForm(false) }
    setSickSaving(false)
  }

  async function removeEntry(id: string) {
    await supabase.from('availabilities').delete().eq('id', id)
    if (artist) await syncStatus(artist.id)
  }

  function handleStatusChange(newStatus: string) {
    const today = new Date().toISOString().slice(0, 10)
    const activeToday = [...vacations, ...sicknesses].find(r => {
      const start = r.start_time.slice(0, 10)
      const end   = r.end_time.slice(0, 10)
      return today >= start && today <= end
    })
    if (newStatus === 'Aktywny' && activeToday) {
      setError('Uwaga: istnieje aktywny wpis (urlop lub choroba) na dziś. Usuń go, aby ustawić status Aktywny.')
      return
    }
    setError(null)
    setForm(f => ({ ...f, status: newStatus }))
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${artist?.id ?? crypto.randomUUID()}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('artist-avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setError('Błąd przesyłania zdjęcia: ' + upErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('artist-avatars').getPublicUrl(path)
    setAvatarUrl(urlData.publicUrl)
    setUploading(false)
    // Persist immediately if editing
    if (artist?.id) {
      await supabase.from('artists').update({ avatar_url: urlData.publicUrl }).eq('id', artist.id)
    }
  }

  async function handleRemoveAvatar() {
    setAvatarUrl(null)
    if (artist?.id) {
      await supabase.from('artists').update({ avatar_url: null }).eq('id', artist.id)
    }
  }

  function toggleProduction(id: string) {
    setAssignedIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload: Record<string, unknown> = {
      name:       form.name,
      email:      form.email || '',
      phone:      form.phone  || null,
      role:       form.role   || null,
      status:     form.status || null,
      avatar_url: avatarUrl   || null,
    }
    if (presetTeamId) payload.team_id = presetTeamId

    let artistId = artist?.id ?? null

    if (isEdit && artist) {
      const { error: updateErr } = await supabase.from('artists').update(payload).eq('id', artist.id)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      artistId = artist.id
    } else {
      const { data: newArtist, error: insertErr } = await supabase.from('artists').insert(payload).select().single()
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      artistId = newArtist?.id ?? null
    }

    if (artistId) {
      const id = artistId
      await supabase.from('artist_productions').delete().eq('artist_id', id)
      if (assignedIds.length > 0) {
        const { error: apErr } = await supabase.from('artist_productions').insert(
          assignedIds.map(production_id => ({ artist_id: id, production_id }))
        )
        if (apErr) { setError(apErr.message); setSaving(false); return }
      }
    }

    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!artist || !confirm('Usunąć tego artystę?')) return
    setDeleting(true)
    await supabase.from('artists').delete().eq('id', artist.id)
    setDeleting(false)
    onSaved()
  }

  const assigned  = productions.filter(p => assignedIds.includes(p.id))
  const available = productions.filter(p => !assignedIds.includes(p.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edytuj artystę' : 'Nowy artysta'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-lg">
            ×
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <label className="relative group cursor-pointer shrink-0">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarChange}
                disabled={uploading}
              />
              <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center ring-2 ring-gray-200 group-hover:ring-gray-400 transition-all">
                {avatarUrl
                  ? <img src={avatarUrl} alt="portret" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-semibold text-gray-500">
                      {form.name ? form.name.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : '?'}
                    </span>
                }
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading
                  ? <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  : <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                }
              </div>
            </label>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700">Zdjęcie profilowe</p>
              <p className="text-xs text-gray-400 mt-0.5">Kliknij aby dodać lub zmienić portret</p>
              {avatarUrl && (
                <button type="button" onClick={handleRemoveAvatar}
                  className="mt-1.5 text-xs text-red-500 hover:text-red-700 transition-colors">
                  Usuń zdjęcie
                </button>
              )}
            </div>
          </div>

          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Imię i nazwisko *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="Anna Kowalska"
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className={inputCls}
                placeholder="anna@teatr.pl"
              />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className={inputCls}
                placeholder="+48 123 456 789"
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={e => handleStatusChange(e.target.value)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Rola / funkcja</label>
              <input
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className={inputCls}
                placeholder="np. Aktor, Reżyser"
              />
            </div>
          </div>

          {/* Vacation & Sickness date ranges */}
          {isEdit && (
            <>
              {/* Urlopy */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls + ' mb-0'}>Urlopy</label>
                  <button type="button" onClick={() => { setShowVacForm(v => !v); setError(null) }}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors">
                    {showVacForm ? 'Anuluj' : '+ Dodaj urlop'}
                  </button>
                </div>
                {showVacForm && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-yellow-700 uppercase tracking-wider mb-1">Od</label>
                        <input type="date" value={newVacation.start}
                          onChange={e => setNewVacation(v => ({ ...v, start: e.target.value }))}
                          className="w-full border border-yellow-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-yellow-700 uppercase tracking-wider mb-1">Do</label>
                        <input type="date" value={newVacation.end} min={newVacation.start}
                          onChange={e => setNewVacation(v => ({ ...v, end: e.target.value }))}
                          className="w-full border border-yellow-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                      </div>
                    </div>
                    <input value={newVacation.note} onChange={e => setNewVacation(v => ({ ...v, note: e.target.value }))}
                      placeholder="Notatka (opcjonalnie)"
                      className="w-full border border-yellow-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <button type="button" onClick={addVacation}
                      disabled={vacSaving || !newVacation.start || !newVacation.end}
                      className="w-full py-1.5 text-xs font-semibold text-yellow-800 bg-yellow-200 rounded-lg hover:bg-yellow-300 disabled:opacity-50 transition-colors">
                      {vacSaving ? 'Zapisywanie...' : 'Zapisz urlop'}
                    </button>
                  </div>
                )}
                {vacations.length === 0 && !showVacForm ? (
                  <p className="text-xs text-gray-400 italic">Brak zaplanowanych urlopów</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {vacations.map(v => (
                      <div key={v.id} className="flex items-center justify-between px-3 py-2 bg-yellow-50 border border-yellow-100 rounded-xl">
                        <div>
                          <span className="text-sm font-medium text-yellow-800">{formatDate(v.start_time)} – {formatDate(v.end_time)}</span>
                          {v.note && <p className="text-xs text-yellow-600 mt-0.5">{v.note}</p>}
                        </div>
                        <button type="button" onClick={() => removeEntry(v.id)}
                          className="w-5 h-5 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-400 hover:text-red-500 transition-colors text-xs font-bold">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Choroby */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls + ' mb-0'}>Choroba</label>
                  <button type="button" onClick={() => { setShowSickForm(v => !v); setError(null) }}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors">
                    {showSickForm ? 'Anuluj' : '+ Dodaj chorobę'}
                  </button>
                </div>
                {showSickForm && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-1">Od</label>
                        <input type="date" value={newSickness.start}
                          onChange={e => setNewSickness(v => ({ ...v, start: e.target.value }))}
                          className="w-full border border-red-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-1">Do</label>
                        <input type="date" value={newSickness.end} min={newSickness.start}
                          onChange={e => setNewSickness(v => ({ ...v, end: e.target.value }))}
                          className="w-full border border-red-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
                      </div>
                    </div>
                    <input value={newSickness.note} onChange={e => setNewSickness(v => ({ ...v, note: e.target.value }))}
                      placeholder="Notatka (opcjonalnie)"
                      className="w-full border border-red-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
                    <button type="button" onClick={addSickness}
                      disabled={sickSaving || !newSickness.start || !newSickness.end}
                      className="w-full py-1.5 text-xs font-semibold text-red-800 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors">
                      {sickSaving ? 'Zapisywanie...' : 'Zapisz chorobę'}
                    </button>
                  </div>
                )}
                {sicknesses.length === 0 && !showSickForm ? (
                  <p className="text-xs text-gray-400 italic">Brak wpisów chorobowych</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {sicknesses.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-100 rounded-xl">
                        <div>
                          <span className="text-sm font-medium text-red-700">{formatDate(s.start_time)} – {formatDate(s.end_time)}</span>
                          {s.note && <p className="text-xs text-red-500 mt-0.5">{s.note}</p>}
                        </div>
                        <button type="button" onClick={() => removeEntry(s.id)}
                          className="w-5 h-5 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-400 hover:text-red-500 transition-colors text-xs font-bold">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Productions */}
          <div>
            <label className={labelCls}>Produkcje</label>
            {assigned.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Przypisane</p>
                <div className="flex flex-col gap-1">
                  {assigned.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{p.title}</span>
                        {p.theatres && <span className="ml-2 text-xs text-gray-400">{p.theatres.name}</span>}
                      </div>
                      <button type="button" onClick={() => toggleProduction(p.id)}
                        className="w-5 h-5 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-400 hover:text-red-500 transition-colors text-xs font-bold">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {available.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Dostępne</p>
                <div className="flex flex-col gap-1">
                  {available.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
                      <div>
                        <span className="text-sm text-gray-700">{p.title}</span>
                        {p.theatres && <span className="ml-2 text-xs text-gray-400">{p.theatres.name}</span>}
                      </div>
                      <button type="button" onClick={() => toggleProduction(p.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold transition-colors">
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {productions.length === 0 && (
              <p className="text-xs text-gray-400 italic">Brak produkcji w bazie</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            {isEdit ? (
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-red-500 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors">
                {deleting ? 'Usuwanie...' : 'Usuń'}
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Anuluj
              </button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 text-sm font-medium text-white bg-gray-900 rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
