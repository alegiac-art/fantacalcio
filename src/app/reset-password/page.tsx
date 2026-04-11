'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setIsError(true)
      setMessage('Le password non coincidono.')
      return
    }
    setLoading(true)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setIsError(true)
      setMessage('Errore nel salvataggio della password. Il link potrebbe essere scaduto.')
      return
    }
    setIsError(false)
    setMessage('Password aggiornata! Reindirizzamento...')
    setTimeout(() => { router.push('/'); router.refresh() }, 1500)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-gray-800">Nuova password</h1>
          <p className="text-gray-500 text-sm mt-1">Scegli una nuova password per il tuo account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nuova password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="minimo 6 caratteri"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conferma password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="ripeti la password"
              />
            </div>

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
              {loading ? 'Salvataggio...' : 'Aggiorna password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
