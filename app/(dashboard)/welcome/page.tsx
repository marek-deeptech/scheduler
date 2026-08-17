'use client'

// Ekran powitalny KPA — pokazywany po zalogowaniu (raz dziennie).
// Data, słońce, pogoda, imieniny i kartka z kalendarza; stąd wejście na Pulpit.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconSun, IconCalendar, IconHeart, IconMapPin } from '@/lib/icons'

interface Brief {
  name: string
  date: string
  sunrise: string
  sunset: string
  weather: string | null
  temperature: number | null
  nameday: string
  fact: string
}

export default function WelcomePage() {
  const [brief, setBrief] = useState<Brief | null>(null)

  useEffect(() => {
    fetch('/api/daily-brief').then(r => r.json()).then(setBrief).catch(() => setBrief(null))
    try { localStorage.setItem('welcomeSeenOn', new Date().toDateString()) } catch { /* noop */ }
  }, [])

  const greeting = brief?.name ? `Cześć, ${brief.name}` : 'Cześć'
  const weatherLine = brief
    ? [brief.weather, brief.temperature != null ? `${brief.temperature}°C` : null].filter(Boolean).join(', ') || '—'
    : '…'

  return (
    <div className="max-w-3xl mx-auto py-6 md:py-10">
      <div className="rounded-3xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
        {/* Nagłówek */}
        <div className="px-6 md:px-9 pt-8 pb-6" style={{ background: 'linear-gradient(180deg,#faf6f0 0%,#fff 100%)' }}>
          <h1 className="text-3xl md:text-4xl" style={{ fontFamily: 'var(--font-playfair), Georgia, serif', color: '#1a1410' }}>
            {greeting}
          </h1>
          <p className="mt-2 text-sm md:text-base" style={{ color: '#7a7068' }}>
            Dziś <b style={{ color: '#1a1410' }}>{brief?.date ?? '…'}</b>
          </p>
        </div>

        {/* Wiersze informacyjne */}
        <div className="px-6 md:px-9 py-6 flex flex-col gap-4">
          <Row icon={<IconSun className="w-4 h-4" />} label="Słońce">
            wzeszło o <b>{brief?.sunrise ?? '…'}</b>, zajdzie o <b>{brief?.sunset ?? '…'}</b>
          </Row>
          <Row icon={<IconMapPin className="w-4 h-4" />} label="Pogoda w Warszawie">
            <b>{weatherLine}</b>
          </Row>
          <Row icon={<IconHeart className="w-4 h-4" />} label="Imieniny obchodzą">
            <b>{brief?.nameday ?? '…'}</b>
          </Row>
          <Row icon={<IconCalendar className="w-4 h-4" />} label="Kartka z kalendarza">
            {brief?.fact ?? '…'}
          </Row>
        </div>

        {/* Wejście do aplikacji */}
        <div className="px-6 md:px-9 py-5 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderTop: '1px solid #f2ede6', background: '#faf8f5' }}>
          <p className="text-xs" style={{ color: '#a89e92' }}>Miłego dnia — repertuar czeka.</p>
          <Link href="/dashboard"
            className="px-5 py-2.5 text-sm font-semibold rounded-xl"
            style={{ background: '#1a1410', color: '#fff' }}>
            Przejdź do Pulpitu →
          </Link>
        </div>
      </div>
    </div>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ background: '#f2ede6', color: '#7a2020' }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#b8b0a4' }}>{label}</p>
        <p className="text-sm leading-relaxed" style={{ color: '#3e3830' }}>{children}</p>
      </div>
    </div>
  )
}
