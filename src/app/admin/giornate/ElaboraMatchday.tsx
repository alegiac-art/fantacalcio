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

interface ExistingResult {
  team_id: string
  total_score: number
  goals_scored: number
  goals_conceded: number
  points: number
}

interface Props {
  matchdayId: string
  fixtures: Fixture[]
  teams: Team[]
  votiArchivio: VotiArchivio[]
  settings: LeagueSettings
  lineupsByTeam: Record<string, LineupData>  // team_id → LineupData
  existingResults: ExistingResult[]
}

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

  // codice → voto_fanta originale dai voti importati
  const [votiOriginali, setVotiOriginali] = useState<Record<string, number | null>>({})
  // codice → voto editato dall'admin (override)
  const [editedVotes, setEditedVotes] = useState<Record<string, string>>({})

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [savedResults, setSavedResults] = useState<ExistingResult[]>(existingResults)

  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]))

  const selectedArchivio = votiArchivio.find((a) => a.id === selectedArchivioId)

  // Carica voti dalla giornata selezionata
  const handleLoadVoti = async () => {
    if (!selectedArchivio) return
    setLoadStatus('loading')
    setLoadMsg('')
    setEditedVotes({})

    const supabase = createClient()
    // Raccogli tutti i codici dei giocatori nelle formazioni
    const allCodici = Object.values(lineupsByTeam)
      .flatMap((l) => l.players)
      .map((p) => p.codice)
      .filter(Boolean) as string[]

    if (allCodici.length === 0) {
      setLoadStatus('error')
      setLoadMsg('Nessun giocatore con codice trovato nelle formazioni.')
      return
    }

    const { data, error } = await supabase
      .from('voti_giornata')
      .select('codice, voto_fanta')
      .eq('stagione', selectedArchivio.stagione)
      .eq('giornata', selectedArchivio.giornata)
      .in('codice', allCodici)

    if (error) {
      setLoadStatus('error')
      setLoadMsg(error.message)
      return
    }

    const map: Record<string, number | null> = {}
    for (const v of (data ?? [])) map[v.codice] = v.voto_fanta
    setVotiOriginali(map)
    setLoadStatus('loaded')
  }

  // Voto effettivo per un codice (edited o originale)
  const getVoto = (codice: string | null): number | null => {
    if (!codice) return null
    if (editedVotes[codice] !== undefined) {
      const n = parseFloat(editedVotes[codice].replace(',', '.'))
      return isNaN(n) ? null : n
    }
    return votiOriginali[codice] ?? null
  }

  // Calcola punteggio squadra (solo titolari)
  const calcTeamScore = (teamId: string): { score: number; goals: number; playerCount: number } => {
    const lineup = lineupsByTeam[teamId]
    if (!lineup) return { score: 0, goals: 0, playerCount: 0 }
    const starters = lineup.players.filter((p) => p.is_starter)
    let score = 0
    let playerCount = 0
    for (const p of starters) {
      const v = getVoto(p.codice)
      if (v !== null) { score += v; playerCount++ }
    }
    return { score: Math.round(score * 10) / 10, goals: calcFantaGoals(score, settings), playerCount }
  }

  const handleSave = async () => {
    if (!selectedArchivio) return
    setSaving(true)
    setSaveMsg('')

    // Converti editedVotes in numeri
    const numericEdits: Record<string, number | null> = {}
    for (const [codice, val] of Object.entries(editedVotes)) {
      const n = parseFloat(val.replace(',', '.'))
      numericEdits[codice] = isNaN(n) ? null : n
    }

    try {
      const res = await fetch('/api/admin/giornate/risultati', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchday_id: matchdayId,
          stagione: selectedArchivio.stagione,
          giornata: selectedArchivio.giornata,
          editedVotes: numericEdits,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setSaveMsg(`Errore: ${data.error ?? 'sconosciuto'}`)
        return
      }
      setSavedResults(data.results)
      setSaveMsg('Risultati salvati. Giornata segnata come Completata.')
    } catch (e) {
      setSaveMsg(`Errore: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Render team column ─────────────────────────────────────────────────────

  const renderTeamVoti = (teamId: string) => {
    const lineup = lineupsByTeam[teamId]
    const teamName = teamById[teamId]?.name ?? '—'
    const { score, goals } = calcTeamScore(teamId)
    const savedResult = savedResults.find((r) => r.team_id === teamId)

    if (!lineup) {
      return (
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-700 mb-1">{teamName}</p>
          <p className="text-xs text-gray-400 italic">Formazione non inviata</p>
        </div>
      )
    }

    const starters = lineup.players
      .filter((p) => p.is_starter)
      .sort((a, b) => {
        const roleOrder = ['P', 'D', 'C', 'A']
        return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
      })
    const bench = lineup.players
      .filter((p) => !p.is_starter)
      .sort((a, b) => a.bench_order - b.bench_order)

    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-2">
          <p className="text-xs font-bold text-gray-700 truncate">{teamName}</p>
          <span className="text-xs text-green-700 bg-green-50 px-1 rounded shrink-0">{lineup.formation}</span>
        </div>

        {/* Titolari */}
        <div className="space-y-1 mb-2">
          {starters.map((p) => {
            const voto = getVoto(p.codice)
            const isEdited = p.codice ? editedVotes[p.codice] !== undefined : false
            const missingVoto = loadStatus === 'loaded' && p.codice && votiOriginali[p.codice] === undefined && !isEdited
            return (
              <div key={p.player_id} className={`flex items-center gap-1 ${missingVoto ? 'opacity-50' : ''}`}>
                <span className={`text-xs font-bold px-1 py-px rounded shrink-0 ${ROLE_COLORS[p.role]}`}>
                  {p.role}
                </span>
                {p.asterisco && <span className="text-yellow-400 text-xs shrink-0">★</span>}
                <span className="text-xs text-gray-700 truncate flex-1">{p.name}</span>
                {loadStatus === 'loaded' && p.codice ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedVotes[p.codice] ?? (voto !== null ? String(voto) : '')}
                    onChange={(e) => setEditedVotes((prev) => ({ ...prev, [p.codice!]: e.target.value }))}
                    placeholder="sv"
                    className={`w-12 text-xs text-center border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                      isEdited ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                    }`}
                  />
                ) : loadStatus === 'loaded' ? (
                  <span className="text-xs text-gray-300 w-12 text-center">n/c</span>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Panchina (readonly, solo voti) */}
        {bench.length > 0 && loadStatus === 'loaded' && (
          <div className="pt-1.5 border-t border-gray-100 space-y-0.5">
            <p className="text-xs font-bold text-gray-400 mb-1">Panchina</p>
            {bench.map((p, i) => {
              const voto = getVoto(p.codice)
              return (
                <div key={p.player_id} className="flex items-center gap-1">
                  <span className="text-xs text-blue-400 font-black w-4 shrink-0">{i + 1}°</span>
                  <span className={`text-xs font-bold px-1 py-px rounded shrink-0 ${ROLE_COLORS[p.role]}`}>{p.role}</span>
                  {p.asterisco && <span className="text-yellow-400 text-xs shrink-0">★</span>}
                  <span className="text-xs text-gray-500 truncate flex-1">{p.name}</span>
                  <span className="text-xs text-gray-400 w-10 text-right">{voto !== null ? voto : <span className="text-gray-300">sv</span>}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Totale */}
        {loadStatus === 'loaded' && (
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Totale</span>
            <div className="text-right">
              <span className="text-sm font-black text-gray-800">{score.toFixed(1)}</span>
              <span className="text-xs text-gray-400 ml-1">pt →</span>
              <span className="text-sm font-black text-green-700 ml-1">{goals}</span>
              <span className="text-xs text-gray-400 ml-0.5">gol</span>
            </div>
          </div>
        )}

        {/* Risultato salvato */}
        {savedResult && (
          <div className="mt-1 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 text-center font-bold">
            Salvato: {savedResult.total_score.toFixed(1)}pt · {savedResult.goals_scored}gol · {savedResult.points}pt lega
          </div>
        )}
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  if (votiArchivio.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic text-center py-2">
        Nessuna giornata voti importata. Importa prima i voti.
      </div>
    )
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

      {/* Sfide con voti */}
      {fixtures.map((fixture) => {
        const homeScore = calcTeamScore(fixture.home_team_id)
        const awayScore = calcTeamScore(fixture.away_team_id)
        return (
          <div key={fixture.id} className="border border-gray-100 rounded-xl overflow-hidden">
            {/* Intestazione sfida */}
            <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">
                {teamById[fixture.home_team_id]?.name} vs {teamById[fixture.away_team_id]?.name}
              </span>
              {loadStatus === 'loaded' && (
                <span className="text-xs font-black text-gray-700">
                  {homeScore.goals} – {awayScore.goals}
                </span>
              )}
            </div>
            {/* Colonne titolari */}
            <div className="flex gap-3 p-3">
              {renderTeamVoti(fixture.home_team_id)}
              <div className="w-px bg-gray-100 shrink-0" />
              {renderTeamVoti(fixture.away_team_id)}
            </div>
          </div>
        )
      })}

      {/* Parametri soglia */}
      {loadStatus === 'loaded' && (
        <p className="text-xs text-gray-400 text-center">
          Soglia {settings.scoring.goal_threshold}pt · +1 gol ogni {settings.scoring.goal_band}pt
        </p>
      )}

      {/* Salva */}
      {loadStatus === 'loaded' && (
        <div className="space-y-2">
          {saveMsg && (
            <p className={`text-xs p-2 rounded-lg text-center ${
              saveMsg.startsWith('Errore') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
            }`}>
              {saveMsg}
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40"
          >
            {saving ? 'Salvataggio...' : 'Calcola e salva risultati'}
          </button>
        </div>
      )}
    </div>
  )
}
