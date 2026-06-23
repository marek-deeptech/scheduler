'use client'

/**
 * Wspólny modal potwierdzenia wysyłki. Zawsze pokazuje:
 *  – kanał (e-mail / SMS / ankieta),
 *  – pełną listę odbiorców (z liczbą),
 *  – podgląd treści,
 * i wymaga świadomego kliknięcia „Wyślij". Używany przez wszystkie akcje
 * wysyłania powiadomień / ankiet / wiadomości, żeby nic nie szło w tle.
 */
export interface SendRecipient { name: string; detail?: string; muted?: boolean }

export default function SendConfirmModal({
  title,
  channelLabel,
  recipients,
  content,
  note,
  confirmLabel,
  sending = false,
  allowEmpty = false,
  onConfirm,
  onCancel,
}: {
  title: string
  channelLabel?: string
  recipients: SendRecipient[]
  content?: React.ReactNode
  note?: string
  confirmLabel?: string
  sending?: boolean
  allowEmpty?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const count = recipients.length
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[88dvh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold" style={{ color: '#1a1410' }}>{title}</h2>
          {channelLabel && (
            <p className="text-[11px] mt-0.5 font-semibold uppercase tracking-wider" style={{ color: '#a89e92' }}>{channelLabel}</p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Treść */}
          {content != null && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Treść</p>
              <div className="rounded-xl p-3 text-sm whitespace-pre-wrap" style={{ background: '#faf8f5', border: '1px solid #f2ede6', color: '#3e3830' }}>
                {content}
              </div>
            </div>
          )}

          {/* Odbiorcy */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>
              Odbiorcy ({count})
            </p>
            {count === 0 ? (
              <p className="text-xs italic" style={{ color: '#a89e92' }}>Brak odbiorców.</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                {recipients.map((r, i) => (
                  <div key={`${r.name}-${i}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#faf8f5' }}>
                    <span className="text-sm font-medium truncate" style={{ color: r.muted ? '#a89e92' : '#1a1410' }}>{r.name}</span>
                    {r.detail && <span className="text-[11px] truncate shrink-0" style={{ color: '#a89e92' }}>{r.detail}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {note && <p className="text-[11px]" style={{ color: '#a89e92' }}>{note}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending || (count === 0 && !allowEmpty)}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ background: '#16a34a' }}
          >
            {sending ? 'Wysyłam…' : (confirmLabel ?? `Wyślij do ${count} ${count === 1 ? 'osoby' : 'osób'}`)}
          </button>
        </div>
      </div>
    </div>
  )
}
