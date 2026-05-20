'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import { Artist } from '@/types'
import Avatar from '@/components/Avatar'
import { IconTheatre, IconWrench, IconHanger } from '@/lib/icons'

const teamColor: Record<string, string> = {
  Cast:      'bg-gray-100 text-gray-700',
  Technique: 'bg-gray-100 text-gray-700',
  Wardrobe:  'bg-gray-100 text-gray-700',
}

const TEAM_ICON: Record<string, React.ReactNode> = {
  Cast:      <IconTheatre size={48} className="text-gray-300 mx-auto mb-4" />,
  Technique: <IconWrench size={48} className="text-gray-300 mx-auto mb-4" />,
  Wardrobe:  <IconHanger size={48} className="text-gray-300 mx-auto mb-4" />,
}

export default function TeamPage({ teamName }: { teamName: string | null }) {
  const { t } = useLanguage()
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchArtists() }, [teamName])

  async function fetchArtists() {
    setLoading(true)
    let query = supabase.from('artists').select('*, teams(*), avatar_url').order('name')
    if (teamName) {
      const { data: teamData } = await supabase.from('teams').select('id').eq('name', teamName).single()
      if (teamData) query = query.eq('team_id', teamData.id)
      else { setArtists([]); setLoading(false); return }
    } else {
      // "Other" — artists with no team or unknown team
      query = query.is('team_id', null)
    }
    const { data } = await query
    setArtists(data ?? [])
    setLoading(false)
  }

  const displayName = teamName ?? 'Other'
  const color = teamColor[displayName] ?? 'bg-gray-100 text-gray-600'
  const icon = TEAM_ICON[displayName] ?? null

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        {icon && <span>{icon}</span>}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{displayName}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{artists.length} {t.artists.total(artists.length)}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">{t.artists.loading}</p>
      ) : artists.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">{t.team.empty(displayName)}</p>
          <p className="text-sm mt-1">{t.team.emptyHint}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t.artists.name}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t.artists.email}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t.artists.phone}</th>
              </tr>
            </thead>
            <tbody>
              {artists.map((artist) => (
                <tr key={artist.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={artist.name} avatarUrl={(artist as any).avatar_url} size="sm" />
                      <span className="font-medium text-gray-900">{artist.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{artist.email}</td>
                  <td className="px-4 py-3 text-gray-600">{artist.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
