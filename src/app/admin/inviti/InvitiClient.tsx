'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Invitation {
  id: string
  email: string
  token: string
  used: boolean
  created_at: string
}

interface League { id: string; name: string }

interface Props {
  league: League | null
  initialInvitations: Invitation[]
}

export default function InvitiClient({ league, initialInvitations }: Props) {
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const router = useRouter()

  const siteUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://tuo-sito.vercel.app'

  const handleInvite = () => {
    if (!email.trim() || !email.includes('@')) {
      setMessage('Inserisci un indirizzo email valido.')
      setIsError(true)
      return
    }
    if (!league) {
      setMessage('Nessuna lega trovata.')
      setIsError(true)
      return
    }
    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('invitations')
        .insert({ league_id: league.id, email: email.trim().toLowerCase() })
        .select()
        .single()
      if (error) {
        setMessage('Errore nella creazione dell\'invito.')
        setIsError(true)
        return
      }
      setInvitations((prev) => [data as Invitation, ...prev])
      setEmail('')
      setIsError(false)
      setMessage(`Invito creato per ${email}!`)
      router.refresh()
    })
  }

  const copyLink = async (invitation: Invitation) => {
    const link = `${siteUrl}/login?invito=${invitation.token}`
    await navigator.clipboard.writeText(link)
    setCopiedId(invitation.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('invitations').delete().eq('id', id)
      setInvitations((prev) => prev.filter((i) => i.id !== id))
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <Link href="/admin" className="text-gray-400 text-sm block mb-2">← Admin</Link>
        <h1 className="text-xl font-bold">Inviti</h1>
        <p className="text-gray-400 text-sm">Invita i partecipanti alla lega</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Come funziona */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-blue-800 text-sm font-semibold mb-1">Come funziona</p>
          <p className="text-blue-700 text-xs">
            1. Inserisci l'email dell'amico e crea l'invito.<br />
            2. Copia il link e mandaglielo (WhatsApp, email, ecc.).<br />
            3. L'amico si registra con quella email e accede alla lega.
          </p>
        </div>

        {/* Form nuovo invito */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-800 mb-3">Nuovo invito</h2>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@esempio.it"
              className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
            <button
              onClick={handleInvite}
              disabled={isPending}
              className="bg-green-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-50 shrink-0"
            >
              {isPending ? '...' : 'Crea'}
            </button>
          </div>
          {message && (
            <p className={`text-sm mt-2 p-2 rounded-lg ${
              isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {message}
            </p>
          )}
        </div>

        {/* Lista inviti */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-800">Inviti creati</h2>
            <span className="text-xs text-gray-400">{invitations.length}</span>
          </div>

          {invitations.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">
              Nessun invito ancora
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {invitations.map((inv) => (
                <div key={inv.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{inv.email}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(inv.created_at).toLocaleDateString('it-IT', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                        {' · '}
                        {inv.used ? (
                          <span className="text-green-600 font-semibold">Usato</span>
                        ) : (
                          <span className="text-orange-500 font-semibold">Non usato</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {!inv.used && (
                        <button
                          onClick={() => copyLink(inv)}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                            copiedId === inv.id
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          {copiedId === inv.id ? 'Copiato!' : 'Copia link'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(inv.id)}
                        className="text-xs text-red-500 font-bold px-2 py-1.5 bg-red-50 rounded-lg"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
