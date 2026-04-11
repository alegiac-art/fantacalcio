'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LeagueSettings } from '@/lib/settings'

interface Profile { id: string; display_name: string | null; email: string }
interface Player { id: string; name: string; role: string; serie_a_team: string }
interface RosterEntry { id: string; purchase_price: number; players: Player }
interface Team {
  id: string
  name: string
  owner_id: string | null
  profiles: Profile | null
  rosters: RosterEntry[]
}
interface League { id: string; name: string }

const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

const ROLE_LABELS: Record<string, string> = {
  P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti',
}

interface Props {
  league: League | null
  initialTeams: Team[]
  profiles: Profile[]
  allPlayers: Player[]
  settings: LeagueSettings
}

export default function SquadreClient({ league, initialTeams, profiles, allPlayers, settings }: Props) {
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [showNewTeamForm, setShowNewTeamForm] = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState<string | null>(null)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamOwner, setNewTeamOwner] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerPrice, setPlayerPrice] = useState(1)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) { setMessage('Inserisci il nome della squadra.'); return }
    if (!league) { setMessage('Crea prima una lega.'); return }
    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('teams')
        .insert({
          name: newTeamName.trim(),
          league_id: league.id,
          owner_id: newTeamOwner || null,
        })
        .select('id, name, owner_id, profiles(id, display_name, email)')
        .single()
      if (error) { setMessage('Errore nella creazione.'); return }
      setTeams((prev) => [...prev, { ...(data as unknown as Team), rosters: [] }])
      setShowNewTeamForm(false)
      setNewTeamName('')
      setNewTeamOwner('')
      setMessage('')
      router.refresh()
    })
  }

  const handleDeleteTeam = (team: Team) => {
    if (!confirm(`Eliminare la squadra "${team.name}"? Verranno eliminati anche tutti i dati collegati.`)) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('teams').delete().eq('id', team.id)
      if (error) { setMessage('Errore nell\'eliminazione.'); return }
      setTeams((prev) => prev.filter((t) => t.id !== team.id))
    })
  }

  const handleAssignOwner = (teamId: string, ownerId: string) => {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('teams').update({ owner_id: ownerId || null }).eq('id', teamId)
      setTeams((prev) => prev.map((t) => {
        if (t.id !== teamId) return t
        const ownerProfile = profiles.find((p) => p.id === ownerId) || null
        return { ...t, owner_id: ownerId, profiles: ownerProfile }
      }))
      router.refresh()
    })
  }

  const handleAddPlayerToRoster = (teamId: string, player: Player) => {
    const team = teams.find((t) => t.id === teamId)!
    const roleKey = `max_${player.role}` as keyof typeof settings.roster
    const countInRole = team.rosters.filter((r) => r.players.role === player.role).length
    const maxForRole = settings.roster[roleKey] as number
    if (countInRole >= maxForRole) {
      setMessage(`Limite ${ROLE_LABELS[player.role]} raggiunto (max ${maxForRole}).`)
      return
    }
    if (team.rosters.length >= settings.roster.max_total) {
      setMessage(`Rosa completa: limite di ${settings.roster.max_total} giocatori raggiunto.`)
      return
    }
    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('rosters')
        .insert({ team_id: teamId, player_id: player.id, purchase_price: playerPrice })
        .select('id, purchase_price')
        .single()
      if (error) {
        setMessage(error.code === '23505' ? 'Il giocatore è già in questa rosa.' : 'Errore.')
        return
      }
      setTeams((prev) => prev.map((t) =>
        t.id !== teamId ? t : {
          ...t,
          rosters: [...t.rosters, { id: (data as { id: string }).id, purchase_price: playerPrice, players: player }],
        }
      ))
      setShowAddPlayer(null)
      setPlayerSearch('')
      setPlayerPrice(1)
    })
  }

  const handleRemoveFromRoster = (teamId: string, rosterId: string, playerName: string) => {
    if (!confirm(`Rimuovere ${playerName} dalla rosa?`)) return
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('rosters').delete().eq('id', rosterId)
      setTeams((prev) => prev.map((t) =>
        t.id !== teamId ? t : { ...t, rosters: t.rosters.filter((r) => r.id !== rosterId) }
      ))
    })
  }

  const usedPlayerIds = new Set(
    teams.flatMap((t) => t.rosters.map((r) => r.players.id))
  )

  const filteredPlayers = allPlayers.filter(
    (p) =>
      !usedPlayerIds.has(p.id) &&
      (p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
        p.serie_a_team.toLowerCase().includes(playerSearch.toLowerCase()))
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <Link href="/admin" className="text-gray-400 text-sm block mb-2">← Admin</Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Squadre e Rose</h1>
            <p className="text-gray-400 text-sm">{teams.length} squadre</p>
          </div>
          <button
            onClick={() => setShowNewTeamForm(true)}
            className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-xl"
          >
            + Squadra
          </button>
        </div>
      </div>

      {message && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-red-700 text-sm">{message}</p>
        </div>
      )}

      {/* Form nuova squadra */}
      {showNewTeamForm && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <h2 className="font-bold text-lg">Nuova squadra</h2>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nome squadra</label>
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Es. La Furia Granata"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Proprietario (opzionale)
              </label>
              <select
                value={newTeamOwner}
                onChange={(e) => setNewTeamOwner(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">— Nessuno per ora —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || p.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowNewTeamForm(false); setMessage('') }}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600"
              >
                Annulla
              </button>
              <button
                onClick={handleCreateTeam}
                disabled={isPending}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                Crea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista squadre */}
      <div className="px-4 py-4 space-y-3">
        {teams.length === 0 && (
          <div className="bg-white rounded-2xl p-6 text-center">
            <p className="text-gray-400 text-sm">Nessuna squadra. Creane una!</p>
          </div>
        )}

        {teams.map((team) => (
          <div key={team.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header squadra */}
            <div
              className="px-4 py-3 flex items-center gap-3 cursor-pointer"
              onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800">{team.name}</p>
                <p className="text-xs text-gray-500">
                  {team.profiles
                    ? team.profiles.display_name || team.profiles.email
                    : 'Nessun proprietario'}
                  {' · '}{team.rosters.length} giocatori
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team) }}
                  className="text-xs text-red-500 font-semibold px-2 py-1 bg-red-50 rounded-lg"
                >
                  Elimina
                </button>
                <span className="text-gray-400 text-sm">
                  {expandedTeam === team.id ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {expandedTeam === team.id && (
              <div className="border-t border-gray-100">
                {/* Cambia proprietario */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
                    Proprietario
                  </label>
                  <select
                    value={team.owner_id || ''}
                    onChange={(e) => handleAssignOwner(team.id, e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">— Nessuno —</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name || p.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rosa */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        Rosa ({team.rosters.length}/{settings.roster.max_total})
                      </p>
                      <div className="flex gap-2 mt-0.5">
                        {(['P', 'D', 'C', 'A'] as const).map((role) => {
                          const count = team.rosters.filter((r) => r.players.role === role).length
                          const max = settings.roster[`max_${role}`]
                          const full = count >= max
                          return (
                            <span key={role} className={`text-xs ${full ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                              {role} {count}/{max}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAddPlayer(team.id)}
                      className="text-xs text-green-600 font-bold bg-green-50 px-2.5 py-1 rounded-lg"
                    >
                      + Aggiungi
                    </button>
                  </div>

                  {team.rosters.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2 text-center">Rosa vuota</p>
                  ) : (
                    <div className="space-y-1.5">
                      {['P', 'D', 'C', 'A'].map((role) => {
                        const inRole = team.rosters.filter((r) => r.players.role === role)
                        if (inRole.length === 0) return null
                        return inRole.map((entry) => (
                          <div key={entry.id} className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[entry.players.role]}`}>
                              {entry.players.role}
                            </span>
                            <span className="text-sm text-gray-700 flex-1 truncate">
                              {entry.players.name}
                            </span>
                            <span className="text-xs text-gray-400 shrink-0">
                              {entry.purchase_price}M
                            </span>
                            <button
                              onClick={() => handleRemoveFromRoster(team.id, entry.id, entry.players.name)}
                              className="text-red-400 text-xs font-bold shrink-0 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal aggiunta giocatore */}
      {showAddPlayer && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-3 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">
                Aggiungi giocatore a{' '}
                {teams.find((t) => t.id === showAddPlayer)?.name}
              </h2>
              <button onClick={() => { setShowAddPlayer(null); setPlayerSearch('') }}
                className="text-gray-400 text-xl font-bold">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Cerca giocatore..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-gray-500">Prezzo:</span>
                <input
                  type="number" min="1" max="200"
                  value={playerPrice}
                  onChange={(e) => setPlayerPrice(parseInt(e.target.value) || 1)}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredPlayers.slice(0, 50).map((player) => (
                <button
                  key={player.id}
                  onClick={() => handleAddPlayerToRoster(showAddPlayer, player)}
                  disabled={isPending}
                  className="w-full flex items-center gap-2 py-2.5 border-b border-gray-50 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[player.role]}`}>
                    {player.role}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{player.name}</p>
                    <p className="text-xs text-gray-400">{player.serie_a_team}</p>
                  </div>
                  <span className="text-green-600 text-xs font-bold shrink-0">+ Aggiungi</span>
                </button>
              ))}
              {filteredPlayers.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  {playerSearch ? 'Nessun giocatore trovato' : 'Tutti i giocatori sono già in una rosa'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
