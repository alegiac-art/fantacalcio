'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { calcPlayerScore, calcFantaGoals, parseSettings, type LeagueSettings } from '@/lib/settings'

interface Matchday {
  id: string
  number: number
  status: string
}

interface PlayerRow {
  id: string
  name: string
  role: string
  serie_a_team: string
}

interface RatingData {
  rating: number | null
  goals: number
  assists: number
  yellow_card: boolean
  red_card: boolean
  own_goals: number
}

interface Props {
  matchdays: Matchday[]
  selectedMatchday: Matchday | null
  players: PlayerRow[]
  existingRatings: Record<string, RatingData>
  teams: { id: string; name: string }[]
  settings: LeagueSettings
}

const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

export default function VotiClient({
  matchdays, selectedMatchday, players, existingRatings, teams, settings,
}: Props) {
  const [ratings, setRatings] = useState<Record<string, RatingData>>(existingRatings)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const updateRating = (playerId: string, field: keyof RatingData, value: unknown) => {
    setRatings((prev) => {
      const existing = prev[playerId] || {
        rating: null, goals: 0, assists: 0,
        yellow_card: false, red_card: false, own_goals: 0,
      }
      return {
        ...prev,
        [playerId]: { ...existing, [field]: value },
      }
    })
  }

  const handleSaveRatings = () => {
    if (!selectedMatchday) return
    startTransition(async () => {
      setMessage('')
      const supabase = createClient()

      const toUpsert = Object.entries(ratings)
        .filter(([, r]) => r.rating !== null && r.rating !== undefined)
        .map(([playerId, r]) => ({
          matchday_id: selectedMatchday.id,
          player_id: playerId,
          rating: r.rating,
          goals: r.goals || 0,
          assists: r.assists || 0,
          yellow_card: r.yellow_card || false,
          red_card: r.red_card || false,
          own_goals: r.own_goals || 0,
        }))

      if (toUpsert.length === 0) {
        setMessage('Inserisci almeno un voto prima di salvare.')
        setIsError(true)
        return
      }

      const { error } = await supabase
        .from('ratings')
        .upsert(toUpsert, { onConflict: 'matchday_id,player_id' })

      if (error) {
        setMessage('Errore nel salvataggio. Riprova.')
        setIsError(true)
        return
      }

      setIsError(false)
      setMessage(`${toUpsert.length} voti salvati!`)
      router.refresh()
    })
  }

  const handleCalculateResults = () => {
    if (!selectedMatchday) return
    if (!confirm('Calcolare i risultati? Questo sovrascrive eventuali risultati già presenti.')) return

    startTransition(async () => {
      setMessage('')
      const supabase = createClient()

      // Recupera le formazioni e i voti
      const { data: lineups } = await supabase
        .from('lineups')
        .select('id, team_id, lineup_players(player_id, is_starter)')
        .eq('matchday_id', selectedMatchday.id)

      if (!lineups || lineups.length === 0) {
        setMessage('Nessuna formazione trovata per questa giornata.')
        setIsError(true)
        return
      }

      const { data: currentRatings } = await supabase
        .from('ratings')
        .select('player_id, rating, goals, assists, yellow_card, red_card, own_goals, players(role)')
        .eq('matchday_id', selectedMatchday.id)

      type RatingRow = {
        player_id: string
        rating: number | null
        goals: number
        assists: number
        yellow_card: boolean
        red_card: boolean
        own_goals: number
        players: { role: string }
      }

      const ratingMap: Record<string, RatingRow> = {}
      for (const r of (currentRatings as unknown as RatingRow[]) || []) {
        ratingMap[r.player_id] = r
      }

      // Calcola il punteggio per ogni squadra
      type LineupRow = {
        id: string
        team_id: string
        lineup_players: { player_id: string; is_starter: boolean }[]
      }

      const teamScores: Record<string, number> = {}
      for (const lineup of lineups as LineupRow[]) {
        const starters = lineup.lineup_players.filter((lp) => lp.is_starter)
        let total = 0
        let counted = 0
        for (const lp of starters) {
          const r = ratingMap[lp.player_id]
          if (r && r.rating) {
            total += calcPlayerScore(
              r.players.role, r.rating, r.goals, r.assists,
              r.yellow_card, r.red_card, r.own_goals, settings
            )
            counted++
          }
        }
        teamScores[lineup.team_id] = counted > 0 ? total : 0
      }

      // Recupera le sfide della giornata
      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('home_team_id, away_team_id')
        .eq('matchday_id', selectedMatchday.id)

      type FixtureRow = { home_team_id: string; away_team_id: string }

      const resultsToUpsert = []

      for (const fixture of (fixtures as FixtureRow[]) || []) {
        const homeScore = teamScores[fixture.home_team_id] || 0
        const awayScore = teamScores[fixture.away_team_id] || 0

        // Fantagol calcolati con i parametri della lega
        const homeGoals = calcFantaGoals(homeScore, settings)
        const awayGoals = calcFantaGoals(awayScore, settings)

        let homePoints = 0, awayPoints = 0
        if (homeScore > awayScore) { homePoints = 3; awayPoints = 0 }
        else if (homeScore < awayScore) { homePoints = 0; awayPoints = 3 }
        else { homePoints = 1; awayPoints = 1 }

        resultsToUpsert.push({
          matchday_id: selectedMatchday.id,
          team_id: fixture.home_team_id,
          total_score: homeScore,
          goals_scored: homeGoals,
          goals_conceded: awayGoals,
          points: homePoints,
        })
        resultsToUpsert.push({
          matchday_id: selectedMatchday.id,
          team_id: fixture.away_team_id,
          total_score: awayScore,
          goals_scored: awayGoals,
          goals_conceded: homeGoals,
          points: awayPoints,
        })
      }

      if (resultsToUpsert.length === 0) {
        setMessage('Nessuna sfida trovata. Configura il calendario prima.')
        setIsError(true)
        return
      }

      const { error: resultsError } = await supabase
        .from('results')
        .upsert(resultsToUpsert, { onConflict: 'matchday_id,team_id' })

      if (resultsError) {
        setMessage('Errore nel calcolo risultati.')
        setIsError(true)
        return
      }

      // Segna la giornata come completata
      await supabase
        .from('matchdays')
        .update({ status: 'completed' })
        .eq('id', selectedMatchday.id)

      setIsError(false)
      setMessage('Risultati calcolati! Giornata completata.')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <Link href="/admin" className="text-gray-400 text-sm block mb-2">← Admin</Link>
        <h1 className="text-xl font-bold">Inserisci Voti</h1>
        <p className="text-gray-400 text-sm">Seleziona la giornata e inserisci i voti</p>
      </div>

      {/* Selezione giornata */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">
          Giornata
        </label>
        {matchdays.length === 0 ? (
          <p className="text-sm text-gray-400">
            Nessuna giornata chiusa. Chiudi prima una giornata dalla sezione Giornate.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {matchdays.map((m) => (
              <Link
                key={m.id}
                href={`/admin/voti?giornata=${m.id}`}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                  selectedMatchday?.id === m.id
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                G{m.number}
              </Link>
            ))}
          </div>
        )}
      </div>

      {selectedMatchday && (
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-700">
              Giornata {selectedMatchday.number} — {players.length} giocatori
            </p>
            <button
              onClick={handleSaveRatings}
              disabled={isPending}
              className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
            >
              {isPending ? '...' : 'Salva voti'}
            </button>
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

          {players.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center">
              <p className="text-gray-400 text-sm">
                Nessuna formazione inviata per questa giornata.
                <br />I giocatori appariranno quando almeno una squadra invia la formazione.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 grid grid-cols-12 gap-1 text-xs font-bold text-gray-500 uppercase">
                <span className="col-span-4">Giocatore</span>
                <span className="col-span-2 text-center">Voto</span>
                <span className="col-span-1 text-center">G</span>
                <span className="col-span-1 text-center">A</span>
                <span className="col-span-2 text-center">Card</span>
                <span className="col-span-2 text-center">AG</span>
              </div>

              <div className="divide-y divide-gray-50">
                {players.map((player) => {
                  const r = ratings[player.id] || {
                    rating: null, goals: 0, assists: 0,
                    yellow_card: false, red_card: false, own_goals: 0,
                  }
                  return (
                    <div key={player.id} className="px-3 py-2 grid grid-cols-12 gap-1 items-center">
                      <div className="col-span-4 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-bold px-1 rounded ${ROLE_COLORS[player.role]} shrink-0`}>
                            {player.role}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-gray-800 truncate mt-0.5">
                          {player.name}
                        </p>
                      </div>
                      {/* Voto */}
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0" max="10" step="0.5"
                          value={r.rating ?? ''}
                          onChange={(e) => updateRating(
                            player.id, 'rating',
                            e.target.value === '' ? null : parseFloat(e.target.value)
                          )}
                          className="w-full border border-gray-200 rounded-lg px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                          placeholder="—"
                        />
                      </div>
                      {/* Gol */}
                      <div className="col-span-1">
                        <input
                          type="number" min="0" max="9"
                          value={r.goals || 0}
                          onChange={(e) => updateRating(player.id, 'goals', parseInt(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </div>
                      {/* Assist */}
                      <div className="col-span-1">
                        <input
                          type="number" min="0" max="9"
                          value={r.assists || 0}
                          onChange={(e) => updateRating(player.id, 'assists', parseInt(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </div>
                      {/* Cartellini */}
                      <div className="col-span-2 flex gap-1 justify-center">
                        <button
                          onClick={() => updateRating(player.id, 'yellow_card', !r.yellow_card)}
                          className={`w-7 h-7 rounded text-xs font-black transition-colors ${
                            r.yellow_card ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          G
                        </button>
                        <button
                          onClick={() => updateRating(player.id, 'red_card', !r.red_card)}
                          className={`w-7 h-7 rounded text-xs font-black transition-colors ${
                            r.red_card ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          R
                        </button>
                      </div>
                      {/* Autogol */}
                      <div className="col-span-2">
                        <input
                          type="number" min="0" max="9"
                          value={r.own_goals || 0}
                          onChange={(e) => updateRating(player.id, 'own_goals', parseInt(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Calcola risultati */}
          {selectedMatchday.status !== 'completed' && (
            <button
              onClick={handleCalculateResults}
              disabled={isPending}
              className="w-full bg-gray-800 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50 mt-4"
            >
              Calcola risultati e chiudi giornata
            </button>
          )}
          {selectedMatchday.status === 'completed' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-center">
              <p className="text-blue-700 text-sm font-semibold">Giornata completata ✓</p>
              <button
                onClick={handleCalculateResults}
                disabled={isPending}
                className="text-blue-600 text-xs underline mt-1"
              >
                Ricalcola risultati
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
