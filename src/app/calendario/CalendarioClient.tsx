'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'In arrivo',
  open: 'Aperta',
  closed: 'Chiusa',
  completed: 'Calcolata',
}
const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-gray-100 text-gray-500',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  completed: 'bg-purple-100 text-purple-700',
}
const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const
const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineupPlayer {
  player_id: string
  name: string
  role: string
  codice: string | null
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
  voti_archivio: { stagione: string; giornata: number } | null
}

interface Props {
  matchdays: Matchday[]
  myTeamId: string | null
  fixturesByMatchday: Record<string, FixtureRow[]>
  resultsByMatchday: Record<string, ResultRow[]>
  lineupsByMatchdayTeam: Record<string, Record<string, LineupData>>
}

// ── computeEffective ─────────────────────────────────────────────────────────
// Returns the set of player_ids whose vote actually counts in the score.
// Mirrors the same rules as ElaboraMatchday:
//   Rule 4: starter sv → first bench of same role with a vote
//   Rule 3: starter ★ → bench ★ of same role if higher vote → use bench

function computeActivePids(
  lineup: LineupData,
  voti: Record<string, number | null>,
): Set<string> {
  const getVoto = (codice: string | null) =>
    codice !== null ? (voti[codice] ?? null) : null

  const starters = lineup.players
    .filter((p) => p.is_starter)
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) -
        ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number]),
    )

  const benchByRole: Record<string, LineupPlayer[]> = { P: [], D: [], C: [], A: [] }
  for (const p of lineup.players
    .filter((p) => !p.is_starter)
    .sort((a, b) => a.bench_order - b.bench_order)) {
    if (benchByRole[p.role]) benchByRole[p.role].push(p)
  }

  const benchAsteriscoByRole: Record<string, string | null> = {}
  for (const p of lineup.players.filter((p) => !p.is_starter && p.asterisco)) {
    benchAsteriscoByRole[p.role] = p.player_id
  }

  const usedBenchPids = new Set<string>()
  const activePids = new Set<string>()

  for (const starter of starters) {
    const starterVoto = getVoto(starter.codice)

    // Rule 4: sv → first bench with vote
    if (starterVoto === null) {
      for (const bp of benchByRole[starter.role] ?? []) {
        if (usedBenchPids.has(bp.player_id)) continue
        const bv = getVoto(bp.codice)
        if (bv !== null) {
          usedBenchPids.add(bp.player_id)
          activePids.add(bp.player_id)
          break
        }
      }
      continue
    }

    // Rule 3: asterisco upgrade
    if (starter.asterisco) {
      const bPid = benchAsteriscoByRole[starter.role]
      if (bPid && !usedBenchPids.has(bPid)) {
        const bp = lineup.players.find((p) => p.player_id === bPid)
        if (bp) {
          const bv = getVoto(bp.codice)
          if (bv !== null && bv > starterVoto) {
            usedBenchPids.add(bPid)
            activePids.add(bPid)
            continue
          }
        }
      }
    }

    // Normal
    activePids.add(starter.player_id)
  }

  return activePids
}

// ── TeamLineup ────────────────────────────────────────────────────────────────

