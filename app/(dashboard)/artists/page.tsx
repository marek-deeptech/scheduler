'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import ArtistModal from '@/components/ArtistModal'
import Avatar from '@/components/Avatar'

interface ArtistRow {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  avatar_url: string | null
  productionCount: number
}

const STATUS_COLOR: Record<string, string> = {
  'Aktywny':             'bg-green-100 text-green-700',
  'Na urlopie':          'bg-yellow-100 text-yellow-700',
  'Choroba':             'bg-red-100 text-red-600',
  'Nieaktywny':          'bg-gray-100 text-gray-500',
  'Kontrakt zakończony': 'bg-slate-100 text-slate-500',
}

type SortKey = 'name' | 'role' | 'status' | 'productions'
type SortDir = 'asc' | 'desc'

export default function ArtistsPage() {
  const { t } = useLanguage()

  const [artists,     setArtists]     = useState<ArtistRow[]>([])
  const [productions, setProductions] = useState<{ id: string; title: string; theatres?: { name: string } | null }[]>([])
  const [loading,     setLoading]     = useState(true)

  const [modalArtist, setModalArtist] = useState<ArtistRow | null | undefined>(undefined)

  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: artistData }, { data: prodData }] = await Promise.all([
      supabase
        .from('artists')
        .select('*, artist_productions(production_id)')
        .order('name'),
      supabase
        .from('productions')
        .select('id, title, theatres(name)')
        .order('title'),
    ])

    const rows: ArtistRow[] = (artistData ?? []).map((a: any) => ({
      id:              a.id,
      name:            a.name,
      email:           a.email,
      phone:           a.phone,
      role:            a.role,
      status:          a.status,
      avatar_url:      a.avatar_url ?? null,
      productionCount: (a.artist_productions ?? []).length,
    }))

    setArtists(rows)
    setProductions(
      (prodData ?? []).map((p: any) => ({
        id:      p.id,
        title:   p.title,
        theatres: Array.isArray(p.theatres) ? p.theatres[0] ?? null : p.theatres ?? null,
      }))
    )
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let list = artists

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q) ||
        (a.role ?? '').toLowerCase().includes(q)
      )
    }
    if (filterStatus) list = list.filter(a => a.status === filterStatus)

    list = [...list].sort((a, b) => {
      if (sortKey === 'productions') return sortDir === 'asc'
        ? a.productionCount - b.productionCount
        : b.productionCount - a.productionCount

      const va = sortKey === 'name' ? a.name : sortKey === 'role' ? (a.role ?? '') : (a.status ?? '')
      const vb = sortKey === 'name' ? b.name : sortKey === 'role' ? (b.role ?? '') : (b.status ?? '')
      return sortDir === 'asc' ? va.localeCompare(vb, 'pl') : vb.localeCompare(va, 'pl')
    })

    return list
  }, [artists, search, filterStatus, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-gray-300">↕</span>
    return <span className="ml-1 text-gray-700">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function exportCSV() {
    const header = ['Imię i nazwisko', 'Email', 'Telefon', 'Rola', 'Status', 'Produkcje'].join(';')
    const rows = filtered.map(a => [
      a.name, a.email, a.phone ?? '', a.role ?? '', a.status ?? '', a.productionCount
    ].join(';'))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'artyści.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const thCls = 'text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider cursor-pointer select-none hover:text-gray-900 transition-colors whitespace-nowrap'
  const selectCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white text-gray-700'

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t.artists.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.artists.total(artists.length)}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Eksportuj CSV
          </button>
          <button
            onClick={() => setModalArtist(null)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Dodaj artystę
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj po nazwisku, emailu, roli..."
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectCls}>
          <option value="">Wszystkie statusy</option>
          {['Aktywny', 'Na urlopie', 'Choroba', 'Nieaktywny', 'Kontrakt zakończony'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('') }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Wyczyść filtry ×
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">{t.artists.loading}</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">{t.artists.empty}</p>
          <p className="text-sm mt-1">{t.artists.emptyHint}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className={thCls} onClick={() => toggleSort('name')}>
                  Artysta <SortIcon col="name" />
                </th>
                <th className={thCls} onClick={() => toggleSort('role')}>
                  Rola <SortIcon col="role" />
                </th>
                <th className={thCls} onClick={() => toggleSort('status')}>
                  Status <SortIcon col="status" />
                </th>
                <th className={thCls} onClick={() => toggleSort('productions')}>
                  Produkcje <SortIcon col="productions" />
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(artist => {
                const statusStyle = STATUS_COLOR[artist.status ?? ''] ?? 'bg-gray-100 text-gray-500'

                return (
                  <tr key={artist.id} className="hover:bg-gray-50 transition-colors">
                    {/* Avatar + name + email */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={artist.name} avatarUrl={artist.avatar_url} size="md" />
                        <div>
                          <p className="font-medium text-gray-900">{artist.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{artist.email}</p>
                          {artist.phone && <p className="text-xs text-gray-400">{artist.phone}</p>}
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3 text-gray-600">
                      {artist.role ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {artist.status ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
                          {artist.status}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Productions */}
                    <td className="px-4 py-3 text-center">
                      {artist.productionCount > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                          {artist.productionCount}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setModalArtist(artist)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Edytuj
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            Wyświetlono {filtered.length} z {artists.length} artystów
          </div>
        </div>
      )}

      {modalArtist !== undefined && (
        <ArtistModal
          artist={modalArtist}
          productions={productions}
          onClose={() => setModalArtist(undefined)}
          onSaved={() => { setModalArtist(undefined); fetchData() }}
        />
      )}
    </div>
  )
}
