'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { windowDates } from '@/lib/slots'

interface SlotData {
  slotId: string
  artistId: string
  artistName: string
  title: string
  windowStart: string
  windowEnd: string
  target: number
  submittedAt: string | null
}

function fmtDay(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtRange(a: string, b: string) {
  const s = new Date(a + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
  const e = new Date(b + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${s} – ${e}`
}

export default function SlotPollPage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [data, setData] = useState<SlotData | null>(null)
  const [avail, setAvail] = useState<Record<string, boolean | null>>({})  // date -> mogę / nie mogę / null = nie wiem
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const fetchData = useCallback(async () => {
    const resp = await fetch(`/api/slots/respond?token=${encodeURIComponent(token)}`)
    const json = await resp.json().catch(() => null)
    const sd: SlotData | undefined = json?.data

    if (!resp.ok || !sd) { setNotFound(true); setLoading(false); return }
    setData(sd)

    const dates = windowDates(sd.windowStart, sd.windowEnd)
    // Wczytaj istniejące odpowiedzi; brak = domyślnie "mogę"
    const existingMap: Record<string, boolean | null> = {}
    for (const r of (json.availability ?? []) as { date: string; available: boolean | null }[]) existingMap[r.date] = r.available

    const init: Record<string, boolean | null> = {}
    for (const d of dates) init[d] = existingMap[d] !== undefined ? existingMap[d] : true
    setAvail(init)
    if (sd.submittedAt) setSubmitted(true)
    setLoading(false)
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSubmit() {
    if (!data) return
    setSubmitting(true)
    const dates = windowDates(data.windowStart, data.windowEnd)
    const payload = dates.map(date => ({ date, available: avail[date] !== undefined ? avail[date] : true }))
    const res = await fetch('/api/slots/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, availability: payload }),
    })
    const json = await res.json()
    if (json.ok) setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-500 text-sm">Ładowanie…</div></div>
  }
  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Link nieprawidłowy lub wygasły</h1>
          <p className="text-sm text-gray-500">Ta ankieta dostępności nie istnieje lub nie jest już aktywna.</p>
        </div>
      </div>
    )
  }

  const dates = windowDates(data.windowStart, data.windowEnd)
  const chosenCount = dates.filter(d => avail[d]).length

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-6 max-w-md w-full">
        <div className="text-center mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Teatr — Dostępność na spektakl</p>
          <h1 className="text-xl font-bold text-gray-900">{data.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{fmtRange(data.windowStart, data.windowEnd)}</p>
          <p className="text-xs text-gray-400 mt-1">{data.artistName} · planowane max {data.target} grań</p>
        </div>

        {submitted ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Dziękujemy!</h2>
            <p className="text-sm text-gray-600 mb-4">
              Zapisaliśmy Twoją dostępność: <b>{chosenCount}</b> {chosenCount === 1 ? 'dzień' : 'dni'}.
            </p>
            <button onClick={() => setSubmitted(false)} className="text-sm text-gray-600 underline hover:text-gray-900">
              Zmień odpowiedź
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-700 text-center mb-1">Zaznacz dni, w które możesz zagrać</p>
            <p className="text-xs text-gray-400 text-center mb-4">Klikaj, aby przełączać: mogę → nie mogę → nie wiem.</p>

            <div className="flex flex-col gap-2 mb-5 max-h-[50vh] overflow-y-auto">
              {dates.map(d => {
                const state = avail[d] !== undefined ? avail[d] : true  // true / false / null
                const next  = state === true ? false : state === false ? null : true
                const cls   = state === true  ? 'bg-green-50 border-green-300'
                            : state === false ? 'bg-red-50 border-red-200'
                            :                   'bg-gray-50 border-gray-300 border-dashed'
                const txt   = state === true  ? 'text-green-900'
                            : state === false ? 'text-red-700 line-through'
                            :                   'text-gray-500'
                const badge = state === true  ? 'bg-green-600 text-white'
                            : state === false ? 'bg-red-500 text-white'
                            :                   'bg-gray-400 text-white'
                return (
                  <button
                    key={d}
                    onClick={() => setAvail(a => ({ ...a, [d]: next }))}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${cls}`}
                  >
                    <span className={`text-sm font-medium ${txt}`}>{fmtDay(d)}</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge}`}>
                      {state === true ? 'MOGĘ' : state === false ? 'NIE MOGĘ' : 'NIE WIEM'}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
              <span>Mogę zagrać w: <b className="text-gray-900">{chosenCount}</b> {chosenCount === 1 ? 'dniu' : 'dni'}</span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors text-sm"
            >
              {submitting ? 'Wysyłanie…' : 'Zatwierdź i wyślij'}
            </button>
          </>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6">Teatr — System Planowania · Wiadomość automatyczna</p>
      </div>
    </div>
  )
}
