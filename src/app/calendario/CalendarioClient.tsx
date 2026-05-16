'use client'

import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'In arrivo',
  open: 'Aperta',
  closed: 'Chiusa',
  completed: 'Completata',
}
const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-gray-100 text-gray-500',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  completed: 'bg-blue-100 text-blue-700',
}
const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const
const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

interface LineupPlayer {
  player_id: string
  name: string
  role: string
  is_starter: boolean
  bench_order: number
  asterisco: boolean
}

interface LineupData {
  formation: string
  players: LineupPlayer[]
}

interface FixtureRow {
  matchday_id: string
  home_team_id: string
  away_team_id: string
  home_team: { id: string; name: string }
  away_team: { id: string; name: string }
}

interface ResultRow {
  matchday_id: string
  team_id: string
  total_score: number
  goals_scored: number
  goals_conceded: number
  points: number
  teams: { id: string; name: string }
}

interface Matchday {
  id: string
  number: number
  deadline: string | null
  status: string
}

interface Props {
  matchdays: Matchday[]
  myTeamId: string | null
  fixturesByMatchday: Record<string, FixtureRow[]>
  resultsByMatchday: Record<string, ResultRow[]>
  lineupsByMatchdayTeam: Record<string, Record<string, LineupData>>
}

// ── Subcomponent: formazione di una squadra ───────────────────────────────────

