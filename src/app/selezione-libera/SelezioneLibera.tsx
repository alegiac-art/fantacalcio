'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LeagueSettings } from '@/lib/settings'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id: string
  name: string
  role: string
  codice: string | null
  serie_a_team: string | null
}

interface VotiArchivio {
  id: string
  stagione: string
  giornata: number
  filename: string | null
}

interface Props {
  myTeamId: string | null
  teams: { id: string; name: string }[]
  players: Player[]
  playerIdsByTeam: Record<string, string[]>
  votiArchivio: VotiArchivio[]
  settings: LeagueSettings
}

// ── Card icons ────────────────────────────────────────────────────────────────

function YellowCard() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" className="inline-block shrink-0">
      <rect x="0.5" y="0.5" width="9" height="13" rx="1.5" fill="#FACC15" stroke="#CA8A04" strokeWidth="0.5" />
    </svg>
  )
}

function RedCard() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" className="inline-block shrink-0">
      <rect x="0.5" y="0.5" width="9" height="13" rx="1.5" fill="#EF4444" stroke="#B91C1C" strokeWidth="0.5" />
    </svg>
  )
}

function CardIcons({ ammonizione, espulsione }: { ammonizione: number | null; espulsione: number | null }) {
  const yellowCount = ammonizione === 1 ? 1 : ammonizione === 2 ? 2 : 0
  const hasRed = espulsione === 1
  if (yellowCount === 0 && !hasRed) return null
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {Array.from({ length: yellowCount }).map((_, i) => <YellowCard key={i} />)}
      {hasRed && <RedCard />}
    </span>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FORMATION_SIZE = 11
const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const
const ROLE_LABELS: Record<string, string> = {
  P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti',
}
const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelezioneLibera({
  myTeamId, teams, players, playerIdsByTeam, votiArchivio,
}: Props) {
  const [source, setSource] = useState<string>(myTeamId ?? 'all')
  const [search, setSearch] = useState('')
  const [selectedPids, setSelectedPids] = useState<Set<string>>(new Set())
  const [selectedArchivioId, setSelectedArchivioId] = useState(votiArchivio[0]?.id ?? '')
  const [voti, setVoti] = useState<Record<string, { voto_fanta: number | null; ammonizione: number | null; espulsione: number | null }>>({})
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loadMsg, setLoadMsg] = useState('')
  const [showSelectedPanel, setShowSelectedPanel] = useState(false)

  // ── Pool filtrato ──────────────────────────────────────────────────────────

  const pool = useMemo(() => {
    let base = players
    if (source !== 'all') {
      const pids = new Set(playerIdsByTeam[source] ?? [])
      base = players.filter((p) => pids.has(p.id))
    }
    if (search.trim()) {
      const s = search.toLowerCase()
      base = base.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          (p.serie_a_team ?? '').toLowerCase().includes(s),
      )
    }
    return base
  }, [players, source, search, playerIdsByTeam])

  const poolByRole = useMemo(
    () =>
      ROLE_ORDER.reduce<Record<string, Player[]>>((acc, r) => {
        acc[r] = pool.filter((p) => p.role === r)
        return acc
      }, { P: [], D: [], C: [], A: [] }),
    [pool],
  )

  // ── Score ─────────────────────────────────────────────────────────────────

  const selectedPlayers = useMemo(
    () => players.filter((p) => selectedPids.has(p.id)),
    [players, selectedPids],
  )

  const getVoto = (p: Player): number | null =>
    loadStatus === 'loaded' && p.codice ? (voti[p.codice]?.voto_fanta ?? null) : null

  const getCards = (p: Player) => {
    if (loadStatus !== 'loaded' || !p.codice) return { ammonizione: null, espulsione: null }
    const v = voti[p.codice]
    return { ammonizione: v?.ammonizione ?? null, espulsione: v?.espulsione ?? null }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const total = useMemo(() => {
    if (loadStatus !== 'loaded') return null
    return Math.round(selectedPlayers.reduce((s, p) => s + (getVoto(p) ?? 0), 0) * 10) / 10
  }, [selectedPlayers, voti, loadStatus])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const votedCount = useMemo(
    () => selectedPlayers.filter((p) => getVoto(p) !== null).length,
    [selectedPlayers, voti, loadStatus],
  )

  const missing = Math.max(0, FORMATION_SIZE - selectedPids.size)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const togglePlayer = (pid: string) => {
    setSelectedPids((prev) => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  const handleSourceChange = (newSource: string) => {
    setSource(newSource)
    setSearch('')
  }

  const handleLoadVoti = async () => {
    const archivio = votiArchivio.find((a) => a.id === selectedArchivioId)
    if (!archivio) return
    setLoadStatus('loading'); setLoadMsg('')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('voti_giornata')
      .select('codice, voto_fanta, ammonizione, espulsione')
      .eq('stagione', archivio.stagione)
      .eq('giornata', archivio.giornata)
    if (error) { setLoadStatus('error'); setLoadMsg(error.message); return }
    const map: Record<string, { voto_fanta: number | null; ammonizione: number | null; espulsione: number | null }> = {}
    for (const v of data ?? []) map[v.codice] = { voto_fanta: v.voto_fanta, ammonizione: v.ammonizione, espulsione: v.espulsione }
    setVoti(map)
    setLoadStatus('loaded')
  }

  const selectedArchivio = votiArchivio.find((a) => a.id === selectedArchivioId)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-indigo-700 text-white px-4 pt-12 pb-4">
        <h1 className="text-xl font-bold">Selezione Libera</h1>
        <p className="text-indigo-200 text-sm mt-0.5">Componi una formazione e calcola il punteggio</p>
      </div>

      {/* ── Barra di stato sticky ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        {/* Riga principale */}
        <div className="px-4 py-2.5 flex items-center gap-3">
          {/* Contatore selezionati */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className={`text-sm font-black tabular-nums ${selectedPids.size === FORMATION_SIZE ? 'text-green-600' : 'text-indigo-700'}`}>
              {selectedPids.size}
            </span>
            <span className="text-xs text-gray-400 font-medium">/{FORMATION_SIZE}</span>
            {missing > 0 ? (
              <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-lg font-semibold ml-1 shrink-0">
                mancano {missing}
              </span>
            ) : (
              <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-lg font-semibold ml-1 shrink-0">
                completa ✓
              </span>
            )}
            {selectedPids.size > 0 && (
              <button
                onClick={() => setSelectedPids(new Set())}
                className="text-xs text-gray-400 underline ml-1 shrink-0"
              >
                azzera
              </button>
            )}
          </div>

          {/* Totale */}
          {total !== null ? (
            <div className="text-right shrink-0">
              <span className="text-lg font-black text-indigo-700 tabular-nums">{total.toFixed(1)}</span>
              <span className="text-xs text-gray-400 ml-1">pt</span>
              {selectedPids.size > 0 && (
                <span className="text-xs text-gray-400 block leading-none">
                  {votedCount}/{selectedPids.size} con voto
                </span>
              )}
            </div>
          ) : loadStatus === 'idle' ? (
            <span className="text-xs text-gray-300 shrink-0">carica voti →</span>
          ) : loadStatus === 'loading' ? (
            <span className="text-xs text-indigo-400 shrink-0">caricamento...</span>
          ) : null}

          {/* Toggle pannello selezionati */}
          <button
            onClick={() => setShowSelectedPanel((v) => !v)}
            disabled={selectedPids.size === 0}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              selectedPids.size === 0
                ? 'text-gray-200'
                : showSelectedPanel
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={showSelectedPanel ? 'Nascondi selezionati' : 'Mostra selezionati'}
          >
            <svg className={`w-4 h-4 transition-transform ${showSelectedPanel ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Pannello giocatori selezionati (espandibile) */}
        {showSelectedPanel && selectedPids.size > 0 && (
          <div className="border-t border-gray-100 px-4 py-3 max-h-64 overflow-y-auto bg-gray-50">
            {selectedPids.size === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-1">Nessun giocatore selezionato</p>
            ) : (
              <div className="space-y-2">
                {ROLE_ORDER.map((role) => {
                  const rp = selectedPlayers.filter((p) => p.role === role)
                  if (rp.length === 0) return null
                  return (
                    <div key={role}>
                      <span className={`text-xs font-bold px-1.5 py-px rounded inline-block mb-1 ${ROLE_COLORS[role]}`}>
                        {role}
                      </span>
                      <div className="space-y-0.5">
                        {rp.map((p) => {
                          const voto = getVoto(p)
                          return (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-700 flex-1 truncate font-medium">{p.name}</span>
                              {total !== null && (
                                <span className="flex items-center gap-1 shrink-0">
                                  <CardIcons {...getCards(p)} />
                                  <span className={`text-xs font-bold tabular-nums ${voto !== null ? 'text-indigo-600' : 'text-gray-300'}`}>
                                    {voto !== null ? voto.toFixed(1) : 'sv'}
                                  </span>
                                </span>
                              )}
                              <button
                                onClick={() => togglePlayer(p.id)}
                                className="text-gray-300 hover:text-red-400 shrink-0 transition-colors"
                                title="Rimuovi"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-3">

        {/* ── Voti giornata (in cima) ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Voti giornata</p>
          {votiArchivio.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Nessuna giornata voti importata.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <select
                  value={selectedArchivioId}
                  onChange={(e) => {
                    setSelectedArchivioId(e.target.value)
                    setLoadStatus('idle')
                    setVoti({})
                  }}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 focus:outline-none bg-white"
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
                  className="bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-40 whitespace-nowrap"
                >
                  {loadStatus === 'loading' ? 'Caricamento...' : 'Carica voti'}
                </button>
              </div>
              {loadStatus === 'loaded' && selectedArchivio && (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  <span className="text-xs text-indigo-600 font-bold">Voti caricati:</span>
                  <span className="text-xs text-indigo-700">
                    {selectedArchivio.stagione} — Giornata {selectedArchivio.giornata}
                  </span>
                </div>
              )}
              {loadStatus === 'error' && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{loadMsg}</p>
              )}
            </>
          )}
        </div>

        {/* ── Fonte + Cerca ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Fonte giocatori
          </label>
          <select
            value={source}
            onChange={(e) => handleSourceChange(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="all">Tutti i giocatori</option>
            {myTeamId && (
              <option value={myTeamId}>
                La mia rosa ({teams.find((t) => t.id === myTeamId)?.name ?? '—'})
              </option>
            )}
            {teams.filter((t) => t.id !== myTeamId).map((t) => (
              <option key={t.id} value={t.id}>Rosa di {t.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Cerca giocatore o squadra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* ── Pool giocatori per ruolo ──────────────────────────────────────── */}
        {ROLE_ORDER.map((role) => {
          const rolePlayers = poolByRole[role]
          if (rolePlayers.length === 0) return null
          const selectedInRole = rolePlayers.filter((p) => selectedPids.has(p.id)).length
          return (
            <div key={role} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${ROLE_COLORS[role]}`}>{role}</span>
                <span className="text-sm font-bold text-gray-700">{ROLE_LABELS[role]}</span>
                <span className="text-xs text-gray-400 ml-auto">{rolePlayers.length}</span>
                {selectedInRole > 0 && (
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-lg">
                    {selectedInRole} sel.
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {rolePlayers.map((p) => {
                  const isSelected = selectedPids.has(p.id)
                  const voto = getVoto(p)
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 10" fill="none">
                            <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isSelected ? 'font-bold text-indigo-800' : 'text-gray-700'}`}>
                          {p.name}
                        </p>
                        {p.serie_a_team && (
                          <p className="text-xs text-gray-400 truncate">{p.serie_a_team}</p>
                        )}
                      </div>
                      {loadStatus === 'loaded' && (
                        <span className="flex items-center gap-1.5 shrink-0">
                          <CardIcons {...getCards(p)} />
                          <span className={`text-sm font-bold tabular-nums ${
                            voto !== null
                              ? isSelected ? 'text-indigo-700' : 'text-gray-500'
                              : 'text-gray-300'
                          }`}>
                            {voto !== null ? voto.toFixed(1) : 'sv'}
                          </span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {pool.length === 0 && (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">
              {source !== 'all' ? 'Nessun giocatore nella rosa selezionata.' : 'Nessun giocatore trovato.'}
            </p>
          </div>
        )}

        {/* ── Riepilogo formazione (in fondo) ──────────────────────────────── */}
        {selectedPids.size > 0 && total !== null && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Riepilogo</p>
              <div>
                <span className="text-lg font-black text-indigo-700 tabular-nums">{total.toFixed(1)}</span>
                <span className="text-xs text-gray-400 ml-1">pt</span>
              </div>
            </div>
            {ROLE_ORDER.map((role) => {
              const rp = selectedPlayers.filter((p) => p.role === role)
              if (rp.length === 0) return null
              return (
                <div key={role}>
                  <div className="px-4 py-1.5 bg-gray-50 flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-px rounded ${ROLE_COLORS[role]}`}>{role}</span>
                    <span className="text-xs text-gray-500 font-semibold">{ROLE_LABELS[role]}</span>
                  </div>
                  {rp.map((p) => {
                    const voto = getVoto(p)
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2 border-t border-gray-50">
                        <span className="text-xs text-gray-700 flex-1 truncate font-medium">{p.name}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <CardIcons {...getCards(p)} />
                          <span className={`text-sm font-bold tabular-nums ${voto !== null ? 'text-indigo-700' : 'text-gray-300'}`}>
                            {voto !== null ? voto.toFixed(1) : 'sv'}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">{votedCount}/{selectedPids.size} giocatori con voto</span>
              <div>
                <span className="text-xl font-black text-indigo-700 tabular-nums">{total.toFixed(1)}</span>
                <span className="text-sm text-gray-400 ml-1">pt</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