function TeamLineup({
  lineup,
  teamName,
  voti,
  showVoti,
}: {
  lineup: LineupData | null
  teamName: string
  voti: Record<string, number | null> | null
  showVoti: boolean
}) {
  if (!lineup) {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-600 truncate mb-1">{teamName}</p>
        <p className="text-xs text-gray-400 italic">Formazione non inviata</p>
      </div>
    )
  }

  const activePids: Set<string> =
    showVoti && voti ? computeActivePids(lineup, voti) : new Set()

  const getVoto = (codice: string | null): number | null =>
    showVoti && voti && codice ? (voti[codice] ?? null) : null

  const starters = lineup.players
    .filter((p) => p.is_starter)
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) -
        ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number]),
    )

  // Bench grouped by role
  const benchByRole = ROLE_ORDER.reduce<Record<string, LineupPlayer[]>>(
    (acc, r) => {
      acc[r] = lineup.players
        .filter((p) => !p.is_starter && p.role === r)
        .sort((a, b) => a.bench_order - b.bench_order)
      return acc
    },
    { P: [], D: [], C: [], A: [] },
  )
  const hasBench = ROLE_ORDER.some((r) => benchByRole[r].length > 0)

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-bold text-gray-700 truncate">{teamName}</p>
        <span className="text-xs font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded shrink-0">
          {lineup.formation}
        </span>
      </div>

      {/* Titolari per ruolo */}
      <div className="space-y-0.5">
        {starters.map((p) => {
          const isActive = activePids.has(p.player_id)
          const isReplaced = showVoti && voti && !isActive
          const voto = getVoto(p.codice)
          return (
            <div
              key={p.player_id}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${
                isActive ? 'bg-green-50' : isReplaced ? 'opacity-40' : ''
              }`}
            >
              <span className={`text-xs font-bold px-1 py-px rounded shrink-0 ${ROLE_COLORS[p.role]}`}>
                {p.role}
              </span>
              {p.asterisco && <span className="text-yellow-400 text-xs shrink-0">★</span>}
              <span className={`text-xs truncate flex-1 ${
                isActive ? 'font-bold text-gray-800' : isReplaced ? 'line-through text-gray-400' : 'text-gray-700'
              }`}>
                {p.name}
              </span>
              {showVoti && (
                <span className={`text-xs font-bold shrink-0 ml-1 ${
                  isActive ? 'text-green-700' : 'text-gray-300'
                }`}>
                  {voto !== null ? voto.toFixed(1) : 'sv'}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Panchina per ruolo */}
      {hasBench && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-1">Panchina</p>
          <div className="space-y-2">
            {ROLE_ORDER.map((role) => {
              const roleBench = benchByRole[role]
              if (roleBench.length === 0) return null
              return (
                <div key={role}>
                  <span className={`text-xs font-bold px-1 py-px rounded inline-block mb-0.5 ${ROLE_COLORS[role]}`}>
                    {role}
                  </span>
                  <div className="space-y-0.5">
                    {roleBench.map((p) => {
                      const isActive = activePids.has(p.player_id)
                      const voto = getVoto(p.codice)
                      return (
                        <div
                          key={p.player_id}
                          className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${isActive ? 'bg-green-50' : ''}`}
                        >
                          {p.asterisco && <span className="text-yellow-400 text-xs shrink-0">★</span>}
                          <span className={`text-xs truncate flex-1 ${
                            isActive ? 'font-bold text-gray-800' : 'text-gray-500'
                          }`}>
                            {p.name}
                          </span>
                          {showVoti && (
                            <span className={`text-xs font-bold shrink-0 ml-1 ${
                              isActive ? 'text-green-700' : 'text-gray-300'
                            }`}>
                              {voto !== null ? voto.toFixed(1) : 'sv'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // voti per matchday_id: codice → voto_fanta
  const [votiByMatchday, setVotiByMatchday] = useState<Record<string, Record<string, number | null>>>({})
  const [loadingMatchdays, setLoadingMatchdays] = useState<Set<string>>(new Set())

  const loadVotiForMatchday = async (matchday: Matchday) => {
    if (!matchday.voti_archivio) return
    if (votiByMatchday[matchday.id] !== undefined) return
    if (loadingMatchdays.has(matchday.id)) return

    setLoadingMatchdays((prev) => new Set([...prev, matchday.id]))

    const lineupsByTeam = lineupsByMatchdayTeam[matchday.id] || {}
    const allCodici = Object.values(lineupsByTeam)
      .flatMap((l) => l.players)
      .map((p) => p.codice)
      .filter(Boolean) as string[]

    if (allCodici.length === 0) {
      setVotiByMatchday((prev) => ({ ...prev, [matchday.id]: {} }))
      setLoadingMatchdays((prev) => { const s = new Set(prev); s.delete(matchday.id); return s })
      return
    }

    const supabase = createClient()
    const { data } = await supabase
      .from('voti_giornata')
      .select('codice, voto_fanta')
      .eq('stagione', matchday.voti_archivio.stagione)
      .eq('giornata', matchday.voti_archivio.giornata)
      .in('codice', allCodici)

    const map: Record<string, number | null> = {}
    for (const v of data ?? []) map[v.codice] = v.voto_fanta
    setVotiByMatchday((prev) => ({ ...prev, [matchday.id]: map }))
    setLoadingMatchdays((prev) => { const s = new Set(prev); s.delete(matchday.id); return s })
  }

  const toggleExpand = (key: string, matchday: Matchday) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        if (matchday.status === 'completed' && matchday.voti_archivio) {
          loadVotiForMatchday(matchday)
        }
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-700 text-white px-4 pt-12 pb-6">
        <h1 className="text-xl font-bold">Calendario</h1>
        <p className="text-green-200 text-sm mt-0.5">{matchdays.length} giornate</p>
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
          const hasResults = results.length > 0
          const lineupsByTeam = lineupsByMatchdayTeam[matchday.id] || {}
          const matchdayVoti = votiByMatchday[matchday.id] ?? null
          const isLoadingVoti = loadingMatchdays.has(matchday.id)
          const showVoti = matchday.status === 'completed' && matchdayVoti !== null

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

                    return (
                      <div key={fixtureKey} className={isMyMatch ? 'bg-green-50' : ''}>
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
                            onClick={() => toggleExpand(fixtureKey, matchday)}
                            className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
                          >
                            {isLoadingVoti ? (
                              <span className="text-gray-300">Caricamento voti...</span>
                            ) : (
                              <>
                                <span>{isExpanded ? 'Nascondi formazioni' : 'Vedi formazioni'}</span>
                                <span className="text-gray-300">{isExpanded ? '▲' : '▼'}</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Sezione formazioni espansa */}
                        {isExpanded && (
                          <div className={`px-4 pb-4 border-t border-gray-100 pt-3 ${isMyMatch ? 'bg-green-50' : 'bg-gray-50'}`}>
                            {showVoti && (
                              <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
                                <span className="inline-flex items-center gap-1">
                                  <span className="w-3 h-3 bg-green-100 rounded inline-block" />
                                  giocatori considerati nel calcolo
                                </span>
                              </div>
                            )}
                            <div className="flex gap-4">
                              <TeamLineup
                                lineup={lineupsByTeam[fixture.home_team_id] ?? null}
                                teamName={fixture.home_team?.name || '—'}
                                voti={matchdayVoti}
                                showVoti={showVoti}
                              />
                              <div className="w-px bg-gray-200 shrink-0" />
                              <TeamLineup
                                lineup={lineupsByTeam[fixture.away_team_id] ?? null}
                                teamName={fixture.away_team?.name || '—'}
                                voti={matchdayVoti}
                                showVoti={showVoti}
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
