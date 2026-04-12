import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  // Statistiche rapide
  const [
    { count: playerCount },
    { count: teamCount },
    { count: matchdayCount },
    { data: openMatchday },
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('teams').select('*', { count: 'exact', head: true }),
    supabase.from('matchdays').select('*', { count: 'exact', head: true }),
    supabase.from('matchdays').select('*').eq('status', 'open').maybeSingle(),
  ])

  const adminSections = [
    {
      href: '/admin/lega',
      icon: '⚙️',
      title: 'Impostazioni Lega',
      description: 'Configura il nome della lega e le impostazioni generali',
      color: 'bg-gray-50 border-gray-200',
    },
    {
      href: '/admin/giornate',
      icon: '📅',
      title: 'Giornate',
      description: 'Crea e gestisci le giornate, apri/chiudi, inserisci le sfide',
      color: 'bg-blue-50 border-blue-100',
    },
    {
      href: '/admin/voti',
      icon: '📊',
      title: 'Inserisci Voti',
      description: 'Inserisci i voti dei giocatori per una giornata e calcola i risultati',
      color: 'bg-green-50 border-green-100',
    },
    {
      href: '/admin/giocatori',
      icon: '⚽',
      title: 'Giocatori Serie A',
      description: 'Aggiungi, modifica o elimina i giocatori di Serie A',
      color: 'bg-orange-50 border-orange-100',
    },
    {
      href: '/admin/squadre',
      icon: '🏟️',
      title: 'Squadre e Rose',
      description: 'Crea squadre, assegna ai proprietari, gestisci le rose',
      color: 'bg-purple-50 border-purple-100',
    },
    {
      href: '/admin/inviti',
      icon: '✉️',
      title: 'Inviti',
      description: 'Invia inviti via email agli altri partecipanti della lega',
      color: 'bg-pink-50 border-pink-100',
    },
    {
      href: '/admin/impostazioni',
      icon: '🎛️',
      title: 'Parametri lega',
      description: 'Configura limiti rosa, soglia gol e fascia per gol aggiuntivo',
      color: 'bg-teal-50 border-teal-100',
    },
    {
      href: '/admin/voti-import',
      icon: '📥',
      title: 'Import Voti Serie A',
      description: 'Scarica e archivia i voti ufficiali da PianetaFanta',
      color: 'bg-indigo-50 border-indigo-100',
    },
    {
      href: '/admin/voti-giornata',
      icon: '📋',
      title: 'Archivio Voti Importati',
      description: 'Visualizza, modifica ed elimina i voti importati per giornata',
      color: 'bg-cyan-50 border-cyan-100',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">ADMIN</span>
        </div>
        <h1 className="text-xl font-bold">Pannello di controllo</h1>
        <p className="text-gray-400 text-sm mt-0.5">Gestione della lega</p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Statistiche */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100">
            <p className="text-2xl font-black text-gray-800">{playerCount || 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">Giocatori</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100">
            <p className="text-2xl font-black text-gray-800">{teamCount || 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">Squadre</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100">
            <p className="text-2xl font-black text-gray-800">{matchdayCount || 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">Giornate</p>
          </div>
        </div>

        {/* Alert giornata aperta */}
        {openMatchday && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-green-800 font-semibold text-sm">
                Giornata {openMatchday.number} è aperta
              </p>
              {openMatchday.deadline && (
                <p className="text-green-600 text-xs mt-0.5">
                  Scadenza:{' '}
                  {new Date(openMatchday.deadline).toLocaleDateString('it-IT', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
            </div>
            <Link href="/admin/giornate" className="text-green-700 text-xs font-bold underline shrink-0">
              Gestisci
            </Link>
          </div>
        )}

        {/* Sezioni admin */}
        <div className="space-y-3">
          {adminSections.map(({ href, icon, title, description, color }) => (
            <Link
              key={href}
              href={href}
              className={`block bg-white rounded-2xl p-4 shadow-sm border ${color} hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
                <span className="text-gray-400 shrink-0">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
