'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
function monthLabel(k: string) { const [y, m] = k.split('-'); return `${MONTHS_PL[+m - 1]} ${y}` }
function fmtPln(n: number) { return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(n || 0) }
function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface Status {
  approved: { id: string; label: string; approvedAt: string | null; finance: any } | null
  confirmations?: { total: number; confirmed: number; declined: number; maybe: number; pending: number; allConfirmed: boolean; pendingActors: string[]; declinedActors: string[] }
  reportSentAt?: string | null
}

export default function ImplementationPage() {
  const [months, setMonths] = useState<string[]>([])
  const [month, setMonth] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.from('repertoire_proposals').select('month').eq('status', 'approved').order('month', { ascending: false })
      .then(({ data }) => {
        const ms = [...new Set((data ?? []).map((r: any) => r.month))]
        setMonths(ms)
        setMonth(ms[0] ?? '')
        if (ms.length === 0) setLoading(false)
      })
  }, [])

  const load = useCallback(async () => {
    if (!month) return
    setLoading(true)
    const r = await fetch(`/api/planning/implementation-status?month=${month}`)
    setStatus(await r.json())
    setLoading(false)
  }, [month])

  useEffect(() => { if (month) load() }, [month, load])

  async function sendReport() {
    setSending(true)
    await fetch('/api/planning/send-finance-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }),
    })
    setSending(false)
    load()
  }

  const c = status?.confirmations
  const pct = c && c.total > 0 ? Math.round(c.confirmed / c.total * 100) : 0

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-4 -mx-4 -mt-4 md:px-8 md:py-5 md:-mx-8 md:-mt-8 mb-6"
           style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <Link href="/planning" className="text-xs" style={{ color: '#a89e92' }}>← Planowanie</Link>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
            Wdrożenie repertuaru
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Etap 5–6: potwierdzenia obsady i raport do Dyrektora Finansowego</p>
        </div>
        {months.length > 0 && (
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="rounded-xl px-3 py-2.5 text-sm bg-white" style={{ border: '1px solid #e4ddd4', color: '#3e3830' }}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-center py-16" style={{ color: '#a89e92' }}>Ładowanie…</p>
      ) : !status?.approved ? (
        <div className="text-center py-20">
          <p className="text-sm font-medium" style={{ color: '#7a7068' }}>Brak zatwierdzonego repertuaru</p>
          <p className="text-xs mt-1" style={{ color: '#a89e92' }}>Zatwierdź jedną z opcji w Planowaniu, aby rozpocząć wdrożenie.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Zatwierdzony wariant */}
          <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold" style={{ color: '#1a1410' }}>{status.approved.label}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">Zatwierdzony</span>
            </div>
            <p className="text-xs" style={{ color: '#a89e92' }}>Zatwierdzono: {fmtDateTime(status.approved.approvedAt)}</p>
            {status.approved.finance && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                <Kpi label="Przychód" value={fmtPln(status.approved.finance.revenue)} color="#15803d" />
                <Kpi label="Koszt" value={fmtPln(status.approved.finance.cost)} color="#b45309" />
                <Kpi label="Marża" value={fmtPln(status.approved.finance.margin)} color="#15803d" />
                <Kpi label="Śr. frekw." value={`${Math.round((status.approved.finance.attendance || 0) * 100)}%`} color="#1a1410" />
              </div>
            )}
          </div>

          {/* Potwierdzenia obsady */}
          <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: '#1a1410' }}>Potwierdzenia obsady</span>
              <span className="text-sm font-bold" style={{ color: c?.allConfirmed ? '#15803d' : '#1a1410' }}>{c?.confirmed ?? 0}/{c?.total ?? 0}</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mb-3" style={{ background: '#f2ede6' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c?.allConfirmed ? '#16a34a' : '#c8102e' }} />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Tag label={`✓ ${c?.confirmed ?? 0} potwierdzone`} cls="bg-green-100 text-green-800" />
              {(c?.maybe ?? 0) > 0 && <Tag label={`~ ${c?.maybe} może`} cls="bg-amber-100 text-amber-800" />}
              {(c?.declined ?? 0) > 0 && <Tag label={`✗ ${c?.declined} odmowa`} cls="bg-red-100 text-red-700" />}
              {(c?.pending ?? 0) > 0 && <Tag label={`${c?.pending} oczekuje`} cls="bg-gray-100 text-gray-600" />}
            </div>
            {c && c.pendingActors.length > 0 && (
              <p className="text-[11px] mt-3" style={{ color: '#a89e92' }}>Oczekują: {c.pendingActors.join(', ')}</p>
            )}
            {c && c.declinedActors.length > 0 && (
              <p className="text-[11px] mt-1" style={{ color: '#c8102e' }}>Odmówili (wymaga zastępstwa): {c.declinedActors.join(', ')}</p>
            )}
          </div>

          {/* Raport do Dyrektora Finansowego */}
          <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>Raport do Dyrektora Finansowego</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#a89e92' }}>
                  {status.reportSentAt
                    ? `Wysłano: ${fmtDateTime(status.reportSentAt)}`
                    : c?.allConfirmed
                    ? 'Wszystkie potwierdzenia zebrane — można wysłać raport przychodów.'
                    : 'Raport wyśle się automatycznie po 100% potwierdzeń (lub wyślij ręcznie poniżej).'}
                </p>
              </div>
              <button onClick={sendReport} disabled={sending}
                className="text-sm font-medium px-4 py-2 rounded-xl text-white disabled:opacity-40"
                style={{ background: status.reportSentAt ? '#7a7068' : '#16a34a' }}>
                {sending ? 'Wysyłam…' : status.reportSentAt ? 'Wyślij ponownie' : 'Wyślij raport'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: '#faf8f5', border: '1px solid #f2ede6' }}>
      <p className="text-[9px] uppercase tracking-wide" style={{ color: '#a89e92' }}>{label}</p>
      <p className="text-xs font-bold leading-tight" style={{ color }}>{value}</p>
    </div>
  )
}
function Tag({ label, cls }: { label: string; cls: string }) {
  return <span className={`px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
}