function TeamLineup({ lineup, teamName }: { lineup: LineupData | null; teamName: string }) {
  if (!lineup) {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-600 truncate mb-1">{teamName}</p>
        <p className="text-xs text-gray-400 italic">Formazione non inviata</p>
      </div>
    )
  }

  const starters = lineup.players
    .filter((p) => p.is_starter)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number]))

  const bench = lineup.players
    .filter((p) => !p.is_starter)
    .sort((a, b) => a.bench_order - b.bench_order)

  const startersByRole = ROLE_ORDER.reduce<Record<string, LineupPlayer[]>>((acc, r) => {
    acc[r] = starters.filter((p) => p.role === r)
    return acc
  }, { P: [], D: [], C: [], A: [] })

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-bold text-gray-700 truncate">{teamName}</p>
        <span className="text-xs font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded shrink-0">
          {lineup.formation}
        </span>
      </div>

      {/* Titolari per ruolo */}
      <div className="space-y-1">
        {ROLE_ORDER.map((role) => {
          const rp = startersByRole[role]
          if (rp.length === 0) return null
          return (
            <div key={role} className="space-y-0.5">
              {rp.map((p) => (
                <div key={p.player_id} className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold px-1 py-px rounded shrink-0 ${ROLE_COLORS[role]}`}>
                    {role}
                  </span>
                  {p.asterisco && <span className="text-yellow-400 text-xs shrink-0">★</span>}
                  <span className="text-xs text-gray-700 truncate">{p.name}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Panchina */}
      {bench.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-1">Panchina</p>
          <div className="space-y-0.5">
            {bench.map((p, i) => (
              <div key={p.player_id} className="flex items-center gap-1.5">
                <span className="text-xs text-blue-400 font-black w-4 shrink-0">{i + 1}°</span>
                <span className={`text-xs font-bold px-1 py-px rounded shrink-0 ${ROLE_COLORS[p.role]}`}>
                  {p.role}
                </span>
                {p.asterisco && <span className="text-yellow-400 text-xs shrink-0">★</span>}
                <span className="text-xs text-gray-500 truncate">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarioClient({
  matchdays,
  myTeamId,
  fixturesByMatchday,
  resultsByMatchday,
  lineupsByMatchdayTeam,
}: Props) {
  // Set of fixture keys with expanded lineups: `${matchdayId}|${homeId}|${awayId}`
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-700 text-white px-4 pt-12 pb-6">
        <h1 className="text-xl font-bold">Calendario</h1>
        <p className="text-green-200 text-sm mt-0.5">
          {matchdays.length} giornate
        </p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {matchdays.length === 0 && (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">
              Nessuna giornata ancora. L&apos;admin deve creare il calendario.
            </p>
          </div>
        )}

        {matchdays.map((matchday) => {
          const fixtures = fixturesByMatchday[matchday.id] || []
          const results = resultsByMatchday[matchday.id] || []
          const hasResults = results.some((r) => r.total_score > 0)
          const lineupsByTeam = lineupsByMatchdayTeam[matchday.id] || {}

          return (
            <div key={matchday.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header giornata */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-800">Giornata {matchday.number}</h2>
                  {matchday.deadline && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Scadenza:{' '}
                      {new Date(matchday.deadline).toLocaleDateString('it-IT', {
                        day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'Europe/Rome',
                      })}
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  STATUS_COLORS[matchday.status] || 'bg-gray-100 text-gray-500'
                }`}>
                  {STATUS_LABELS[matchday.status] || matchday.status}
                </span>
              </div>

              {/* Sfide */}
              {fixtures.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {fixtures.map((fixture) => {
                    const homeResult = results.find((r) => r.team_id === fixture.home_team_id)
                    const awayResult = results.find((r) => r.team_id === fixture.away_team_id)
                    const isMyMatch = myTeamId &&
                      (fixture.home_team_id === myTeamId || fixture.away_team_id === myTeamId)
                    const fixtureKey = `${matchday.id}|${fixture.home_team_id}|${fixture.away_team_id}`
                    const isExpanded = expanded.has(fixtureKey)

                    const homeLineup = lineupsByTeam[fixture.home_team_id] ?? null
                    const awayLineup = lineupsByTeam[fixture.away_team_id] ?? null

                    return (
                      <div
                        key={fixtureKey}
                        className={isMyMatch ? 'bg-green-50' : ''}
                      >
                        {/* Riga sfida */}
                        <div className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {/* Casa */}
                            <div className="flex-1 text-right">
                              <p className={`text-sm font-semibold truncate ${
                                isMyMatch && fixture.home_team_id === myTeamId
                                  ? 'text-green-700' : 'text-gray-800'
                              }`}>
                                {fixture.home_team?.name || '—'}
                              </p>
                              {hasResults && homeResult && (
                                <p className="text-xs text-gray-400">{homeResult.total_score.toFixed(1)} pt</p>
                              )}
                            </div>

                            {/* Score o VS */}
                            <div className="shrink-0 w-16 text-center">
                              {hasResults && homeResult && awayResult ? (
                                <div>
                                  <p className="text-sm font-black text-gray-800">
                                    {homeResult.goals_scored} – {awayResult.goals_scored}
                                  </p>
                                  <p className="text-xs text-gray-400">fantaG</p>
                                </div>
                              ) : (
                                <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                  VS
                                </span>
                              )}
                            </div>

                            {/* Ospite */}
                            <div className="flex-1 text-left">
                              <p className={`text-sm font-semibold truncate ${
                                isMyMatch && fixture.away_team_id === myTeamId
                                  ? 'text-green-700' : 'text-gray-800'
                              }`}>
                                {fixture.away_team?.name || '—'}
                              </p>
                              {hasResults && awayResult && (
                                <p className="text-xs text-gray-400">{awayResult.total_score.toFixed(1)} pt</p>
                              )}
                            </div>
                          </div>

                          {/* Pulsante formazioni */}
                          <button
                            onClick={() => toggleExpand(fixtureKey)}
                            className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
                          >
                            <span>{isExpanded ? 'Nascondi formazioni' : 'Vedi formazioni'}</span>
                            <span className="text-gray-300">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                        </div>

                        {/* Sezione formazioni espansa */}
                        {isExpanded && (
                          <div className={`px-4 pb-4 border-t border-gray-100 pt-3 ${isMyMatch ? 'bg-green-50' : 'bg-gray-50'}`}>
                            <div className="flex gap-4">
                              <TeamLineup
                                lineup={homeLineup}
                                teamName={fixture.home_team?.name || '—'}
                              />
                              <div className="w-px bg-gray-200 shrink-0" />
                              <TeamLineup
                                lineup={awayLineup}
                                teamName={fixture.away_team?.name || '—'}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 px-4 py-3 text-center">
                  Nessuna sfida programmata
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
