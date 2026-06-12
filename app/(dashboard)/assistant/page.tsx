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

const SESSION_KEY = 'stefan_chat_messages'

function loadFromSession(): Message[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

function saveToSession(msgs: Message[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs))
  } catch {}
}

export default function AssistantPage() {
  const [messages,  setMessages]  = useState<Message[]>(() => loadFromSession() ?? [])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(() => loadFromSession() === null)
  const [streaming, setStreaming] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // Load history from DB only if nothing in sessionStorage
  useEffect(() => {
    if (!loading) return  // already have cached messages
    fetch('/api/chat')
      .then(r => r.json())
      .then(({ messages: hist }) => {
        const loaded = hist ?? []
        setMessages(loaded)
        if (loaded.length > 0) saveToSession(loaded)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Keep sessionStorage in sync whenever messages change
  useEffect(() => {
    if (!loading && messages.length > 0) {
      saveToSession(messages)
    }
  }, [messages, loading])

  // Auto-scroll — instant on initial load (from cache), smooth on new messages
  const isFirstScroll = useRef(true)
  useEffect(() => {
    if (!bottomRef.current) return
    if (isFirstScroll.current) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' })
      isFirstScroll.current = false
    } else {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
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
    <div className="flex flex-col h-full -m-4 md:-m-8">

      {/* Header */}
      <div className="px-4 md:px-8 py-4 md:py-5 bg-white shrink-0" style={{ borderBottom: '1px solid #e4ddd4' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#1a1410' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
                <path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="9" r="2" fill="white" stroke="none"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>Stefan</h1>
              <p className="text-xs" style={{ color: '#a89e92' }}>Pytaj o repertuar, obsadę, dostępność aktorów</p>
            </div>
          </div>
          {messages.length > 0 && !streaming && (
            <button
              onClick={() => {
                try { sessionStorage.removeItem(SESSION_KEY) } catch {}
                fetch('/api/chat/clear', { method: 'POST' }).catch(() => {})
                setMessages([])
                isFirstScroll.current = true
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors"
              style={{ color: '#7a7068', border: '1px solid #e4ddd4', background: '#faf8f5' }}
              onMouseOver={e => (e.currentTarget.style.background = '#f2ede6')}
              onMouseOut={e => (e.currentTarget.style.background = '#faf8f5')}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Wyczyść
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Ładowanie historii…</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 pb-8">
            <div>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#1a1410' }}>
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
                  className="px-3 py-2 text-xs font-medium bg-white border border-gray-200 rounded-xl hover:border-[#cec5b8] hover:bg-[#faf8f5] transition-colors"
                  style={{ color: '#3e3830' }}
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
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: '#1a1410' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M12 2a7 7 0 0 1 7 7c0 4-3 6-5 8l-2 2-2-2c-2-2-5-4-5-8a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="9" r="2" fill="white" stroke="none"/>
                    </svg>
                  </div>
                )}
                <div
                  className={`max-w-[88%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm shadow-sm border'
                  }`}
                  style={msg.role === 'user'
                    ? { background: '#1a1410', color: '#fff' }
                    : { background: '#fff', borderColor: '#e4ddd4', color: '#3e3830' }
                  }
                >
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
      <div className="px-4 md:px-8 py-3 md:py-4 shrink-0" style={{ borderTop: '1px solid #e4ddd4' }}>
        {messages.length > 0 && !streaming && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {SUGGESTIONS.slice(0, 3).map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="px-2.5 py-1 text-[11px] font-medium border rounded-lg transition-colors"
                style={{ background: '#faf8f5', color: '#7a7068', borderColor: '#e4ddd4' }}
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
            className="flex-1 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#c8102e] disabled:opacity-50 max-h-40 overflow-y-auto bg-white"
            style={{ border: '1px solid #e4ddd4', color: '#1a1410', height: 'auto' }}
            onInput={e => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 160) + 'px'
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || streaming}
            className="w-11 h-11 rounded-2xl text-white flex items-center justify-center disabled:opacity-40 transition-colors shrink-0"
            style={{ background: '#c8102e' }}
            onMouseOver={e => (e.currentTarget.style.background = '#9e0c24')}
            onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
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
