'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LanguageProvider, useLanguage } from '@/lib/language-context'
import { TheatreProvider, useTheatre } from '@/lib/theatre-context'
import { ProfileProvider, useProfile } from '@/lib/profile-context'
import { supabase } from '@/lib/supabase'
import { sortByLastName } from '@/lib/names'

interface Theatre { id: string; name: string }
interface Actor   { id: string; name: string }

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
  chart: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  planning: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
      <path d="M9 15l1.5 1.5 3-3"/>
    </svg>
  ),
  mail: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  ),
  gear: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  assistant: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z"/>
      <circle cx="12" cy="9" r="2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  events: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>
    </svg>
  ),
}

// ── Profile switcher ────────────────────────────────────────────────────────

function ProfileSwitcher() {
  const { mode, actorId, actorName, setMode, setActor, clearActor } = useProfile()
  const router = useRouter()
  const [actors,  setActors]  = useState<Actor[]>([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)

  async function loadActors() {
    if (actors.length > 0) return
    setLoading(true)
    const { data } = await supabase
      .from('artists')
      .select('id, name, teams!inner(name)')
      .eq('teams.name', 'Cast')
      .order('name')
    setActors(sortByLastName(((data ?? []) as any[]).map(a => ({ id: a.id, name: a.name }))))
    setLoading(false)
  }

  function switchToCoordinator() {
    setMode('coordinator')
    router.push('/dashboard')
  }

  function switchToActor() {
    setMode('actor')
    loadActors()
    if (!actorId) setOpen(true)
    else router.push('/actor/calendar')
  }

  function selectActor(a: Actor) {
    setActor(a.id, a.name)
    setOpen(false)
    router.push('/actor/calendar')
  }

  return (
    <div className="px-3 py-3" style={{ borderBottom: '1px solid #e4ddd4' }}>
      {/* Toggle */}
      <div className="flex p-0.5 rounded-lg mb-2" style={{ background: '#ede7df' }}>
        <button
          onClick={switchToCoordinator}
          className="flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all"
          style={mode === 'coordinator'
            ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
            : { color: '#a89e92' }}
        >
          Koordynator
        </button>
        <button
          onClick={switchToActor}
          className="flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all"
          style={mode === 'actor'
            ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
            : { color: '#a89e92' }}
        >
          Aktor
        </button>
      </div>

      {/* Actor selector */}
      {mode === 'actor' && (
        <div className="relative">
          <button
            onClick={() => { loadActors(); setOpen(v => !v) }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-[12px] font-medium rounded-lg transition-colors"
            style={{ background: '#fff', color: '#5a524a', border: '1px solid #e4ddd4' }}
          >
            <span className="truncate">{actorName ?? 'Wybierz aktora…'}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 ml-1 opacity-40">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {open && (
            <div className="absolute left-0 right-0 top-full mt-1 rounded-xl z-50 max-h-52 overflow-y-auto"
              style={{ background: '#fff', border: '1px solid #e4ddd4', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
              {loading && <p className="px-3 py-2 text-[11px] italic text-gray-400">Ładowanie…</p>}
              {actors.map(a => (
                <button
                  key={a.id}
                  onClick={() => selectActor(a)}
                  className="w-full text-left px-3 py-2 text-[12px] transition-colors hover:bg-gray-50"
                  style={{ color: a.id === actorId ? '#1a1410' : '#7a7068', fontWeight: a.id === actorId ? 600 : 400 }}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const { t, locale, toggle } = useLanguage()
  const { selectedTheatreId, setSelectedTheatreId } = useTheatre()
  const { mode } = useProfile()
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
  const lnk      = (href: string) => `sidebar-link${isActive(href) ? ' active' : ''}`

  const theatreBtnCls = (id: string | null) => {
    const active = selectedTheatreId === id
    return [
      'w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2 truncate',
      active
        ? 'bg-[#e8e0d6] text-[#1a1410] font-semibold'
        : 'text-[#7a7068] hover:bg-[#ede7df] hover:text-[#1a1410]',
    ].join(' ')
  }

  return (
    <aside
      className={`${mobile ? 'w-full' : 'w-[210px]'} flex flex-col shrink-0 h-full overflow-y-auto`}
      style={{ background: '#faf6f0', borderRight: mobile ? 'none' : '1px solid #e4ddd4' }}
    >

      {/* Logo */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-teatr-polonia.jpg"
          alt="Teatr Polonia"
          className="w-full max-w-[148px] h-auto"
        />
      </div>

      {/* Crimson divider */}
      <div className="mx-4 h-px" style={{ background: 'rgba(200,16,46,0.20)' }} />

      {/* Profile switcher */}
      <ProfileSwitcher />

      {/* Navigation */}
      {mode === 'coordinator' ? (
        <>
          {/* Theatre filter */}
          <div className="px-3 pt-3 pb-2" style={{ borderBottom: '1px solid #e4ddd4' }}>
            <p className="sidebar-section mb-2">{t.nav.theatreLabel}</p>
            <div className="flex flex-col gap-0.5">
              <button className={theatreBtnCls(null)} onClick={() => setSelectedTheatreId(null)}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#5c5248] shrink-0" />
                {t.nav.allTheatres}
              </button>
              {theatres === null && (
                <p className="px-2.5 text-[10px] italic" style={{ color: '#3d3530' }}>{t.nav.loading}</p>
              )}
              {(theatres ?? []).map(th => {
                const dotColor = th.name === 'Teatr Polonia' ? '#c8102e'
                               : th.name === 'Och-Teatr'    ? '#e8a020'
                               : '#5c5248'
                return (
                  <button key={th.id} className={theatreBtnCls(th.id)} onClick={() => setSelectedTheatreId(th.id)}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                    {th.name}
                  </button>
                )
              })}
            </div>
          </div>

          <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
            <div>
              <p className="sidebar-section mb-1.5">{t.nav.sections.main}</p>
              <div className="space-y-px">
                <Link href="/dashboard"   className={lnk('/dashboard')}  >{icons.home}    {t.nav.dashboard}</Link>
                <Link href="/calendar"    className={lnk('/calendar')}   >{icons.calendar}{t.nav.calendar}</Link>
                <Link href="/planning"    className={lnk('/planning')}   >{icons.planning}Planowanie</Link>
                <Link href="/artists"     className={lnk('/artists')}    >{icons.user}    {t.nav.artists}</Link>
                <Link href="/productions" className={lnk('/productions')}>{icons.film}    {t.nav.productions}</Link>
                <Link href="/events"      className={lnk('/events')}     >{icons.events}  {t.nav.events}</Link>
              </div>
            </div>
            <div>
              <p className="sidebar-section mb-1.5">{t.nav.sections.communication}</p>
              <div className="space-y-px">
                <Link href="/messages" className={lnk('/messages')}>{icons.mail}{t.nav.messages}</Link>
              </div>
            </div>
            <div>
              <p className="sidebar-section mb-1.5">{t.nav.sections.extra}</p>
              <div className="space-y-px">
                <Link href="/reports"  className={lnk('/reports')} >{icons.chart}{t.nav.reports}</Link>
                <Link href="/settings" className={lnk('/settings')}>{icons.gear}{t.nav.settings}</Link>
              </div>
            </div>
            <div>
              <p className="sidebar-section mb-1.5">AI</p>
              <div className="space-y-px">
                <Link href="/assistant" className={lnk('/assistant')} style={isActive('/assistant') ? {} : { color: '#c8102e', fontWeight: 600 }}>
                  {icons.assistant}
                  <span>Stefan</span>
                </Link>
              </div>
            </div>
          </nav>
        </>
      ) : (
        <nav className="flex-1 px-3 py-4 space-y-px">
          <p className="sidebar-section mb-1.5">Moje konto</p>
          <Link href="/actor/calendar" className={lnk('/actor/calendar')}>{icons.calendar}Kalendarz</Link>
          <Link href="/actor/messages" className={lnk('/actor/messages')}>{icons.mail}Wiadomości</Link>
        </nav>
      )}

      {/* Language toggle */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid #e4ddd4' }}>
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors hover:bg-[#ede7df]"
          style={{ color: '#a89e92' }}
        >
          <span>{locale === 'en' ? '🇬🇧 English' : '🇵🇱 Polski'}</span>
          <span>{locale === 'en' ? 'PL' : 'EN'}</span>
        </button>
      </div>
    </aside>
  )
}

// ── Mobile bottom tab bar ───────────────────────────────────────────────────

function MobileTabBar() {
  const { t } = useLanguage()
  const { mode } = useProfile()
  const pathname = usePathname()

  const tabs = mode === 'coordinator'
    ? [
        { href: '/dashboard', label: t.nav.dashboard, icon: icons.home },
        { href: '/calendar',  label: t.nav.calendar,  icon: icons.calendar },
        { href: '/planning',  label: 'Planowanie',    icon: icons.planning },
        { href: '/messages',  label: t.nav.messages,  icon: icons.mail },
      ]
    : [
        { href: '/actor/calendar', label: 'Kalendarz',  icon: icons.calendar },
        { href: '/actor/messages', label: 'Wiadomości', icon: icons.mail },
      ]

  return (
    <nav
      className="md:hidden flex shrink-0 no-print z-40"
      style={{
        background: '#faf6f0',
        borderTop: '1px solid #e4ddd4',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map(tb => {
        const active = pathname === tb.href || pathname.startsWith(tb.href + '/')
        return (
          <Link
            key={tb.href}
            href={tb.href}
            className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 min-h-[52px] text-[10px] font-semibold"
            style={{ color: active ? '#c8102e' : '#a89e92' }}
          >
            {tb.icon}
            <span className="truncate max-w-full px-1">{tb.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// ── Shell (needs provider context, hence separate from DashboardLayout) ─────

function Shell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  // Close the drawer after navigation
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  // Lock body scroll while the drawer is open (iOS Safari)
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  return (
    <div className="flex h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0 h-full">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-[70] md:hidden transition-[visibility] ${drawerOpen ? 'visible' : 'invisible'}`}
        style={{ transitionDuration: '0.25s' }}
        aria-hidden={!drawerOpen}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 bottom-0 w-[270px] max-w-[82vw] shadow-2xl transition-transform duration-200 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ background: '#faf6f0', paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button
            aria-label="Zamknij menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute top-2 right-2 z-10 p-2 rounded-lg"
            style={{ color: '#a89e92', marginTop: 'env(safe-area-inset-top)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <Sidebar mobile />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header
          className="md:hidden flex items-center gap-2 px-3 shrink-0 no-print z-40"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            minHeight: 'calc(50px + env(safe-area-inset-top))',
            background: '#faf6f0',
            borderBottom: '1px solid #e4ddd4',
          }}
        >
          <button
            aria-label="Otwórz menu"
            onClick={() => setDrawerOpen(true)}
            className="p-2.5 -ml-1 rounded-lg active:bg-[#ede7df]"
            style={{ color: '#5a524a' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-teatr-polonia.jpg" alt="Teatr Polonia" className="h-7 w-auto" />
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 py-4 md:px-8 md:py-8 max-w-[1400px]">
            {children}
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <MobileTabBar />
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <TheatreProvider>
        <ProfileProvider>
          <Shell>{children}</Shell>
        </ProfileProvider>
      </TheatreProvider>
    </LanguageProvider>
  )
}
