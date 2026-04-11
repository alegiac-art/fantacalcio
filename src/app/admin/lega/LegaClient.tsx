'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface League { id: string; name: string; season: string }

interface Props {
  userId: string
  currentLeague: League | null
  currentDisplayName: string | null
}

export default function LegaClient({ userId, currentLeague, currentDisplayName }: Props) {
  const [leagueName, setLeagueName] = useState(currentLeague?.name || '')
  const [season, setSeason] = useState(currentLeague?.season || '2024-25')
  const [displayName, setDisplayName] = useState(currentDisplayName || '')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleSave = () => {
    if (!leagueName.trim()) { setMessage('Il nome della lega è obbligatorio.'); setIsError(true); return }
    startTransition(async () => {
      const supabase = createClient()
      setMessage('')

      if (currentLeague) {
        const { error } = await supabase
          .from('leagues')
          .update({ name: leagueName.trim(), season })
          .eq('id', currentLeague.id)
        if (error) { setMessage('Errore nel salvataggio.'); setIsError(true); return }
      } else {
        const { error } = await supabase
          .from('leagues')
          .insert({ name: leagueName.trim(), season, admin_id: userId })
        if (error) { setMessage('Errore nella creazione della lega.'); setIsError(true); return }
      }

      if (displayName.trim()) {
        await supabase
          .from('profiles')
          .update({ display_name: displayName.trim() })
          .eq('id', userId)
      }

      setIsError(false)
      setMessage(currentLeague ? 'Lega aggiornata!' : 'Lega creata!')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <Link href="/admin" className="text-gray-400 text-sm block mb-2">← Admin</Link>
        <h1 className="text-xl font-bold">Impostazioni Lega</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {!currentLeague && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-amber-800 text-sm font-semibold">Primo avvio</p>
            <p className="text-amber-700 text-xs mt-1">
              Crea la tua lega per iniziare. Potrai aggiungere squadre e giocatori in seguito.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Nome della lega</label>
            <input
              type="text"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Es. Lega degli Amici 2024"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Stagione</label>
            <input
              type="text"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Es. 2024-25"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Il tuo nome (visibile in app)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Es. Marco"
            />
          </div>

          {message && (
            <p className={`text-sm p-3 rounded-xl ${
              isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {message}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={isPending}
            className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
          >
            {isPending ? 'Salvataggio...' : currentLeague ? 'Aggiorna lega' : 'Crea lega'}
          </button>
        </div>
      </div>
    </div>
  )
}
