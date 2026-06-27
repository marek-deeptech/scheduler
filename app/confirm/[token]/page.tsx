'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface ConfirmationData {
  id: string
  token: string
  status: string
  comment: string | null
  event: {
    title: string
    type: string | null
    start_time: string
    end_time: string
    productions: { title: string } | null
    rooms: { name: string } | null
  }
  artist: {
    name: string
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABELS: Record<string, string> = {
  pending:   'Oczekuje',
  confirmed: 'Potwierdzono',
  declined:  'Odmówiono',
  maybe:     'Może',
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-700',
  confirmed: 'bg-green-100 text-green-800',
  declined:  'bg-red-100 text-red-700',
  maybe:     'bg-amber-100 text-amber-800',
}

export default function ConfirmPage() {
  const { token } = useParams<{ token: string }>()
  const preAnswer = useSearchParams().get('answer')

  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [data,      setData]      = useState<ConfirmationData | null>(null)
  const [selected,  setSelected]  = useState<string | null>(null)
  const [comment,   setComment]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [finalStatus, setFinalStatus] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const resp = await fetch(`/api/confirmations/respond?token=${encodeURIComponent(token)}`)
    const json = await resp.json().catch(() => null)
    const rows = json?.data

    if (!resp.ok || !rows) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const record = rows as unknown as {
      id: string
      token: string
      status: string
      comment: string | null
      events: {
        title: string
        type: string | null
        start_time: string
        end_time: string
        productions: { title: string } | null
        rooms: { name: string } | null
      }
      artists: { name: string }
    }

    setData({
      id:      record.id,
      token:   record.token,
      status:  record.status,
      comment: record.comment,
      event:   record.events,
      artist:  record.artists,
    })

    // Pre-select if answer param provided and status still pending
    if (preAnswer && ['confirmed', 'declined', 'maybe'].includes(preAnswer) && record.status === 'pending') {
      setSelected(preAnswer)
    } else if (record.status !== 'pending') {
      // Already responded — show current answer
      setFinalStatus(record.status)
      setComment(record.comment ?? '')
    }

    setLoading(false)
  }, [token, preAnswer])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSubmit() {
    if (!selected) return
    setSubmitting(true)
    const res = await fetch('/api/confirmations/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, status: selected, comment: comment || undefined }),
    })
    const json = await res.json()
    if (json.ok) {
      setFinalStatus(json.status)
      setSubmitted(true)
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Ładowanie…</div>
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Link nieprawidłowy lub wygasły</h1>
          <p className="text-sm text-gray-500">Ten link do potwierdzenia nie istnieje lub nie jest już aktywny.</p>
        </div>
      </div>
    )
  }

  const ev = data.event
  const alreadyResponded = data.status !== 'pending' && !submitted

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-6 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Teatr — Potwierdzenie udziału</p>
          <h1 className="text-xl font-bold text-gray-900">{ev.type ?? ev.title}</h1>
          {ev.type && ev.title !== ev.type && (
            <p className="text-sm text-gray-500 mt-1">{ev.title}</p>
          )}
        </div>

        {/* Event details */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2">
          <div className="flex gap-2 text-sm">
            <span className="text-gray-400 w-20 shrink-0">Termin</span>
            <span className="font-medium text-gray-900">
              {fmtDate(ev.start_time)}, {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
            </span>
          </div>
          {ev.productions && (
            <div className="flex gap-2 text-sm">
              <span className="text-gray-400 w-20 shrink-0">Produkcja</span>
              <span className="font-medium text-gray-900">{ev.productions.title}</span>
            </div>
          )}
          {ev.rooms && (
            <div className="flex gap-2 text-sm">
              <span className="text-gray-400 w-20 shrink-0">Sala</span>
              <span className="font-medium text-gray-900">{ev.rooms.name}</span>
            </div>
          )}
          <div className="flex gap-2 text-sm">
            <span className="text-gray-400 w-20 shrink-0">Dla</span>
            <span className="font-medium text-gray-900">{data.artist.name}</span>
          </div>
        </div>

        {/* Already responded (not via this session) */}
        {alreadyResponded && (
          <div className="text-center">
            <div className="mb-4">
              <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${STATUS_STYLES[data.status]}`}>
                {STATUS_LABELS[data.status]}
              </span>
            </div>
            {data.comment && (
              <p className="text-sm text-gray-600 italic mb-4">„{data.comment}"</p>
            )}
            <p className="text-sm text-gray-500 mb-4">Twoja odpowiedź została już zapisana. Możesz ją zmienić poniżej.</p>
            <div className="flex flex-col gap-2">
              {(['confirmed', 'declined', 'maybe'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setSelected(s); setFinalStatus(null); setSubmitted(false) }}
                  className="text-sm text-gray-600 underline hover:text-gray-900"
                >
                  Zmień na: {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submitted thank-you */}
        {submitted && finalStatus && (
          <div className="text-center">
            <div className="text-4xl mb-3">
              {finalStatus === 'confirmed' ? '✅' : finalStatus === 'declined' ? '❌' : '🤔'}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Dziękujemy!</h2>
            <p className="text-sm text-gray-600 mb-3">
              Twoja odpowiedź <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${STATUS_STYLES[finalStatus]}`}>{STATUS_LABELS[finalStatus]}</span> została zapisana.
            </p>
            {comment && <p className="text-sm text-gray-500 italic">„{comment}"</p>}
          </div>
        )}

        {/* Response form — shown when pending or when re-answering */}
        {!alreadyResponded && !submitted && (
          <>
            <p className="text-sm font-semibold text-gray-700 text-center mb-4">Czy możesz wziąć udział?</p>

            {/* Big buttons */}
            <div className="flex gap-3 mb-5">
              <button
                onClick={() => setSelected('confirmed')}
                className={`flex-1 py-4 rounded-2xl font-bold text-base transition-all border-2 ${
                  selected === 'confirmed'
                    ? 'bg-green-600 text-white border-green-600 shadow-md scale-105'
                    : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
                }`}
              >
                ✓ TAK
              </button>
              <button
                onClick={() => setSelected('declined')}
                className={`flex-1 py-4 rounded-2xl font-bold text-base transition-all border-2 ${
                  selected === 'declined'
                    ? 'bg-red-600 text-white border-red-600 shadow-md scale-105'
                    : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
                }`}
              >
                ✗ NIE
              </button>
              <button
                onClick={() => setSelected('maybe')}
                className={`flex-1 py-4 rounded-2xl font-bold text-base transition-all border-2 ${
                  selected === 'maybe'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md scale-105'
                    : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                }`}
              >
                ~ MOŻE
              </button>
            </div>

            {/* Comment */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Komentarz (opcjonalnie)</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                placeholder="Dodaj komentarz do swojej odpowiedzi…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!selected || submitting}
              className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors text-sm"
            >
              {submitting ? 'Wysyłanie…' : 'Wyślij odpowiedź'}
            </button>
          </>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6">
          Teatr — System Planowania · Wiadomość automatyczna
        </p>
      </div>
    </div>
  )
}
