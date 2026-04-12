'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Matchday {
  id: string
  number: number
  deadline: string | null
  status: 'upcoming' | 'open' | 'closed' | 'completed'
}

interface Team { id: string; name: string }
interface Fixture { id: string; matchday_id: string; home_team_id: string; away_team_id: string }
interface League { id: string; name: string }

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'In arrivo', open: 'Aperta', closed: 'Chiusa', completed: 'Completata',
}
const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-gray-100 text-gray-500',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  completed: 'bg-blue-100 text-blue-700',
}

interface Props {
  league: League | null
  initialMatchdays: Matchday[]
  teams: Team[]
  initialFixtures: Fixture[]
}

export default function GiornateClient({ league, initialMatchdays, teams, initialFixtures }: Props) {
  const [matchdays, setMatchdays] = useState<Matchday[]>(initialMatchdays)
  const [fixtures, setFixtures] = useState<Fixture[]>(initialFixtures)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [newNumber, setNewNumber] = useState(
    initialMatchdays.length > 0 ? Math.max(...initialMatchdays.map((m) => m.number)) + 1 : 1
  )
  const [newDeadline, setNewDeadline] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [editFixtures, setEditFixtures] = useState<string | null>(null)
  const [tempFixtures, setTempFixtures] = useState<{ home: string; away: string }[]>([{ home: '', away: '' }])
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleCreate = () => {
    if (!league) { setMessage('Nessuna lega trovata. Creala prima.'); return }
    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matchdays')
        .insert({
          league_id: league.id,
          number: newNumber,
          deadline: newDeadline ? new Date(newDeadline).toISOString() : null,
          status: 'upcoming',
        })
        .select()
        .single()
      if (error) { setMessage('Errore: ' + error.message); return }
      setMatchdays((prev) => [...prev, data as Matchday].sort((a, b) => a.number - b.number))
      setShowNew(false)
      setNewNumber((n) => n + 1)
      setNewDeadline('')
      router.refresh()
    })
  }

  const handleStatusChange = (matchdayId: string, newStatus: Matchday['status']) => {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('matchdays').update({ status: newStatus }).eq('id', matchdayId)
      setMatchdays((prev) =>
        prev.map((m) => (m.id === matchdayId ? { ...m, status: newStatus } : m))
      )
      router.refresh()
    })
  }

  const handleDelete = (matchday: Matchday) => {
    if (!confirm(`Eliminare la Giornata ${matchday.number}? Tutti i dati verranno persi.`)) return
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('matchdays').delete().eq('id', matchday.id)
      setMatchdays((prev) => prev.filter((m) => m.id !== matchday.id))
    })
  }

  const handleSaveFixtures = (matchdayId: string) => {
    const valid = tempFixtures.filter((f) => f.home && f.away && f.home !== f.away)
    if (valid.length === 0) { setMessage('Inserisci almeno una sfida valida.'); return }
    startTransition(async () => {
      const supabase = createClient()
      // Elimina le sfide esistenti per questa giornata
      await supabase.from('fixtures').delete().eq('matchday_id', matchdayId)
      const { data } = await supabase
        .from('fixtures')
        .insert(valid.map((f) => ({ matchday_id: matchdayId, home_team_id: f.home, away_team_id: f.away })))
        .select()
      setFixtures((prev) => [
        ...prev.filter((f) => f.matchday_id !== matchdayId),
        ...((data as Fixture[]) || []),
      ])
      setEditFixtures(null)
      setMessage('')
      router.refresh()
    })
  }

  const openEditFixtures = (matchday: Matchday) => {
    const existing = fixtures.filter((f) => f.matchday_id === matchday.id)
    setTempFixtures(
      existing.length > 0
        ? existing.map((f) => ({ home: f.home_team_id, away: f.away_team_id }))
        : [{ home: '', away: '' }]
    )
    setEditFixtures(matchday.id)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <Link href="/admin" className="text-gray-400 text-sm block mb-2">← Admin</Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Giornate</h1>
            <p className="text-gray-400 text-sm">{matchdays.length} giornate</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-xl"
          >
            + Crea
          </button>
        </div>
      </div>

      {message && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-red-700 text-sm">{message}</p>
        </div>
      )}

      {/* Modal nuova giornata */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <h2 className="font-bold text-lg">Nuova giornata</h2>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Numero giornata</label>
              <input
                type="number" min="1"
                value={newNumber}
                onChange={(e) => setNewNumber(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Scadenza formazione (data e ora)
              </label>
              <input
                type="datetime-local"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600"
              >
                Annulla
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                Crea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal sfide */}
      {editFixtures && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Sfide</h2>
              <button onClick={() => setEditFixtures(null)} className="text-gray-400 text-xl font-bold">✕</button>
            </div>
            {tempFixtures.map((f, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={f.home}
                  onChange={(e) => setTempFixtures((prev) => prev.map((x, j) => j === i ? { ...x, home: e.target.value } : x))}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Casa</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span className="text-gray-400 font-bold text-sm shrink-0">VS</span>
                <select
                  value={f.away}
                  onChange={(e) => setTempFixtures((prev) => prev.map((x, j) => j === i ? { ...x, away: e.target.value } : x))}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Ospite</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button
                  onClick={() => setTempFixtures((prev) => prev.filter((_, j) => j !== i))}
                  className="text-red-400 font-bold text-lg shrink-0"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setTempFixtures((prev) => [...prev, { home: '', away: '' }])}
              className="w-full py-2 bg-gray-100 rounded-xl text-sm text-gray-600 font-semibold"
            >
              + Aggiungi sfida
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => setEditFixtures(null)}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600"
              >
                Annulla
              </button>
              <button
                onClick={() => handleSaveFixtures(editFixtures)}
                disabled={isPending}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                Salva sfide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista giornate */}
      <div className="px-4 py-4 space-y-3">
        {matchdays.length === 0 && (
          <div className="bg-white rounded-2xl p-6 text-center">
            <p className="text-gray-400 text-sm">Nessuna giornata. Creane una!</p>
          </div>
        )}

        {matchdays.map((matchday) => {
          const mFixtures = fixtures.filter((f) => f.matchday_id === matchday.id)
          return (
            <div key={matchday.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div
                className="px-4 py-3 flex items-center gap-3 cursor-pointer"
                onClick={() => setExpanded(expanded === matchday.id ? null : matchday.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">
                      Giornata {matchday.number}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[matchday.status]}`}>
                      {STATUS_LABELS[matchday.status]}
                    </span>
                  </div>
                  {matchday.deadline && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Scadenza:{' '}
                      {new Date(matchday.deadline).toLocaleDateString('it-IT', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        timeZone: 'Europe/Rome',
                      })}
                    </p>
                  )}
                </div>
                <span className="text-gray-400 text-sm shrink-0">
                  {expanded === matchday.id ? '▲' : '▼'}
                </span>
              </div>

              {expanded === matchday.id && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  {/* Cambia stato */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                      Stato
                    </p>
                    <div className="flex gap-2">
                      {(['upcoming', 'open', 'closed'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(matchday.id, s)}
                          disabled={isPending || matchday.status === s}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            matchday.status === s
                              ? STATUS_COLORS[s]
                              : 'bg-gray-100 text-gray-400'
                          } disabled:opacity-60`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sfide */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        Sfide ({mFixtures.length})
                      </p>
                      <button
                        onClick={() => openEditFixtures(matchday)}
                        className="text-xs text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-lg"
                      >
                        Modifica
                      </button>
                    </div>
                    {mFixtures.length === 0 ? (
                      <p className="text-xs text-gray-400">Nessuna sfida configurata</p>
                    ) : (
                      <div className="space-y-1">
                        {mFixtures.map((f) => (
                          <p key={f.id} className="text-xs text-gray-600">
                            {teams.find((t) => t.id === f.home_team_id)?.name || '?'}
                            {' vs '}
                            {teams.find((t) => t.id === f.away_team_id)?.name || '?'}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Link voti */}
                  {(matchday.status === 'closed' || matchday.status === 'completed') && (
                    <Link
                      href={`/admin/voti?giornata=${matchday.id}`}
                      className="block text-center text-sm font-bold text-green-700 bg-green-50 py-2.5 rounded-xl"
                    >
                      Inserisci voti →
                    </Link>
                  )}

                  {/* Elimina */}
                  <button
                    onClick={() => handleDelete(matchday)}
                    className="w-full text-xs text-red-500 font-semibold py-2 border border-red-100 rounded-xl"
                  >
                    Elimina giornata
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
