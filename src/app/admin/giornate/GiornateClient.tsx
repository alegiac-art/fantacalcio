'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LeagueSettings } from '@/lib/settings'
import ElaboraMatchday from './ElaboraMatchday'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Matchday {
  id: string; number: number; deadline: string | null
  status: 'upcoming' | 'open' | 'closed' | 'completed'
}
interface Team { id: string; name: string }
interface Fixture { id: string; matchday_id: string; home_team_id: string; away_team_id: string }
interface League { id: string; name: string }
interface VotiArchivio { id: string; stagione: string; giornata: number; filename: string | null }

interface LineupPlayer {
  player_id: string; name: string; role: string; codice: string | null
  is_starter: boolean; bench_order: number; asterisco: boolean
}
interface LineupData { formation: string; players: LineupPlayer[] }
interface ResultRow {
  matchday_id: string; team_id: string
  total_score: number; goals_scored: number; goals_conceded: number; points: number
}

interface Props {
  league: League | null
  initialMatchdays: Matchday[]
  teams: Team[]
  initialFixtures: Fixture[]
  votiArchivio: VotiArchivio[]
  settings: LeagueSettings
  lineupsByMatchdayTeam: Record<string, Record<string, LineupData>>
  resultsByMatchday: Record<string, ResultRow[]>
}

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'In arrivo', open: 'Aperta', closed: 'Chiusa', completed: 'Calcolata',
}
const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-gray-100 text-gray-500',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  completed: 'bg-purple-100 text-purple-700',
}
const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}
const ROLE_ORDER = ['P', 'D', 'C', 'A']

// ── Subcomponent: formazione compatta per admin ───────────────────────────────

