'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Player { id: string; name: string; role: string; serie_a_team: string }
interface RosterEntry { players: Player; purchase_price: number }

interface Props {
  teamId: string
  matchdayId: string
  matchdayNumber: number
  roster: RosterEntry[]
  existingLineupId: string | null
  existingFormation: string
  existingStarters: string[]
  existingBenchByRole: Record<string, string[]>
  lineupCreatedAt: string | null
  lineupUpdatedAt: string | null
}

// ── Costanti ──────────────────────────────────────────────────────────────────

const FORMATIONS: Record<string, { D: number; C: number; A: number }> = {
  '4-3-3': { D: 4, C: 3, A: 3 },
  '4-4-2': { D: 4, C: 4, A: 2 },
  '4-5-1': { D: 4, C: 5, A: 1 },
  '4-2-4': { D: 4, C: 2, A: 4 },
  '3-4-3': { D: 3, C: 4, A: 3 },
  '3-5-2': { D: 3, C: 5, A: 2 },
  '3-4-1-2': { D: 3, C: 5, A: 2 },
  '5-3-2': { D: 5, C: 3, A: 2 },
  '5-4-1': { D: 5, C: 4, A: 1 },
}

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
// Limiti riserve per ruolo
const BENCH_LIMITS: Record<string, number> = { P: 2, D: 3, C: 3, A: 3 }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function LineupForm({
  teamId, matchdayId, matchdayNumber, roster,
  existingLineupId, existingFormation,
  existingStarters, existingBenchByRole,
  lineupCreatedAt, lineupUpdatedAt,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [formation, setFormation] = useState(existingFormation || '4-3-3')
  const [starters, setStarters] = useState<Set<string>>(new Set(existingStarters))
  const [bench, setBench] = useState<Record<string, string[]>>({
    P: existingBenchByRole.P ?? [],
    D: existingBenchByRole.D ?? [],
    C: existingBenchByRole.C ?? [],
    A: existingBenchByRole.A ?? [],
  })
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const fmt = FORMATIONS[formation] ?? { D: 4, C: 3, A: 3 }

  // Contatori titolari per ruolo
  const starterCounts: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 }
  for (const { players: p } of roster) {
    if (starters.has(p.id)) starterCounts[p.role] = (starterCounts[p.role] || 0) + 1
  }

  const totalBench = Object.values(bench).reduce((s, a) => s + a.length, 0)
  const needForRole = (role: string) => role === 'P' ? 1 : fmt[role as 'D' | 'C' | 'A']

  // ── Interazioni ──────────────────────────────────────────────────────────────

  const isInBench = (id: string) => Object.values(bench).some((a) => a.includes(id))

  const toggleStarter = (id: string, role: string) => {
    setMessage('')
    if (starters.has(id)) {
      setStarters((prev) => { const n = new Set(prev); n.delete(id); return n })
      return
    }
    const need = needForRole(role)
    if ((starterCounts[role] || 0) >= need) {
      setIsError(true)
      setMessage(`Con il modulo ${formation} puoi avere al massimo ${need} ${ROLE_LABELS[role].toLowerCase()} titolari.`)
      return
    }
    if (starters.size >= 11) { setIsError(true); setMessage('Hai già 11 titolari.'); return }
    // Rimuovi dalle riserve se c'era
    if (isInBench(id)) {
      setBench((prev) => ({ ...prev, [role]: prev[role].filter((x) => x !== id) }))
    }
    setStarters((prev) => new Set([...prev, id]))
  }

  const toggleBench = (id: string, role: string) => {
    setMessage('')
    setBench((prev) => {
      const arr = prev[role] ?? []
      if (arr.includes(id)) return { ...prev, [role]: arr.filter((x) => x !== id) }
      if (arr.length >= BENCH_LIMITS[role]) {
        setIsError(true)
        setMessage(`Puoi avere al massimo ${BENCH_LIMITS[role]} riserve ${ROLE_LABELS[role].toLowerCase()}.`)
        return prev
      }
      return { ...prev, [role]: [...arr, id] }
    })
  }

  const moveBench = (role: string, idx: number, dir: 'up' | 'down') => {
    setBench((prev) => {
      const arr = [...(prev[role] ?? [])]
      const to = dir === 'up' ? idx - 1 : idx + 1
      if (to < 0 || to >= arr.length) return prev
      ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
      return { ...prev, [role]: arr }
    })
  }

  // ── Validazione ───────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (starters.size !== 11) return `Seleziona esattamente 11 titolari (ne hai ${starters.size}).`
    if (starterCounts.P !== 1) return 'Ci vuole esattamente 1 portiere titolare.'
    if (starterCounts.D !== fmt.D) return `Modulo ${formation}: servono ${fmt.D} difensori (ne hai ${starterCounts.D}).`
    if (starterCounts.C !== fmt.C) return `Modulo ${formation}: servono ${fmt.C} centrocampisti (ne hai ${starterCounts.C}).`
    if (starterCounts.A !== fmt.A) return `Modulo ${formation}: servono ${fmt.A} attaccanti (ne hai ${starterCounts.A}).`
    return null
  }

  // ── Salvataggio ───────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    const err = validate()
    if (err) { setIsError(true); setMessage(err); return }

    startTransition(async () => {
      setMessage('')
      const supabase = createClient()

      // Upsert: crea la formazione se non esiste, aggiorna se esiste già
      const upsertData: Record<string, unknown> = { team_id: teamId, matchday_id: matchdayId }
      try { upsertData.formation = formation } catch { /* colonna non ancora presente */ }

      const { data: lineup, error: lineupErr } = await supabase
        .from('lineups')
        .upsert(upsertData, { onConflict: 'team_id,matchday_id' })
        .select('id')
        .single()

      if (lineupErr || !lineup) {
        setIsError(true)
        setMessage(`Errore formazione: ${lineupErr?.message}`)
        return
      }

      // Elimina i giocatori precedenti
      const { error: delErr } = await supabase
        .from('lineup_players').delete().eq('lineup_id', lineup.id)
      if (delErr) {
        setIsError(true)
        setMessage(`Errore pulizia: ${delErr.message}`)
        return
      }

      // Inserisce i nuovi giocatori
      const baseRows = [
        ...[...starters].map((pid, i) => ({
          lineup_id: lineup.id, player_id: pid, is_starter: true, slot_position: i,
        })),
        ...ROLE_ORDER.flatMap((role) =>
          (bench[role] ?? []).map((pid, i) => ({
            lineup_id: lineup.id, player_id: pid, is_starter: false, slot_position: 0,
          }))
        ),
      ]

      // Aggiunge bench_order solo se la colonna esiste (SQL potrebbe non essere stato eseguito)
      const rows = ROLE_ORDER.reduce<Record<string, unknown>[]>((acc, role) => {
        return acc.concat(
          (bench[role] ?? []).map((pid, i) => ({
            lineup_id: lineup.id, player_id: pid, is_starter: false, slot_position: 0, bench_order: i,
          }))
        )
      }, [...starters].map((pid, i) => ({
        lineup_id: lineup.id, player_id: pid, is_starter: true, slot_position: i, bench_order: 0,
      })))

      const { error: pErr } = await supabase.from('lineup_players').insert(rows)
      if (pErr) {
        // Se fallisce per bench_order mancante, riprova senza
        if (pErr.message.includes('bench_order')) {
          const { error: pErr2 } = await supabase.from('lineup_players').insert(baseRows)
          if (pErr2) { setIsError(true); setMessage(`Errore giocatori: ${pErr2.message}`); return }
        } else {
          setIsError(true); setMessage(`Errore giocatori: ${pErr.message}`); return
        }
      }

      setIsError(false)
      setMessage(existingLineupId ? 'Formazione aggiornata!' : 'Formazione inviata!')
      router.refresh()
    })
  }

  // ── UI ────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 bg-green-700 text-white">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Formazione G{matchdayNumber}</h2>
          <span className="text-green-200 text-xs font-medium">
            {starters.size}/11 tit. · {totalBench} ris.
          </span>
        </div>
        {lineupCreatedAt && (
          <p className="text-green-300 text-xs mt-0.5">
            Inviata: {formatTs(lineupCreatedAt)}
            {lineupUpdatedAt && (
              <> · Modificata: {formatTs(lineupUpdatedAt)}</>
            )}
          </p>
        )}
      </div>

      {/* Selezione modulo */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Modulo</p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {Object.keys(FORMATIONS).map((f) => (
            <button
              key={f}
              onClick={() => { setFormation(f); setMessage('') }}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                formation === f ? 'bg-green-700 text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Contatori per ruolo */}
        <div className="flex gap-2 mt-2">
          {ROLE_ORDER.map((role) => {
            const need = needForRole(role)
            const have = starterCounts[role] || 0
            const ok = have === need
            return (
              <span
                key={role}
                className={`text-xs font-bold px-2 py-0.5 rounded-full transition-colors ${
                  ok ? ROLE_COLORS[role] : 'bg-red-100 text-red-600'
                }`}
              >
                {role} {have}/{need}
              </span>
            )
          })}
        </div>
      </div>

      {/* Lista giocatori per ruolo */}
      <div className="divide-y divide-gray-50">
        {ROLE_ORDER.map((role) => {
          const players = roster.filter((r) => r.players.role === role)
          if (players.length === 0) return null
          const benchArr = bench[role] ?? []

          return (
            <div key={role}>
              <p className="px-4 py-1.5 text-xs font-bold text-gray-400 bg-gray-50 uppercase tracking-wide">
                {ROLE_LABELS[role]} · Riserve max {BENCH_LIMITS[role]}
              </p>

              {players.map(({ players: p }) => {
                const isStarter = starters.has(p.id)
                const benchIdx = benchArr.indexOf(p.id)
                const isBench = benchIdx >= 0

                return (
                  <div
                    key={p.id}
                    className={`px-4 py-2.5 flex items-center gap-2 ${
                      isStarter ? 'bg-green-50/40' : isBench ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[p.role]}`}>
                      {p.role}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${
                        isStarter ? 'text-green-700' : isBench ? 'text-blue-600' : 'text-gray-800'
                      }`}>
                        {p.name}
                      </p>
                      <p className="text-xs text-gray-400">{p.serie_a_team}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isStarter ? (
                        /* TITOLARE */
                        <button
                          onClick={() => toggleStarter(p.id, role)}
                          className="text-xs px-2.5 py-1 rounded-full font-bold bg-green-600 text-white"
                        >
                          Tit. ✓
                        </button>
                      ) : isBench ? (
                        /* IN PANCHINA */
                        <>
                          {/* Frecce ordine */}
                          <div className="flex flex-col leading-none">
                            <button
                              onClick={() => moveBench(role, benchIdx, 'up')}
                              disabled={benchIdx === 0}
                              className="text-gray-400 disabled:opacity-20 text-xs px-1"
                            >▲</button>
                            <button
                              onClick={() => moveBench(role, benchIdx, 'down')}
                              disabled={benchIdx === benchArr.length - 1}
                              className="text-gray-400 disabled:opacity-20 text-xs px-1"
                            >▼</button>
                          </div>
                          <span className="text-xs font-black text-blue-500 w-5 text-center">
                            {benchIdx + 1}°
                          </span>
                          <button
                            onClick={() => toggleBench(p.id, role)}
                            className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-500 text-white"
                          >
                            Ris. ✓
                          </button>
                          <button
                            onClick={() => toggleStarter(p.id, role)}
                            className="text-xs px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-500"
                          >
                            Tit.
                          </button>
                        </>
                      ) : (
                        /* DISPONIBILE */
                        <>
                          <button
                            onClick={() => toggleStarter(p.id, role)}
                            className="text-xs px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700 transition-colors"
                          >
                            Tit.
                          </button>
                          <button
                            onClick={() => toggleBench(p.id, role)}
                            className="text-xs px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            Ris.
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Riepilogo panchina per ruolo */}
              {benchArr.length > 0 && (
                <div className="mx-4 mb-2 mt-0.5 px-3 py-1.5 bg-blue-50 rounded-xl flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-blue-500 font-bold uppercase tracking-wide shrink-0">
                    Panchina:
                  </span>
                  {benchArr.map((pid, i) => {
                    const name = roster.find((r) => r.players.id === pid)?.players.name ?? pid
                    return (
                      <span key={pid} className="text-xs text-blue-700 font-semibold">
                        {i + 1}. {name}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer salvataggio */}
      <div className="px-4 py-4 border-t border-gray-100">
        {message && (
          <p className={`text-sm rounded-xl p-3 mb-3 ${
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
          {isPending
            ? 'Salvataggio...'
            : existingLineupId
              ? `Aggiorna formazione (${formation})`
              : `Invia formazione (${formation})`}
        </button>
      </div>
    </div>
  )
}
