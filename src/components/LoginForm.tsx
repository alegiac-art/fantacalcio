'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup' | 'forgot'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const router = useRouter()

  const switchMode = (next: Mode) => { setMode(next); setMessage('') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setLoading(true)
    const supabase = createClient()

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setIsError(false)
        setMessage('Registrazione avvenuta! Controlla la tua email per confermare il tuo account.')
      } else if (mode === 'forgot') {
        const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        setIsError(false)
        setMessage('Email inviata! Controlla la tua casella e clicca il link per reimpostare la password.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/')
        router.refresh()
      }
    } catch (err: unknown) {
      setIsError(true)
      if (err instanceof Error) {
        if (err.message.includes('Invalid login credentials')) {
          setMessage('Email o password non corretti.')
        } else if (err.message.includes('Email not confirmed')) {
          setMessage('Devi confermare la tua email prima di accedere.')
        } else {
          setMessage(err.message)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      {mode === 'forgot' && (
        <div className="mb-4">
          <h2 className="font-bold text-gray-800">Password dimenticata</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Inserisci la tua email e ti mandiamo un link per reimpostare la password.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="la.tua@email.com"
          />
        </div>

        {mode !== 'forgot' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="minimo 6 caratteri"
            />
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs text-gray-400 hover:text-gray-600 mt-1 underline"
              >
                Password dimenticata?
              </button>
            )}
          </div>
        )}

        {message && (
          <p className={`text-sm rounded-lg p-3 ${
            isError
              ? 'text-red-700 bg-red-50 border border-red-200'
              : 'text-green-700 bg-green-50 border border-green-200'
          }`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
        >
          {loading
            ? 'Caricamento...'
            : mode === 'signup'
              ? 'Registrati'
              : mode === 'forgot'
                ? 'Invia email di reset'
                : 'Accedi'}
        </button>
      </form>

      <div className="text-center text-sm text-gray-500 mt-4 space-y-1">
        {mode === 'forgot' ? (
          <button onClick={() => switchMode('login')} className="text-green-600 font-medium underline">
            Torna al login
          </button>
        ) : (
          <p>
            {mode === 'signup' ? 'Hai già un account?' : 'Non hai un account?'}{' '}
            <button
              onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
              className="text-green-600 font-medium underline"
            >
              {mode === 'signup' ? 'Accedi' : 'Registrati'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