function LineupCompact({ lineup, teamName }: { lineup: LineupData | null; teamName: string }) {
  if (!lineup) return (
    <div className="flex-1">
      <p className="text-xs font-bold text-gray-600 mb-0.5">{teamName}</p>
      <p className="text-xs text-gray-400 italic">Formazione non inviata</p>
    </div>
  )

  const starters = lineup.players
    .filter((p) => p.is_starter)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
  const bench = lineup.players
    .filter((p) => !p.is_starter)
    .sort((a, b) => a.bench_order - b.bench_order)

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <p className="text-xs font-bold text-gray-700 truncate">{teamName}</p>
        <span className="text-xs text-green-700 bg-green-50 px-1.5 rounded shrink-0">{lineup.formation}</span>
      </div>
      <div className="space-y-0.5">
        {starters.map((p) => (
          <div key={p.player_id} className="flex items-center gap-1">
            <span className={`text-xs font-bold px-1 py-px rounded shrink-0 ${ROLE_COLORS[p.role]}`}>{p.role}</span>
            {p.asterisco && <span className="text-yellow-400 text-xs">★</span>}
            <span className="text-xs text-gray-700 truncate">{p.name}</span>
          </div>
        ))}
      </div>
      {bench.length > 0 && (
        <div className="mt-1 pt-1 border-t border-gray-100">
          <p className="text-xs text-gray-400 font-bold mb-0.5">Panchina</p>
          {bench.map((p, i) => (
            <div key={p.player_id} className="flex items-center gap-1">
              <span className="text-xs text-blue-400 font-black w-4">{i + 1}°</span>
              <span className={`text-xs font-bold px-1 py-px rounded shrink-0 ${ROLE_COLORS[p.role]}`}>{p.role}</span>
              {p.asterisco && <span className="text-yellow-400 text-xs">★</span>}
              <span className="text-xs text-gray-500 truncate">{p.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GiornateClient({
  league, initialMatchdays, teams, initialFixtures,
  votiArchivio, settings, lineupsByMatchdayTeam, resultsByMatchday,
}: Props) {
  const [matchdays, setMatchdays] = useState<Matchday[]>(initialMatchdays)
  const [fixtures, setFixtures] = useState<Fixture[]>(initialFixtures)
  const [localResultsByMatchday, setLocalResultsByMatchday] = useState<Record<string, ResultRow[]>>(resultsByMatchday)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Record<string, 'formazioni' | 'elabora'>>({})
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

  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]))

  const handleResultsSaved = (matchdayId: string, results: { team_id: string; total_score: number; goals_scored: number; goals_conceded: number; points: number }[]) => {
    setLocalResultsByMatchday((prev) => ({
      ...prev,
      [matchdayId]: results.map((r) => ({ matchday_id: matchdayId, ...r })),
    }))
    setMatchdays((prev) =>
      prev.map((m) => (m.id === matchdayId ? { ...m, status: 'completed' } : m))
    )
  }

  const getTab = (matchdayId: string) => activeTab[matchdayId] ?? 'formazioni'
  const setTab = (matchdayId: string, tab: 'formazioni' | 'elabora') =>
    setActiveTab((prev) => ({ ...prev, [matchdayId]: tab }))

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
              <input type="number" min="1" value={newNumber}
                onChange={(e) => setNewNumber(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Scadenza formazione</label>
              <input type="datetime-local" value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowNew(false)}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600">Annulla</button>
              <button onClick={handleCreate} disabled={isPending}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">Crea</button>
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
                <select value={f.home}
                  onChange={(e) => setTempFixtures((prev) => prev.map((x, j) => j === i ? { ...x, home: e.target.value } : x))}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none">
                  <option value="">Casa</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span className="text-gray-400 font-bold text-sm shrink-0">VS</span>
                <select value={f.away}
                  onChange={(e) => setTempFixtures((prev) => prev.map((x, j) => j === i ? { ...x, away: e.target.value } : x))}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none">
                  <option value="">Ospite</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={() => setTempFixtures((prev) => prev.filter((_, j) => j !== i))}
                  className="text-red-400 font-bold text-lg shrink-0">✕</button>
              </div>
            ))}
            <button onClick={() => setTempFixtures((prev) => [...prev, { home: '', away: '' }])}
              className="w-full py-2 bg-gray-100 rounded-xl text-sm text-gray-600 font-semibold">
              + Aggiungi sfida
            </button>
            <div className="flex gap-3">
              <button onClick={() => setEditFixtures(null)}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600">Annulla</button>
              <button onClick={() => handleSaveFixtures(editFixtures)} disabled={isPending}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">Salva sfide</button>
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
          const lineupsByTeam = lineupsByMatchdayTeam[matchday.id] ?? {}
          const mResults = localResultsByMatchday[matchday.id] ?? []
          const tab = getTab(matchday.id)

          // Conta formazioni inviate
          const submittedCount = mFixtures.reduce((acc, f) => {
            if (lineupsByTeam[f.home_team_id]) acc++
            if (lineupsByTeam[f.away_team_id]) acc++
            return acc
          }, 0)
          const expectedCount = mFixtures.length * 2

          return (
            <div key={matchday.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header */}
              <div
                className="px-4 py-3 flex items-center gap-3 cursor-pointer"
                onClick={() => setExpanded(expanded === matchday.id ? null : matchday.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800">Giornata {matchday.number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[matchday.status]}`}>
                      {STATUS_LABELS[matchday.status]}
                    </span>
                    {mFixtures.length > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        submittedCount === expectedCount
                          ? 'bg-green-100 text-green-700'
                          : submittedCount > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-500'
                      }`}>
                        {submittedCount}/{expectedCount} form.
                      </span>
                    )}
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
                <span className="text-gray-400 text-sm shrink-0">{expanded === matchday.id ? '▲' : '▼'}</span>
              </div>

              {expanded === matchday.id && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">

                  {/* Stato */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Stato</p>
                    <div className="flex gap-2">
                      {(['upcoming', 'open', 'closed'] as const).map((s) => (
                        <button key={s}
                          onClick={() => handleStatusChange(matchday.id, s)}
                          disabled={isPending || matchday.status === s}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            matchday.status === s ? STATUS_COLORS[s] : 'bg-gray-100 text-gray-400'
                          } disabled:opacity-60`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                      <div className={`flex-1 py-1.5 rounded-lg text-xs font-bold text-center ${
                        matchday.status === 'completed' ? STATUS_COLORS['completed'] : 'bg-gray-50 text-gray-300'
                      }`}>
                        {STATUS_LABELS['completed']}
                      </div>
                    </div>
                  </div>

                  {/* Sfide */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        Sfide ({mFixtures.length})
                      </p>
                      <button onClick={() => openEditFixtures(matchday)}
                        className="text-xs text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-lg">
                        Modifica
                      </button>
                    </div>
                    {mFixtures.length === 0 ? (
                      <p className="text-xs text-gray-400">Nessuna sfida configurata</p>
                    ) : (
                      <div className="space-y-1.5">
                        {mFixtures.map((f) => {
                          const homeResult = mResults.find((r) => r.team_id === f.home_team_id)
                          const awayResult = mResults.find((r) => r.team_id === f.away_team_id)
                          return (
                            <div key={f.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1">
                                {teamById[f.home_team_id]?.name || '?'} vs {teamById[f.away_team_id]?.name || '?'}
                              </span>
                              {homeResult && awayResult && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-xs text-gray-400">{homeResult.total_score.toFixed(1)}</span>
                                  <span className="text-xs font-black text-gray-800 bg-gray-100 px-2 py-0.5 rounded-lg">
                                    {homeResult.goals_scored} – {awayResult.goals_scored}
                                  </span>
                                  <span className="text-xs text-gray-400">{awayResult.total_score.toFixed(1)}</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Tabs: Formazioni / Elabora */}
                  {mFixtures.length > 0 && (
                    <div>
                      <div className="flex gap-1 mb-3 border-b border-gray-100">
                        {(['formazioni', 'elabora'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTab(matchday.id, t)}
                            className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${
                              tab === t
                                ? 'border-gray-800 text-gray-800'
                                : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            {t === 'formazioni' ? 'Formazioni' : 'Elabora risultati'}
                          </button>
                        ))}
                      </div>

                      {/* Tab: Formazioni */}
                      {tab === 'formazioni' && (
                        <div className="space-y-3">
                          {mFixtures.map((f) => (
                            <div key={f.id} className="border border-gray-100 rounded-xl overflow-hidden">
                              <div className="bg-gray-50 px-3 py-1.5">
                                <span className="text-xs font-bold text-gray-500">
                                  {teamById[f.home_team_id]?.name} vs {teamById[f.away_team_id]?.name}
                                </span>
                              </div>
                              <div className="flex gap-3 p-3">
                                <LineupCompact
                                  lineup={lineupsByTeam[f.home_team_id] ?? null}
                                  teamName={teamById[f.home_team_id]?.name ?? '—'}
                                />
                                <div className="w-px bg-gray-100 shrink-0" />
                                <LineupCompact
                                  lineup={lineupsByTeam[f.away_team_id] ?? null}
                                  teamName={teamById[f.away_team_id]?.name ?? '—'}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Tab: Elabora risultati */}
                      {tab === 'elabora' && (
                        <ElaboraMatchday
                          matchdayId={matchday.id}
                          fixtures={mFixtures}
                          teams={teams}
                          votiArchivio={votiArchivio}
                          settings={settings}
                          lineupsByTeam={lineupsByTeam}
                          existingResults={mResults}
                          onSaved={(results) => handleResultsSaved(matchday.id, results)}
                        />
                      )}
                    </div>
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
