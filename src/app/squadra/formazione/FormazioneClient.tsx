'use client'

import { useState, useTransition, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id: string
  name: string
  role: string
  serie_a_team: string
}

interface LineupPlayerRaw {
  player_id: string
  is_starter: boolean
  bench_order: number
  players: Player
}

interface ChangeEntry {
  id: string
  changed_at: string
  change_type: string
  description: string
}

interface Props {
  lineupId: string
  teamName: string
  matchdayNumber: number
  deadline: string | null
  formation: string
  lineupPlayers: LineupPlayerRaw[]
  allRosterPlayers: Player[]
  changes: ChangeEntry[]
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso: string | null, full = false) {
  if (!iso) return null
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  if (full) { opts.day = 'numeric'; opts.month = 'short'; opts.year = 'numeric' }
  return new Date(iso).toLocaleString('it-IT', opts)
}

function changeLabel(type: string) {
  switch (type) {
    case 'submit':       return 'Invio'
    case 'swap':         return 'Cambio'
    case 'formation':    return 'Modulo'
    case 'bench_reorder': return 'Panchina'
    default:             return 'Modifica'
  }
}

function changeBadgeColor(type: string) {
  switch (type) {
    case 'submit':       return 'bg-green-100 text-green-700'
    case 'swap':         return 'bg-orange-100 text-orange-700'
    case 'formation':    return 'bg-purple-100 text-purple-700'
    case 'bench_reorder': return 'bg-blue-100 text-blue-700'
    default:             return 'bg-gray-100 text-gray-600'
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function FormazioneClient({
  lineupId, teamName, matchdayNumber, deadline,
  formation: initialFormation, lineupPlayers,
  allRosterPlayers, changes: initialChanges,
  lineupCreatedAt, lineupUpdatedAt,
}: Props) {
  const [isPending, startTransition] = useTransition()

  // Build player lookup map
  const playerMap = useMemo(() => {
    const map = new Map<string, Player>()
    for (const p of allRosterPlayers) map.set(p.id, p)
    for (const lp of lineupPlayers) map.set(lp.player_id, lp.players)
    return map
  }, [allRosterPlayers, lineupPlayers])

  // State derived from initial server data
  const [formation, setFormation] = useState(initialFormation)

  const [starters, setStarters] = useState<Set<string>>(
    () => new Set(lineupPlayers.filter((lp) => lp.is_starter).map((lp) => lp.player_id))
  )

  const [bench, setBench] = useState<Record<string, string[]>>(() => {
    const result: Record<string, string[]> = { P: [], D: [], C: [], A: [] }
    for (const lp of lineupPlayers
      .filter((lp) => !lp.is_starter)
      .sort((a, b) => a.bench_order - b.bench_order)) {
      const role = lp.players.role
      if (result[role] !== undefined) result[role].push(lp.player_id)
    }
    return result
  })

  const [changes, setChanges] = useState<ChangeEntry[]>(initialChanges)
  const [swapTarget, setSwapTarget] = useState<{ playerId: string; role: string } | null>(null)
  const [showLog, setShowLog] = useState(true)
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null)

  const isDeadlinePassed = deadline ? new Date(deadline) < new Date() : false
  const supabase = createClient()

  // Starters grouped by role (for display)
  const startersByRole = useMemo(() => {
    const result: Record<string, string[]> = { P: [], D: [], C: [], A: [] }
    for (const pid of starters) {
      const p = playerMap.get(pid)
      if (p && result[p.role] !== undefined) result[p.role].push(pid)
    }
    return result
  }, [starters, playerMap])

  // ── DB helpers ───────────────────────────────────────────────────────────────

  const saveAll = async (
    newStarters: Set<string>,
    newBench: Record<string, string[]>,
    newFormation: string,
  ) => {
    const { error: updErr } = await supabase
      .from('lineups')
      .update({ formation: newFormation })
      .eq('id', lineupId)
    if (updErr) throw new Error(updErr.message)

    const { error: delErr } = await supabase
      .from('lineup_players')
      .delete()
      .eq('lineup_id', lineupId)
    if (delErr) throw new Error(delErr.message)

    const rows = [
      ...[...newStarters].map((pid, i) => ({
        lineup_id: lineupId, player_id: pid,
        is_starter: true, slot_position: i, bench_order: 0,
      })),
      ...ROLE_ORDER.flatMap((role) =>
        (newBench[role] || []).map((pid, i) => ({
          lineup_id: lineupId, player_id: pid,
          is_starter: false, slot_position: 0, bench_order: i,
        }))
      ),
    ]

    const { error: insErr } = await supabase.from('lineup_players').insert(rows)
    if (insErr) throw new Error(insErr.message)
  }

  const addChange = async (type: string, description: string) => {
    const { data } = await supabase
      .from('lineup_changes')
      .insert({ lineup_id: lineupId, change_type: type, description })
      .select('id, changed_at, change_type, description')
      .single()
    if (data) setChanges((prev) => [...prev, data as ChangeEntry])
  }

  // ── Azioni ───────────────────────────────────────────────────────────────────

  const executeSwap = (benchPlayerId: string) => {
    if (!swapTarget || isPending) return
    const { playerId: starterId, role } = swapTarget

    const newStarters = new Set(starters)
    newStarters.delete(starterId)
    newStarters.add(benchPlayerId)

    const newBenchRole = [...bench[role]]
    const benchIdx = newBenchRole.indexOf(benchPlayerId)
    newBenchRole[benchIdx] = starterId
    const newBench = { ...bench, [role]: newBenchRole }

    startTransition(async () => {
      try {
        await saveAll(newStarters, newBench, formation)
        const starterName = playerMap.get(starterId)?.name ?? starterId
        const benchName = playerMap.get(benchPlayerId)?.name ?? benchPlayerId
        await addChange('swap', `${starterName} → panchina / ${benchName} → titolare (${role})`)
        setStarters(newStarters)
        setBench(newBench)
        setSwapTarget(null)
        setStatusMsg({ text: 'Cambio salvato.', isError: false })
      } catch (e: unknown) {
        setStatusMsg({ text: `Errore: ${(e as Error).message}`, isError: true })
      }
    })
  }

  const handleFormationChange = (newFormation: string) => {
    if (newFormation === formation || isPending) return
    const fmt = FORMATIONS[newFormation]
    if (!fmt) return

    // Valida che i titolari attuali rientrino nel nuovo modulo
    const counts = { D: 0, C: 0, A: 0 }
    for (const pid of starters) {
      const p = playerMap.get(pid)
      if (p && p.role !== 'P') counts[p.role as 'D' | 'C' | 'A']++
    }
    if (counts.D > fmt.D || counts.C > fmt.C || counts.A > fmt.A) {
      setStatusMsg({
        text: `Il modulo ${newFormation} richiede ${fmt.D}D-${fmt.C}C-${fmt.A}A ma hai ${counts.D}D-${counts.C}C-${counts.A}A. Modifica prima i titolari.`,
        isError: true,
      })
      return
    }

    const oldFormation = formation
    startTransition(async () => {
      try {
        await saveAll(starters, bench, newFormation)
        await addChange('formation', `Modulo cambiato: ${oldFormation} → ${newFormation}`)
        setFormation(newFormation)
        setStatusMsg({ text: `Modulo aggiornato a ${newFormation}.`, isError: false })
      } catch (e: unknown) {
        setStatusMsg({ text: `Errore: ${(e as Error).message}`, isError: true })
      }
    })
  }

  const handleBenchMove = (role: string, idx: number, dir: 'up' | 'down') => {
    if (isPending) return
    const arr = [...bench[role]]
    const to = dir === 'up' ? idx - 1 : idx + 1
    if (to < 0 || to >= arr.length) return
    ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
    const newBench = { ...bench, [role]: arr }

    startTransition(async () => {
      try {
        await saveAll(starters, newBench, formation)
        const names = arr.map((pid) => playerMap.get(pid)?.name ?? pid).join(' › ')
        await addChange('bench_reorder', `Ordine riserve ${ROLE_LABELS[role]}: ${names}`)
        setBench(newBench)
      } catch (e: unknown) {
        setStatusMsg({ text: `Errore: ${(e as Error).message}`, isError: true })
      }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* Header */}
      <div className="bg-green-700 text-white px-4 pt-12 pb-5">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/squadra" className="text-green-200 text-2xl font-light leading-none -mt-0.5">‹</Link>
          <div>
            <h1 className="text-xl font-bold">Formazione G{matchdayNumber}</h1>
            <p className="text-green-200 text-xs mt-0.5">{teamName}</p>
          </div>
        </div>

        {lineupCreatedAt && (
          <div className="space-y-0.5 text-xs text-green-200 mt-2">
            <p>Inviata il {formatTs(lineupCreatedAt, true)}</p>
            {lineupUpdatedAt && (
              <p>Ultima modifica: {formatTs(lineupUpdatedAt, true)}</p>
            )}
          </div>
        )}

        {deadline && (
          <p className={`text-xs font-semibold mt-2 ${isDeadlinePassed ? 'text-red-300' : 'text-green-300'}`}>
            Scadenza: {new Date(deadline).toLocaleString('it-IT', {
              weekday: 'short', day: 'numeric', month: 'short',
              hour: '2-digit', minute: '2-digit',
            })}
            {isDeadlinePassed && ' — non modificabile'}
          </p>
        )}
      </div>

      {/* Feedback */}
      {statusMsg && (
        <div
          className={`mx-4 mt-3 rounded-xl p-3 text-sm ${
            statusMsg.isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {statusMsg.text}
          <button onClick={() => setStatusMsg(null)} className="float-right text-xs opacity-50 ml-2">✕</button>
        </div>
      )}

      {isPending && (
        <div className="mx-4 mt-3 rounded-xl p-2 bg-blue-50 border border-blue-200 text-blue-600 text-xs text-center">
          Salvataggio in corso...
        </div>
      )}

      <div className="px-4 py-4 space-y-4">

        {/* Modulo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Modulo</p>
            <span className="text-xl font-black text-green-700">{formation}</span>
          </div>
          {!isDeadlinePassed && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {Object.keys(FORMATIONS).map((f) => (
                <button
                  key={f}
                  onClick={() => handleFormationChange(f)}
                  disabled={isPending}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                    formation === f
                      ? 'bg-green-700 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Titolari */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-green-100">
            <h2 className="font-bold text-green-800 text-sm">Titolari · 11</h2>
          </div>
          {ROLE_ORDER.map((role) => {
            const rolePlayers = startersByRole[role] || []
            if (rolePlayers.length === 0) return null
            const hasBench = (bench[role] || []).length > 0
            return (
              <div key={role}>
                <p className="px-4 py-1 text-xs font-bold text-gray-400 bg-gray-50 uppercase tracking-wide">
                  {ROLE_LABELS[role]}
                </p>
                {rolePlayers.map((pid) => {
                  const p = playerMap.get(pid)
                  if (!p) return null
                  return (
                    <div key={pid} className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-50 last:border-0">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[role]}`}>
                        {role}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.serie_a_team}</p>
                      </div>
                      {!isDeadlinePassed && hasBench && (
                        <button
                          onClick={() => { setSwapTarget({ playerId: pid, role }); setStatusMsg(null) }}
                          disabled={isPending}
                          className="shrink-0 text-xs px-3 py-1.5 rounded-xl bg-orange-50 text-orange-600 font-semibold border border-orange-200"
                        >
                          Cambia
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Panchina */}
        {ROLE_ORDER.some((role) => (bench[role] || []).length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <h2 className="font-bold text-blue-800 text-sm">Panchina</h2>
            </div>
            {ROLE_ORDER.map((role) => {
              const benchArr = bench[role] || []
              if (benchArr.length === 0) return null
              return (
                <div key={role}>
                  <p className="px-4 py-1 text-xs font-bold text-gray-400 bg-gray-50 uppercase tracking-wide">
                    {ROLE_LABELS[role]}
                  </p>
                  {benchArr.map((pid, idx) => {
                    const p = playerMap.get(pid)
                    if (!p) return null
                    return (
                      <div key={pid} className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-50 last:border-0">
                        <span className="text-xs font-black text-blue-400 w-6 text-center shrink-0">
                          {idx + 1}°
                        </span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[role]}`}>
                          {role}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-blue-700 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.serie_a_team}</p>
                        </div>
                        {!isDeadlinePassed && (
                          <div className="flex flex-col shrink-0">
                            <button
                              onClick={() => handleBenchMove(role, idx, 'up')}
                              disabled={idx === 0 || isPending}
                              className="text-gray-400 disabled:opacity-20 text-xs px-1 leading-tight"
                            >▲</button>
                            <button
                              onClick={() => handleBenchMove(role, idx, 'down')}
                              disabled={idx === benchArr.length - 1 || isPending}
                              className="text-gray-400 disabled:opacity-20 text-xs px-1 leading-tight"
                            >▼</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* Cronologia modifiche */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            className="w-full px-4 py-3 flex items-center justify-between"
            onClick={() => setShowLog((v) => !v)}
          >
            <h2 className="font-bold text-gray-700 text-sm">
              Cronologia — {changes.length} {changes.length === 1 ? 'evento' : 'eventi'}
            </h2>
            <span className="text-gray-400 text-xs font-bold">{showLog ? '▲' : '▼'}</span>
          </button>

          {showLog && (
            <div className="border-t border-gray-100">
              {changes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-400 text-center">
                  Nessuna modifica registrata.
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {changes.map((c) => (
                    <div key={c.id} className="px-4 py-2.5 flex items-start gap-3">
                      <span className="text-xs text-gray-400 shrink-0 w-12 mt-0.5 leading-tight">
                        {formatTs(c.changed_at)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`inline text-xs font-bold px-1.5 py-0.5 rounded mr-1.5 ${changeBadgeColor(c.change_type)}`}>
                          {changeLabel(c.change_type)}
                        </span>
                        <span className="text-sm text-gray-700">{c.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Swap modal (bottom sheet) */}
      {swapTarget && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSwapTarget(null)}
          />
          <div className="relative bg-white rounded-t-3xl shadow-xl max-h-[70vh] flex flex-col">
            <div className="px-4 py-4 border-b border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-bold mb-1">
                {ROLE_LABELS[swapTarget.role]}
              </p>
              <h3 className="font-bold text-gray-800 text-base">
                Sostituisci {playerMap.get(swapTarget.playerId)?.name}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Seleziona chi entra dalla panchina
              </p>
            </div>

            <div className="overflow-y-auto flex-1">
              {(bench[swapTarget.role] || []).length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">
                  Nessuna riserva disponibile per questo ruolo.
                </p>
              ) : (
                (bench[swapTarget.role] || []).map((pid, idx) => {
                  const p = playerMap.get(pid)
                  if (!p) return null
                  return (
                    <button
                      key={pid}
                      onClick={() => executeSwap(pid)}
                      disabled={isPending}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50 last:border-0 text-left transition-colors"
                    >
                      <span className="text-xs font-black text-blue-400 w-6 text-center shrink-0">
                        {idx + 1}°
                      </span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[swapTarget.role]}`}>
                        {swapTarget.role}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.serie_a_team}</p>
                      </div>
                      <span className="text-green-600 text-xs font-bold shrink-0">Entra →</span>
                    </button>
                  )
                })
              )}
            </div>

            <div className="px-4 py-4 border-t border-gray-100">
              <button
                onClick={() => setSwapTarget(null)}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
