'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LanguageProvider, useLanguage } from '@/lib/language-context'
import { TheatreProvider, useTheatre } from '@/lib/theatre-context'
import { supabase } from '@/lib/supabase'

interface Theatre { id: string; name: string }

/* ── SVG Icon set — Heroicons outline, monochromatic ─────────── */
const icons = {
  home: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  calendar: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  user: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  film: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125v-5.625A1.125 1.125 0 013.375 12H4.5M3.375 19.5v-5.625M21 19.5h-1.5a1.125 1.125 0 01-1.125-1.125M21 19.5v-5.625A1.125 1.125 0 0019.875 12H18.75M3.375 12h17.25M3.375 12V7.875A1.125 1.125 0 014.5 6.75H6M21 12V7.875A1.125 1.125 0 0019.875 6.75H18.75M6 6.75h12M6 6.75A1.125 1.125 0 014.875 5.625V4.5M18.75 6.75A1.125 1.125 0 0019.875 5.625V4.5m-15.375 0h15.375" />
    </svg>
  ),
  users: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  wrench: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L3 3.75l1.5-1.5L8.25 3v1.5l2.099 2.099" />
    </svg>
  ),
  hanger: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a2 2 0 100 4c1.1 0 2-.9 2-2s-.9-2-2-2z" />
      <path d="M12 7v2.5L2 17h20L12 9.5V7" />
    </svg>
  ),
  cube: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  ),
  chart: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
}

function Sidebar() {
  const { t, locale, toggle } = useLanguage()
  const { selectedTheatreId, setSelectedTheatreId } = useTheatre()
  const [theatres, setTheatres] = useState<Theatre[] | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    supabase.from('theatres').select('id, name').order('name')
      .then(({ data, error }) => {
        if (error) { console.error('theatres load error:', error); setTheatres([]) }
        else setTheatres(data ?? [])
      })
  }, [])

  const isActive = (href: string) => pathname === href

  const linkCls = (href: string) =>
    `flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors no-underline hover:no-underline ${
      isActive(href)
        ? 'bg-gray-900 text-white'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
    }`

  const theatreBtnCls = (id: string | null) =>
    `w-full text-left px-3 py-1.5 text-xs font-medium rounded-lg transition-colors truncate ${
      selectedTheatreId === id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
    }`

  const sectionLabel = 'px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400'

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-teatr-polonia.jpg"
          alt="Teatr Polonia"
          style={{ width: '160px', height: 'auto', display: 'block' }}
        />
      </div>

      {/* Theatre switcher */}
      <div className="px-3 py-3 border-b border-gray-100">
        <p className={sectionLabel}>Teatr</p>
        <div className="flex flex-col gap-0.5">
          <button className={theatreBtnCls(null)} onClick={() => setSelectedTheatreId(null)}>
            Wszystkie
          </button>
          {theatres === null && <p className="px-1 text-[10px] text-gray-300 italic">Ładowanie...</p>}
          {theatres !== null && theatres.length === 0 && <p className="px-1 text-[10px] text-red-400 italic">Brak teatrów</p>}
          {(theatres ?? []).map(th => {
            const dot = th.name === 'Teatr Polonia' ? 'bg-red-500'
                      : th.name === 'Och-Teatr'     ? 'bg-yellow-400'
                      : 'bg-gray-400'
            return (
              <button key={th.id} className={`${theatreBtnCls(th.id)} flex items-center gap-2`} onClick={() => setSelectedTheatreId(th.id)}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                {th.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        <div>
          <p className={sectionLabel}>{t.nav.sections.main}</p>
          <div className="space-y-0.5">
            <Link href="/dashboard"   className={linkCls('/dashboard')}  >{icons.home}    {t.nav.dashboard}</Link>
            <Link href="/calendar"    className={linkCls('/calendar')}   >{icons.calendar}{t.nav.calendar}</Link>
            <Link href="/artists"     className={linkCls('/artists')}    >{icons.user}    {t.nav.artists}</Link>
            <Link href="/productions" className={linkCls('/productions')}>{icons.film}    {t.nav.productions}</Link>
          </div>
        </div>
        <div>
          <p className={sectionLabel}>{t.nav.sections.resources}</p>
          <div className="space-y-0.5">
            <Link href="/cast"      className={linkCls('/cast')}     >{icons.users} {t.nav.cast}</Link>
            <Link href="/technique" className={linkCls('/technique')}>{icons.wrench}{t.nav.technique}</Link>
            <Link href="/wardrobe"  className={linkCls('/wardrobe')} >{icons.hanger}{t.nav.wardrobe}</Link>
            <Link href="/other"     className={linkCls('/other')}    >{icons.cube}  {t.nav.other}</Link>
          </div>
        </div>
        <div>
          <p className={sectionLabel}>{t.nav.sections.reports}</p>
          <div className="space-y-0.5">
            <Link href="/reports" className={linkCls('/reports')}>{icons.chart}{t.nav.reports}</Link>
          </div>
        </div>
      </nav>

      {/* Language toggle */}
      <div className="px-3 py-3 border-t border-gray-100">
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <span>{locale === 'en' ? '🇬🇧 English' : '🇵🇱 Polski'}</span>
          <span className="text-gray-400">{locale === 'en' ? 'PL' : 'EN'}</span>
        </button>
      </div>
    </aside>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <TheatreProvider>
        <div className="flex h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </div>
      </TheatreProvider>
    </LanguageProvider>
  )
}
