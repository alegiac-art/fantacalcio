'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calcFantaGoals } from '@/lib/settings'
import type { LeagueSettings } from '@/lib/settings'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VotiArchivio { id: string; stagione: string; giornata: number; filename: string | null }
interface Team { id: string; name: string }
interface Fixture { id: string; matchday_id: string; home_team_id: string; away_team_id: string }

interface LineupPlayer {
  player_id: string; name: string; role: string; codice: string | null
  is_starter: boolean; bench_order: number; asterisco: boolean
}
interface LineupData { formation: string; players: LineupPlayer[] }
interface ExistingResult {
  team_id: string; total_score: number; goals_scored: number; goals_conceded: number; points: number
}

interface Props {
  matchdayId: string
  fixtures: Fixture[]
  teams: Team[]
  votiArchivio: VotiArchivio[]
  settings: LeagueSettings
  lineupsByTeam: Record<string, LineupData>
  existingResults: ExistingResult[]
}

// Which player's vote is actually used for a starter slot
interface EffectiveEntry {
  activePid: string; activeName: string; activeRole: string
  activeCodice: string | null; activeVoto: number | null
  originalPid: string; originalName: string
  isSubstitute: boolean
  reason: 'normal' | 'sv_sub' | 'asterisco_upgrade'
}

const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const
const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ElaboraMatchday({
  matchdayId, fixtures, teams, votiArchivio, settings, lineupsByTeam, existingResults,
}: Props) {
  const [selectedArchivioId, setSelectedArchivioId] = useState(
    votiArchivio.length > 0 ? votiArchivio[0].id : ''
  )
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loadMsg, setLoadMsg] = useState('')
  const [votiOriginali, setVotiOriginali] = useState<Record<string, number | null>>({})
  const [editedVotes, setEditedVotes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [savedResults, setSavedResults] = useState<ExistingResult[]>(existingResults)

  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]))
  const selectedArchivio = votiArchivio.find((a) => a.id === selectedArchivioId)

  // ── Voto resolution ──────────────────────────────────────────────────────────

  const getVoto = (codice: string | null): number | null => {
    if (!codice) return null
    if (editedVotes[codice] !== undefined) {
      const n = parseFloat(editedVotes[codice].replace(',', '.'))
      return isNaN(n) ? null : n
    }
    return votiOriginali[codice] ?? null
  }

  // ── Effective lineup computation ─────────────────────────────────────────────
  // Applies rules in order:
  //   Rule 4 (sv): starter has no vote → first bench player of same role with a vote
  //   Rule 3 (★):  starter has asterisco → if bench asterisco player of same role
  //                has HIGHER vote, use bench player instead

  const computeEffective = (teamId: string): EffectiveEntry[] => {
    const lineup = lineupsByTeam[teamId]
    if (!lineup) return []

    const starters = lineup.players
      .filter((p) => p.is_starter)
      .sort((a, b) => ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number]))

    // Bench sorted by bench_order, grouped by role
    const benchByRole: Record<string, LineupPlayer[]> = { P: [], D: [], C: [], A: [] }
    for (const p of lineup.players.filter((p) => !p.is_starter).sort((a, b) => a.bench_order - b.bench_order)) {
      if (benchByRole[p.role]) benchByRole[p.role].push(p)
    }

    // Bench asterisco players per role (the designated asterisco bench player)
    const benchAsteriscoByRole: Record<string, string | null> = {}
    for (const p of lineup.players.filter((p) => !p.is_starter && p.asterisco)) {
      benchAsteriscoByRole[p.role] = p.player_id
    }

    const usedBenchPids = new Set<string>()
    const effective: EffectiveEntry[] = []

    for (const starter of starters) {
      const starterVoto = getVoto(starter.codice)

      // ── Rule 4: sv replacement ──────────────────────────────────────────────
      if (starterVoto === null) {
        const benchCandidates = benchByRole[starter.role] ?? []
        let replaced = false
        for (const bp of benchCandidates) {
          if (usedBenchPids.has(bp.player_id)) continue
          const bv = getVoto(bp.codice)
          if (bv !== null) {
            usedBenchPids.add(bp.player_id)
            effective.push({
              activePid: bp.player_id, activeName: bp.name, activeRole: starter.role,
              activeCodice: bp.codice, activeVoto: bv,
              originalPid: starter.player_id, originalName: starter.name,
              isSubstitute: true, reason: 'sv_sub',
            })
            replaced = true; break
          }
        }
        if (!replaced) {
          effective.push({
            activePid: starter.player_id, activeName: starter.name, activeRole: starter.role,
            activeCodice: starter.codice, activeVoto: null,
            originalPid: starter.player_id, originalName: starter.name,
            isSubstitute: false, reason: 'normal',
          })
        }
        continue
      }

      // ── Rule 3: asterisco upgrade ───────────────────────────────────────────
      if (starter.asterisco) {
        const benchAsteriscoPid = benchAsteriscoByRole[starter.role]
        if (benchAsteriscoPid && !usedBenchPids.has(benchAsteriscoPid)) {
          const bp = lineup.players.find((p) => p.player_id === benchAsteriscoPid)
          if (bp) {
            const bv = getVoto(bp.codice)
            if (bv !== null && bv > starterVoto) {
              usedBenchPids.add(benchAsteriscoPid)
              effective.push({
                activePid: bp.player_id, activeName: bp.name, activeRole: starter.role,
                activeCodice: bp.codice, activeVoto: bv,
                originalPid: starter.player_id, originalName: starter.name,
                isSubstitute: true, reason: 'asterisco_upgrade',
              })
              continue
            }
          }
        }
      }

      // ── Normal ──────────────────────────────────────────────────────────────
      effective.push({
        activePid: starter.player_id, activeName: starter.name, activeRole: starter.role,
        activeCodice: starter.codice, activeVoto: starterVoto,
        originalPid: starter.player_id, originalName: starter.name,
        isSubstitute: false, reason: 'normal',
      })
    }

    return effective
  }

  const calcTeamResult = (teamId: string) => {
    const entries = computeEffective(teamId)
    const score = entries.reduce((s, e) => s + (e.activeVoto ?? 0), 0)
    return {
      score: Math.round(score * 10) / 10,
      goals: calcFantaGoals(score, settings),
      entries,
    }
  }

  // ── Load voti ────────────────────────────────────────────────────────────────

  const handleLoadVoti = async () => {
    if (!selectedArchivio) return
    setLoadStatus('loading'); setLoadMsg(''); setEditedVotes({})
    const supabase = createClient()
    const allCodici = Object.values(lineupsByTeam).flatMap((l) => l.players)
      .map((p) => p.codice).filter(Boolean) as string[]
    if (allCodici.length === 0) {
      setLoadStatus('error'); setLoadMsg('Nessun giocatore con codice nelle formazioni.'); return
    }
    const { data, error } = await supabase
      .from('voti_giornata').select('codice, voto_fanta')
      .eq('stagione', selectedArchivio.stagione).eq('giornata', selectedArchivio.giornata)
      .in('codice', allCodici)
    if (error) { setLoadStatus('error'); setLoadMsg(error.message); return }
    const map: Record<string, number | null> = {}
    for (const v of (data ?? [])) map[v.codice] = v.voto_fanta
    setVotiOriginali(map)
    setLoadStatus('loaded')
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedArchivio) return
    setSaving(true); setSaveMsg('')
    const fixtureResults = fixtures.map((f) => {
      const h = calcTeamResult(f.home_team_id)
      const a = calcTeamResult(f.away_team_id)
      return {
        home_team_id: f.home_team_id, away_team_id: f.away_team_id,
        home_total_score: h.score, home_goals: h.goals,
        away_total_score: a.score, away_goals: a.goals,
      }
    })
    try {
      const res = await fetch('/api/admin/giornate/risultati', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchday_id: matchdayId, fixtureResults }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setSaveMsg(`Errore: ${data.error ?? 'sconosciuto'}`); return }
      setSavedResults(data.results)
      setSaveMsg('Risultati salvati. Giornata segnata come Completata.')
    } catch (e) { setSaveMsg(`Errore: ${(e as Error).message}`) }
    finally { setSaving(false) }
  }

  // ── Render team column ────────────────────────────────────────────────────────

  const renderTeamVoti = (teamId: string) => {
    const lineup = lineupsByTeam[teamId]
    const teamName = teamById[teamId]?.name ?? '—'
    const savedResult = savedResults.find((r) => r.team_id === teamId)

    if (!lineup) return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-700 mb-1">{teamName}</p>
        <p className="text-xs text-gray-400 italic">Formazione non inviata</p>
      </div>
    )

    const { score, goals, entries } = loadStatus === 'loaded'
      ? calcTeamResult(teamId)
      : { score: 0, goals: 0, entries: [] }

    // Build lookup: originalPid → effective entry
    const entryByOriginal = Object.fromEntries(entries.map((e) => [e.originalPid, e]))
    // Set of bench player IDs that are active (contributing)
    const activeBenchPids = new Set(entries.filter((e) => e.isSubstitute).map((e) => e.activePid))

    const starters = lineup.players
      .filter((p) => p.is_starter)
      .sort((a, b) => ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number]))

    // Bench grouped by role, sorted by bench_order
    const benchByRole = ROLE_ORDER.reduce<Record<string, LineupPlayer[]>>((acc, r) => {
      acc[r] = lineup.players.filter((p) => !p.is_starter && p.role === r).sort((a, b) => a.bench_order - b.bench_order)
      return acc
    }, { P: [], D: [], C: [], A: [] })
    const hasBench = ROLE_ORDER.some((r) => benchByRole[r].length > 0)

    return (
      <div className="flex-1 min-w-0">
        {/* Team header */}
        <div className="flex items-center gap-1.5 mb-2">
          <p className="text-xs font-bold text-gray-700 truncate">{teamName}</p>
          <span className="text-xs text-green-700 bg-green-50 px-1 rounded shrink-0">{lineup.formation}</span>
        </div>

        {/* ── Titolari ──────────────────────────────────────────────────────── */}
        <div className="space-y-0.5 mb-2">
          {starters.map((p) => {
            const entry = entryByOriginal[p.player_id]
            const isReplaced = loadStatus === 'loaded' && entry?.isSubstitute
            const isActive = loadStatus === 'loaded' && entry && !entry.isSubstitute && entry.activeVoto !== null
            const voto = getVoto(p.codice)
            const isEdited = p.codice ? editedVotes[p.codice] !== undefined : false

            return (
              <div
                key={p.player_id}
                className={`flex items-center gap-1 rounded px-1 py-0.5 ${
                  isActive ? 'bg-green-50' : isReplaced ? 'opacity-40' : ''
                }`}
              >
                <span className={`text-xs font-bold px-1 py-px rounded shrink-0 ${ROLE_COLORS[p.role]}`}>{p.role}</span>
                {p.asterisco && <span className="text-yellow-400 text-xs shrink-0">★</span>}
                <span className={`text-xs truncate flex-1 ${isReplaced ? 'line-through text-gray-400' : isActive ? 'text-gray-700 font-bold' : 'text-gray-700'}`}>
                  {p.name}
                </span>
                {isReplaced && (
                  <span className="text-xs text-gray-400 shrink-0 ml-1">
                    {entry.reason === 'sv_sub' ? 'sv' : '↑'}
                  </span>
                )}
                {loadStatus === 'loaded' && p.codice ? (
                  <input
                    type="text" inputMode="decimal"
                    value={editedVotes[p.codice] ?? (voto !== null ? String(voto) : '')}
                    onChange={(e) => setEditedVotes((prev) => ({ ...prev, [p.codice!]: e.target.value }))}
                    placeholder="sv"
                    className={`w-11 text-xs text-center border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                      isEdited ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                    }`}
                  />
                ) : loadStatus === 'loaded' ? (
                  <span className="text-xs text-gray-300 w-11 text-center">n/c</span>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* ── Panchina per ruolo ────────────────────────────────────────────── */}
        {hasBench && (
          <div className="pt-1.5 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-400 mb-1">Panchina</p>
            <div className="space-y-2">
              {ROLE_ORDER.map((role) => {
                const roleBench = benchByRole[role]
                if (roleBench.length === 0) return null
                return (
                  <div key={role}>
                    <p className={`text-xs font-bold px-1 py-px rounded inline-block mb-0.5 ${ROLE_COLORS[role]}`}>{role}</p>
                    <div className="space-y-0.5">
                      {roleBench.map((p, i) => {
                        const isActiveBench = activeBenchPids.has(p.player_id)
                        const activeEntry = entries.find((e) => e.activePid === p.player_id && e.isSubstitute)
                        const voto = getVoto(p.codice)
                        const isEdited = p.codice ? editedVotes[p.codice] !== undefined : false

                        return (
                          <div
                            key={p.player_id}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 ${isActiveBench ? 'bg-green-50' : ''}`}
                          >
                            <span className="text-xs text-blue-400 font-black w-4 shrink-0">{i + 1}°</span>
                            {p.asterisco && <span className="text-yellow-400 text-xs shrink-0">★</span>}
                            <span className={`text-xs truncate flex-1 ${isActiveBench ? 'text-green-800 font-bold' : 'text-gray-500'}`}>
                              {p.name}
                            </span>
                            {isActiveBench && activeEntry && (
                              <span className={`text-xs font-bold shrink-0 ${
                                activeEntry.reason === 'sv_sub' ? 'text-blue-500' : 'text-yellow-600'
                              }`}>
                                {activeEntry.reason === 'sv_sub' ? '▶' : '★▶'}
                              </span>
                            )}
                            {loadStatus === 'loaded' && p.codice ? (
                              <input
                                type="text" inputMode="decimal"
                                value={editedVotes[p.codice] ?? (voto !== null ? String(voto) : '')}
                                onChange={(e) => setEditedVotes((prev) => ({ ...prev, [p.codice!]: e.target.value }))}
                                placeholder="sv"
                                className={`w-11 text-xs text-center border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                                  isEdited ? 'border-blue-300 bg-blue-50' : isActiveBench ? 'border-green-300 bg-green-50' : 'border-gray-200'
                                }`}
                              />
                            ) : loadStatus === 'loaded' ? (
                              <span className="text-xs text-gray-300 w-11 text-center">sv</span>
                            ) : null}
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

        {/* ── Totale ────────────────────────────────────────────────────────── */}
        {loadStatus === 'loaded' && (
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-gray-500">Totale</span>
              <span className="block text-xs text-gray-400">Giocatori con voto: {entries.filter((e) => e.activeVoto !== null).length}</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-black text-gray-800">{score.toFixed(1)}</span>
              <span className="text-xs text-gray-400 ml-1">pt →</span>
              <span className="text-sm font-black text-green-700 ml-1">{goals}</span>
              <span className="text-xs text-gray-400 ml-0.5">gol</span>
            </div>
          </div>
        )}


        {/* ── Risultato salvato ─────────────────────────────────────────────── */}
        {savedResult && (
          <div className="mt-1 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 text-center font-bold">
            Salvato: {savedResult.total_score.toFixed(1)}pt · {savedResult.goals_scored}G · {savedResult.points}pt
          </div>
        )}
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  if (votiArchivio.length === 0) {
    return <p className="text-xs text-gray-400 italic text-center py-2">Nessuna giornata voti importata.</p>
  }

  return (
    <div className="space-y-3">
      {/* Selezione voti */}
      <div className="flex gap-2">
        <select
          value={selectedArchivioId}
          onChange={(e) => { setSelectedArchivioId(e.target.value); setLoadStatus('idle'); setEditedVotes({}) }}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none bg-white"
        >
          {votiArchivio.map((a) => (
            <option key={a.id} value={a.id}>
              {a.stagione} — G{a.giornata}{a.filename ? ` (${a.filename})` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={handleLoadVoti}
          disabled={loadStatus === 'loading' || !selectedArchivioId}
          className="bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-40 whitespace-nowrap"
        >
          {loadStatus === 'loading' ? 'Caricamento...' : 'Carica voti'}
        </button>
      </div>

      {loadStatus === 'error' && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{loadMsg}</p>
      )}

      {/* Sfide */}
      {fixtures.map((fixture) => {
        const h = loadStatus === 'loaded' ? calcTeamResult(fixture.home_team_id) : null
        const a = loadStatus === 'loaded' ? calcTeamResult(fixture.away_team_id) : null
        return (
          <div key={fixture.id} className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">
                {teamById[fixture.home_team_id]?.name} vs {teamById[fixture.away_team_id]?.name}
              </span>
              {h && a && (
                <span className="text-xs font-black text-gray-700">{h.goals} – {a.goals}</span>
              )}
            </div>
            <div className="flex gap-3 p-3">
              {renderTeamVoti(fixture.home_team_id)}
              <div className="w-px bg-gray-100 shrink-0" />
              {renderTeamVoti(fixture.away_team_id)}
            </div>
          </div>
        )
      })}

      {/* Legenda + soglia */}
      {loadStatus === 'loaded' && (
        <div className="text-xs text-gray-400 space-y-0.5">
          <p className="text-center">Soglia {settings.scoring.goal_threshold}pt · +1 gol ogni {settings.scoring.goal_band}pt</p>
          <div className="flex justify-center gap-4">
            <span><span className="text-blue-500 font-bold">▶</span> subentra (sv)</span>
            <span><span className="text-yellow-600 font-bold">★▶</span> subentra (asterisco migliore)</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-green-100 rounded inline-block" /> conta nel punteggio</span>
          </div>
        </div>
      )}

      {/* Salva */}
      {loadStatus === 'loaded' && (
        <div className="space-y-2">
          {saveMsg && (
            <p className={`text-xs p-2 rounded-lg text-center ${saveMsg.startsWith('Errore') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
              {saveMsg}
            </p>
          )}
          <button
            onClick={handleSave} disabled={saving}
            className="w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40"
          >
            {saving ? 'Salvataggio...' : 'Calcola e salva risultati'}
          </button>
        </div>
      )}
    </div>
  )
}
