'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import SendConfirmModal from '@/components/SendConfirmModal'
import { supabase } from '@/lib/supabase'
import { useTheatre } from '@/lib/theatre-context'

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

// Ikony w stylu menu bocznego (Heroicons outline, monochromatyczne).
function Svg({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const DEPT_ICON = {
  sprzedaz:   <Svg d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />,
  pr:         <Svg d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.51l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />,
  inspicjent: <Svg d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />,
  scena:      <Svg d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />,
} as const

// Działy do powiadomienia po zatwierdzeniu repertuaru.
// Na razie bez przypisanych osób — same przyciski + pole powiadomienia.
const DEPARTMENTS: { key: keyof typeof DEPT_ICON; label: string }[] = [
  { key: 'sprzedaz',   label: 'Sprzedaż'   },
  { key: 'pr',         label: 'PR'         },
  { key: 'inspicjent', label: 'Inspicjent' },
  { key: 'scena',      label: 'Scena'      },
]

export default function ImplementationPage() {
  const { selectedTheatreId } = useTheatre()
  const searchParams = useSearchParams()
  const monthParam = searchParams.get('month')
  const [months, setMonths] = useState<string[]>([])
  const [month, setMonth] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [openDept, setOpenDept] = useState<string | null>(null)
  const [deptMsg, setDeptMsg] = useState<Record<string, string>>({})
  const [reportConfirm, setReportConfirm] = useState(false)

  useEffect(() => {
    let q = supabase.from('repertoire_proposals').select('month').eq('status', 'approved').order('month', { ascending: false })
    if (selectedTheatreId) q = q.eq('theatre_id', selectedTheatreId)
    q.then(({ data }) => {
      const ms = [...new Set((data ?? []).map((r: any) => r.month))]
      setMonths(ms)
      setMonth(monthParam && ms.includes(monthParam) ? monthParam : (ms[0] ?? ''))
      if (ms.length === 0) { setStatus(null); setLoading(false) }
    })
  }, [selectedTheatreId, monthParam])

  const load = useCallback(async () => {
    if (!month) return
    setLoading(true)
    const tp = selectedTheatreId ? `&theatre=${selectedTheatreId}` : ''
    const r = await fetch(`/api/planning/implementation-status?month=${month}${tp}`)
    setStatus(await r.json())
    setLoading(false)
  }, [month, selectedTheatreId])

  useEffect(() => { if (month) load() }, [month, load])

  async function sendReport() {
    setSending(true)
    await fetch('/api/planning/send-finance-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, theatreId: selectedTheatreId }),
    })
    setSending(false)
    setReportConfirm(false)
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
            Konsultacje z obsadą
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Potwierdzenia udziału obsady i raport do Dyrektora Finansowego — przed uruchomieniem sprzedaży</p>
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
          <p className="text-xs mt-1" style={{ color: '#a89e92' }}>Zatwierdź jedną z opcji w Planowaniu, aby rozpocząć konsultacje.</p>
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
                <Kpi label="Dochód" value={fmtPln(status.approved.finance.margin)} color="#15803d" />
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
            {(c?.pending ?? 0) > 0 && (
              <Link href="/messages"
                className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors"
                style={{ background: '#c8102e', color: '#fff' }}
                title="Przejdź do potwierdzeń, aby ponowić prośbę do oczekujących">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8"/><path d="M3 3v5h5"/></svg>
                Ponaglij oczekujących ({c?.pending})
              </Link>
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
              <button onClick={() => setReportConfirm(true)} disabled={sending}
                className="text-sm font-medium px-4 py-2 rounded-xl text-white disabled:opacity-40"
                style={{ background: status.reportSentAt ? '#7a7068' : '#16a34a' }}>
                {sending ? 'Wysyłam…' : status.reportSentAt ? 'Wyślij ponownie' : 'Wyślij raport'}
              </button>
            </div>
          </div>

          {/* Powiadomienia działów */}
          <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
            <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>Powiadom działy</p>
            <p className="text-[11px] mt-0.5 mb-3" style={{ color: '#a89e92' }}>
              Po zatwierdzeniu repertuaru poinformuj zespoły o planie na {monthLabel(month)}.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {DEPARTMENTS.map(d => (
                <button key={d.key} onClick={() => setOpenDept(openDept === d.key ? null : d.key)}
                  className="flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl transition-colors"
                  style={{
                    background: openDept === d.key ? '#1a1410' : '#faf8f5',
                    color: openDept === d.key ? '#fff' : '#3e3830',
                    border: '1px solid #e4ddd4',
                  }}>
                  {DEPT_ICON[d.key]}{d.label}
                </button>
              ))}
            </div>

            {openDept && (() => {
              const dept = DEPARTMENTS.find(d => d.key === openDept)!
              return (
                <div className="mt-3 rounded-xl p-3" style={{ background: '#faf8f5', border: '1px solid #f2ede6' }}>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold mb-1.5" style={{ color: '#7a7068' }}>
                    {DEPT_ICON[dept.key]} Powiadomienie — {dept.label}
                  </p>
                  <textarea
                    value={deptMsg[openDept] ?? ''}
                    onChange={e => setDeptMsg(m => ({ ...m, [openDept]: e.target.value }))}
                    rows={3}
                    placeholder={`Treść powiadomienia dla działu „${dept.label}" o repertuarze na ${monthLabel(month)}…`}
                    className="w-full rounded-lg px-3 py-2 text-sm resize-y"
                    style={{ border: '1px solid #e4ddd4', color: '#3e3830', background: '#fff' }} />
                  <div className="flex items-center justify-between gap-3 mt-2">
                    <span className="text-[11px]" style={{ color: '#a89e92' }}>Brak przypisanych osób w dziale.</span>
                    <button disabled title="Najpierw dodaj osoby do działu"
                      className="text-sm font-medium px-4 py-2 rounded-xl text-white opacity-40 cursor-not-allowed"
                      style={{ background: '#16a34a' }}>
                      Wyślij powiadomienie
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {reportConfirm && status?.approved && (
        <SendConfirmModal
          title={`Raport finansowy — ${monthLabel(month)}`}
          channelLabel="E-mail do Dyrektora Finansowego"
          recipients={[{ name: 'Dyrektor Finansowy', detail: 'adres z Ustawień' }]}
          content={status.approved.finance
            ? `Repertuar „${status.approved.label}" — ${monthLabel(month)}.\nPrzychód: ${fmtPln(status.approved.finance.revenue)}\nKoszt: ${fmtPln(status.approved.finance.cost)}\nDochód: ${fmtPln(status.approved.finance.margin)}\nŚr. frekwencja: ${Math.round((status.approved.finance.attendance || 0) * 100)}%`
            : `Repertuar „${status.approved.label}" — ${monthLabel(month)}.`}
          note={status.reportSentAt ? 'Raport był już wysłany — zostanie wysłany ponownie.' : undefined}
          confirmLabel="Wyślij raport"
          sending={sending}
          onConfirm={sendReport}
          onCancel={() => setReportConfirm(false)}
        />
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
