'use client'

import { useState } from 'react'
import type { LeagueSettings } from '@/lib/settings'

interface Player { id: string; name: string; role: string; serie_a_team: string }
interface RosterEntry { id: string; purchase_price: number; players: Player }

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

interface Props {
  initialRoster: RosterEntry[]
  allPlayers: Player[]
  allRosteredPlayerIds: string[]
  settings: LeagueSettings
  rosterEditingEnabled: boolean
}

export default function RosaEditSection({
  initialRoster,
  allPlayers,
  allRosteredPlayerIds,
  settings,
  rosterEditingEnabled,
}: Props) {
  const [roster, setRoster] = useState<RosterEntry[]>(initialRoster)
  const [editMode, setEditMode] = useState(false)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // Giocatori liberi (non in nessuna rosa, escludendo quelli della rosa corrente)
  const myRosteredIds = new Set(roster.map((r) => r.players.id))
  const takenIds = new Set([...allRosteredPlayerIds, ...myRosteredIds])
  const freeAgents = allPlayers.filter(
    (p) => !takenIds.has(p.id) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
       p.serie_a_team.toLowerCase().includes(search.toLowerCase()))
  )

  const handleAdd = async (player: Player) => {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/rosa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Errore'); return }
      const newEntry: RosterEntry = { id: data.roster_id, purchase_price: 0, players: player }
      setRoster((prev) => [...prev, newEntry])
      setSearch('')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (entry: RosterEntry) => {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/rosa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roster_id: entry.id }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Errore'); return }
      setRoster((prev) => prev.filter((r) => r.id !== entry.id))
    } finally {
      setLoading(false)
    }
  }

  const rosterByRole = Object.fromEntries(
    ROLE_ORDER.map((role) => [role, roster.filter((r) => r.players.role === role)])
  )

  return (
    <>
      {/* Header rosa con limiti e toggle modifica */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-sm font-bold text-gray-700">La Mia Rosa</p>
          <div className="flex gap-2 mt-0.5">
            {ROLE_ORDER.map((role) => {
              const count = rosterByRole[role].length
              const max = settings.roster[`max_${role}`]
              return (
                <span key={role} className={`text-xs ${count >= max ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                  {role} {count}/{max}
                </span>
              )
            })}
            <span className="text-xs text-gray-400">
              | Tot {roster.length}/{settings.roster.max_total}
            </span>
          </div>
        </div>
        {rosterEditingEnabled && (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAddSheet(true); setMsg('') }}
              className="text-xs font-bold px-3 py-1.5 bg-green-600 text-white rounded-lg"
            >
              + Aggiungi
            </button>
            <button
              onClick={() => { setEditMode((v) => !v); setMsg('') }}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                editMode
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-gray-100 text-gray-600 border-gray-200'
              }`}
            >
              {editMode ? 'Fine' : 'Rimuovi'}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">{msg}</p>
      )}

      {/* Rosa per ruolo */}
      {ROLE_ORDER.map((role) => (
        <div key={role} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-700 text-sm">{ROLE_LABELS[role]}</h2>
            <span className="text-xs text-gray-400 font-medium">{rosterByRole[role].length}</span>
          </div>
          {rosterByRole[role].length === 0 ? (
            <p className="text-gray-400 text-sm px-4 py-3">Nessun giocatore</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {rosterByRole[role].map((entry) => (
                <div key={entry.id} className="px-4 py-3 flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[role]}`}>
                    {role}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{entry.players.name}</p>
                    <p className="text-xs text-gray-400">{entry.players.serie_a_team}</p>
                  </div>
                  {editMode && rosterEditingEnabled ? (
                    <button
                      onClick={() => handleRemove(entry)}
                      disabled={loading}
                      className="text-xs font-bold px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100 disabled:opacity-40 shrink-0"
                    >
                      Rimuovi
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 shrink-0">{entry.purchase_price > 0 ? `${entry.purchase_price}M` : ''}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Bottom sheet aggiunta giocatore */}
      {showAddSheet && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowAddSheet(false)}>
          <div
            className="bg-white w-full rounded-t-3xl p-5 flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-bold text-gray-800">Aggiungi giocatore</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ROLE_ORDER.map((r) => {
                    const count = rosterByRole[r].length
                    const max = settings.roster[`max_${r}`]
                    return `${r} ${count}/${max}`
                  }).join('  ·  ')}
                </p>
              </div>
              <button onClick={() => setShowAddSheet(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per nome o squadra..."
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-400"
              autoFocus
            />

            {msg && <p className="text-xs text-red-600 mb-2">{msg}</p>}

            <div className="overflow-y-auto flex-1">
              {freeAgents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  {search ? 'Nessun giocatore trovato' : 'Tutti i giocatori disponibili sono già in una rosa'}
                </p>
              ) : (
                freeAgents.slice(0, 80).map((player) => {
                  const count = rosterByRole[player.role as (typeof ROLE_ORDER)[number]]?.length ?? 0
                  const max = settings.roster[`max_${player.role}` as keyof typeof settings.roster] as number
                  const roleFull = count >= max
                  return (
                    <button
                      key={player.id}
                      onClick={() => !roleFull && handleAdd(player)}
                      disabled={loading || roleFull}
                      className="w-full flex items-center gap-3 py-3 border-b border-gray-50 text-left hover:bg-gray-50 transition-colors disabled:opacity-40"
                    >
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[player.role]}`}>
                        {player.role}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{player.name}</p>
                        <p className="text-xs text-gray-400">{player.serie_a_team}</p>
                      </div>
                      {roleFull ? (
                        <span className="text-xs text-red-400 font-semibold shrink-0">Ruolo pieno</span>
                      ) : (
                        <span className="text-xs text-green-600 font-bold shrink-0">+ Aggiungi</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
