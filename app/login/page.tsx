'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Błąd logowania'); setLoading(false); return }

      // Ustaw lokalny profil zgodnie z rolą (apka korzysta z profile-context).
      try {
        localStorage.setItem('profileLoggedIn', 'true')
        localStorage.setItem('profileMode', json.role === 'actor' ? 'actor' : 'coordinator')
      } catch { /* noop */ }

      const next = params.get('next')
      const dest = next && next.startsWith('/') ? next : (json.role === 'actor' ? '/actor/calendar' : '/dashboard')
      router.replace(dest)
    } catch {
      setError('Błąd połączenia')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f2ede6' }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-teatr-polonia.jpg" alt="Teatr Polonia" className="h-12 w-auto" />
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ border: '1px solid #e4ddd4' }}>
          <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.4rem', fontWeight: 700, color: '#1a1410' }}>
            Logowanie
          </h1>
          <p className="text-sm mt-1 mb-5" style={{ color: '#7a7068' }}>Podaj hasło dostępu, aby kontynuować.</p>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Hasło"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: '#e4ddd4' }}
            />
            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              style={{ background: '#1a1410', color: '#fff' }}
            >
              {loading ? 'Logowanie…' : 'Zaloguj'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
