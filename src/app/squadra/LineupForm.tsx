'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Player {
  id: string
  name: string
  role: string
  serie_a_team: string
}

interface RosterEntry {
  players: Player
  purchase_price: number
}

interface Props {
  teamId: string
  matchdayId: string
  matchdayNumber: number
  roster: RosterEntry[]
  existingLineupId: string | null
  existingStarters: string[]
  existingBench: string[]
}

const ROLE_ORDER = ['P', 'D', 'C', 'A']
const ROLE_LABELS: Record<string, string> = { P: 'P', D: 'D', C: 'C', A: 'A' }
const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

export default function LineupForm({
  teamId, matchdayId, matchdayNumber,
  roster, existingLineupId, existingStarters, existingBench,
}: Props) {
  const [starters, setStarters] = useState<Set<string>>(new Set(existingStarters))
  const [bench, setBench] = useState<Set<string>>(new Set(existingBench))
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const toggleStarter = (playerId: string) => {
    setStarters((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        if (next.size < 11) next.add(playerId)
        else { setMessage('Puoi selezionare al massimo 11 titolari.'); setIsError(true); return prev }
      }
      return next
    })
  }

  const toggleBench = (playerId: string) => {
    if (starters.has(playerId)) return
    setBench((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        if (next.size < 7) next.add(playerId)
        else { setMessage('Puoi selezionare al massimo 7 riserve.'); setIsError(true); return prev }
      }
      return next
    })
  }

  const validate = () => {
    if (starters.size !== 11) return 'Devi selezionare esattamente 11 titolari.'
    const starterPlayers = roster.filter((r) => starters.has(r.players.id))
    const counts: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 }
    for (const r of starterPlayers) counts[r.players.role]++
    if (counts.P !== 1) return 'Devi avere esattamente 1 Portiere tra i titolari.'
    if (counts.D < 3 || counts.D > 5) return 'Devi avere tra 3 e 5 Difensori.'
    if (counts.C < 2 || counts.C > 5) return 'Devi avere tra 2 e 5 Centrocampisti.'
    if (counts.A < 1 || counts.A > 3) return 'Devi avere tra 1 e 3 Attaccanti.'
    return null
  }

  const handleSubmit = () => {
    const error = validate()
    if (error) { setMessage(error); setIsError(true); return }

    startTransition(async () => {
      setMessage('')
      const supabase = createClient()

      // Elimina la vecchia formazione se esiste
      if (existingLineupId) {
        await supabase.from('lineup_players').delete().eq('lineup_id', existingLineupId)
        await supabase.from('lineups').delete().eq('id', existingLineupId)
      }

      // Inserisce la nuova formazione
      const { data: lineup, error: lineupError } = await supabase
        .from('lineups')
        .insert({ team_id: teamId, matchday_id: matchdayId })
        .select('id')
        .single()

      if (lineupError || !lineup) {
        setMessage('Errore nel salvataggio. Riprova.')
        setIsError(true)
        return
      }

      // Inserisce i giocatori
      const players = [
        ...[...starters].map((pid, i) => ({
          lineup_id: lineup.id, player_id: pid, is_starter: true, slot_position: i,
        })),
        ...[...bench].map((pid, i) => ({
          lineup_id: lineup.id, player_id: pid, is_starter: false, slot_position: i + 11,
        })),
      ]

      const { error: playersError } = await supabase.from('lineup_players').insert(players)

      if (playersError) {
        setMessage('Errore nel salvataggio dei giocatori. Riprova.')
        setIsError(true)
        return
      }

      setIsError(false)
      setMessage('Formazione salvata!')
      router.refresh()
    })
  }

  // Conta titolari per ruolo
  const starterCounts: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 }
  roster.filter((r) => starters.has(r.players.id)).forEach((r) => starterCounts[r.players.role]++)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 bg-green-700 text-white">
        <h2 className="font-bold">Formazione Giornata {matchdayNumber}</h2>
        <p className="text-green-200 text-xs mt-0.5">
          Titolari: {starters.size}/11 — Riserve: {bench.size}/7
        </p>
      </div>

      {/* Modulo attuale */}
      <div className="px-4 py-2 bg-green-50 border-b border-green-100 flex gap-3 text-xs font-semibold">
        {ROLE_ORDER.map((r) => (
          <span key={r} className={`${ROLE_COLORS[r]} px-2 py-0.5 rounded-full`}>
            {ROLE_LABELS[r]}: {starterCounts[r]}
          </span>
        ))}
      </div>

      {/* Lista giocatori per ruolo */}
      <div className="divide-y divide-gray-50">
        {ROLE_ORDER.map((role) => {
          const players = roster.filter((r) => r.players.role === role)
          if (players.length === 0) return null
          return (
            <div key={role}>
              <p className="px-4 py-1.5 text-xs font-bold text-gray-400 bg-gray-50">
                {role === 'P' ? 'Portieri' : role === 'D' ? 'Difensori' : role === 'C' ? 'Centrocampisti' : 'Attaccanti'}
              </p>
              {players.map(({ players: p }) => {
                const isStarter = starters.has(p.id)
                const isBench = bench.has(p.id)
                return (
                  <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ROLE_COLORS[p.role]} shrink-0`}>
                      {p.role}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.serie_a_team}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => toggleStarter(p.id)}
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                          isStarter
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        Tit.
                      </button>
                      <button
                        onClick={() => toggleBench(p.id)}
                        disabled={isStarter}
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                          isBench
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        } disabled:opacity-30`}
                      >
                        Ris.
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-100">
        {message && (
          <p className={`text-sm rounded-lg p-3 mb-3 ${
            isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {message}
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full bg-green-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          {isPending ? 'Salvataggio...' : existingLineupId ? 'Aggiorna formazione' : 'Invia formazione'}
        </button>
      </div>
    </div>
  )
}
