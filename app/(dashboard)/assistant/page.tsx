'use client'

import { useEffect, useRef, useState } from 'react'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

function MarkdownText({ text }: { text: string }) {
  // Simple inline markdown: **bold**, *italic*, `code`, newlines
  const lines = text.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <p key={i} className="font-bold text-sm mt-2">{line.slice(4)}</p>
        if (line.startsWith('## '))  return <p key={i} className="font-bold text-sm mt-2">{line.slice(3)}</p>
        if (line.startsWith('# '))   return <p key={i} className="font-bold text-base mt-2">{line.slice(2)}</p>
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <p key={i} className="flex gap-1.5">
              <span className="shrink-0 mt-0.5 text-gray-400">•</span>
              <span>{renderInline(line.slice(2))}</span>
            </p>
          )
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        return <p key={i}>{renderInline(line)}</p>
      })}
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-black/10 px-1 py-0.5 rounded text-[11px] font-mono">{part.slice(1, -1)}</code>
    return part
  })
}

const SUGGESTIONS = [
  'Kto jest dostępny w przyszły piątek?',
  'Pokaż wszystkie spektakle w czerwcu',
  'Kto nie potwierdził udziału?',
  'Kto gra w Ferdydurke?',
  'Jakie produkcje mamy w Teatrze Polonia?',
]

export default function AssistantPage() {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(true)
  const [streaming, setStreaming] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // Load history on mount
  useEffect(() => {
    fetch('/api/chat')
      .then(r => r.json())
      .then(({ messages: hist }) => {
        setMessages(hist ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || streaming) return

    const userMsg: Message = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)

    // Add placeholder assistant message
    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const history = messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      })

      if (!res.ok || !res.body) throw new Error('Błąd połączenia')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: full }
          return next
        })
      }
    } catch (err) {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: '[Błąd: nie udało się połączyć z asystentem]' }
        return next
      })
    } finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex flex-col h-full -m-8">

      {/* Header */}
      <div className="px-8 py-5 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
              <path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="9" r="2" fill="white" stroke="none"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Stefan</h1>
            <p className="text-xs text-gray-500">Pytaj o repertuar, obsadę, dostępność aktorów</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Ładowanie historii…</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 pb-8">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto mb-4">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6">
                  <path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="9" r="2" fill="white" stroke="none"/>
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-800">Witaj! Jestem Stefan, asystent koordynatora.</p>
              <p className="text-sm text-gray-500 mt-1">Mam dostęp do aktualnych danych teatru — zapytaj o cokolwiek.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-2 text-xs font-medium bg-white border border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors text-gray-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={msg.id ?? i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="9" r="2" fill="white" stroke="none"/>
                    </svg>
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gray-900 text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    msg.content
                      ? <MarkdownText text={msg.content} />
                      : <span className="inline-flex gap-1 text-gray-400">
                          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
                        </span>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-8 py-4 border-t border-gray-100 bg-white shrink-0">
        {messages.length > 0 && !streaming && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {SUGGESTIONS.slice(0, 3).map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="px-2.5 py-1 text-[11px] font-medium bg-gray-50 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-gray-600"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Napisz wiadomość… (Enter = wyślij, Shift+Enter = nowa linia)"
            rows={1}
            disabled={streaming}
            className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50 max-h-40 overflow-y-auto"
            style={{ height: 'auto' }}
            onInput={e => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 160) + 'px'
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || streaming}
            className="w-11 h-11 rounded-2xl bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-40 transition-colors shrink-0"
          >
            {streaming ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" className="animate-spin">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

    </div>
  )
}
