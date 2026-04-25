'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { Player } from '@/lib/types'

const ROLES = ['P', 'D', 'C', 'A'] as const
const ROLE_LABELS: Record<string, string> = {
  P: 'Portiere', D: 'Difensore', C: 'Centrocampista', A: 'Attaccante',
}
const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

type Giornata = { stagione: string; giornata: number }

interface Props {
  initialPlayers: Player[]
  giornate: Giornata[]
}

type SyncResult = { inserted: number; updated: number; total: number; stagione: string; giornata: number }

export default function GiocatoriClient({ initialPlayers, giornate }: Props) {
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [filter, setFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [form, setForm] = useState({ name: '', role: 'A' as string, serie_a_team: '' })
  const [formMsg, setFormMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  // Sync da voti
  const [selectedGiornata, setSelectedGiornata] = useState(
    giornate.length > 0 ? `${giornate[0].stagione}|${giornate[0].giornata}` : ''
  )
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [syncMsg, setSyncMsg] = useState('')
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  // Conferma eliminazione singola
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Elimina tutti
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  const openEdit = (p: Player) => {
    setEditingPlayer(p)
    setForm({ name: p.name, role: p.role, serie_a_team: p.serie_a_team })
    setFormMsg('')
  }

  const closeEdit = () => {
    setEditingPlayer(null)
    setFormMsg('')
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      setFormMsg('Il nome è obbligatorio.')
      return
    }
    if (!editingPlayer) return
    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('players')
        .update({ name: form.name.trim(), role: form.role, serie_a_team: form.serie_a_team.trim() })
        .eq('id', editingPlayer.id)
        .select()
        .single()
      if (error) { setFormMsg('Errore nel salvataggio.'); return }
      setPlayers((prev) =>
        prev.map((p) => (p.id === editingPlayer.id ? (data as Player) : p))
          .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))
      )
      closeEdit()
    })
  }

  const handleDelete = (player: Player) => {
    setConfirmDeleteId(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('players').delete().eq('id', player.id)
      if (error) { alert('Errore nell\'eliminazione.'); return }
      setPlayers((prev) => prev.filter((p) => p.id !== player.id))
    })
  }

  const handleDeleteAll = async () => {
    setConfirmDeleteAll(false)
    setDeletingAll(true)
    try {
      const res = await fetch('/api/giocatori/delete-all', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) { alert(`Errore: ${data.error ?? 'sconosciuto'}`); return }
      setPlayers([])
    } finally {
      setDeletingAll(false)
    }
  }

  const handleSync = async () => {
    if (!selectedGiornata) return
    const [stagione, gStr] = selectedGiornata.split('|')
    const giornata = parseInt(gStr, 10)
    setSyncStatus('loading')
    setSyncMsg('')
    setSyncResult(null)
    try {
      const res = await fetch('/api/giocatori/sync-from-voti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stagione, giornata }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setSyncStatus('error')
        setSyncMsg(data.error ?? 'Errore sconosciuto')
        return
      }
      setSyncStatus('done')
      setSyncResult(data as SyncResult)

      // Ricarica l'elenco giocatori aggiornato
      const supabase = createClient()
      const { data: updated } = await supabase
        .from('players')
        .select('*')
        .order('role', { ascending: true })
        .order('name', { ascending: true })
      if (updated) setPlayers(updated as Player[])
    } catch (e) {
      setSyncStatus('error')
      setSyncMsg((e as Error).message)
    }
  }

  const filtered = players.filter((p) => {
    const matchesText =
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.serie_a_team.toLowerCase().includes(filter.toLowerCase()) ||
      (p.codice ?? '').toLowerCase().includes(filter.toLowerCase())
    const matchesRole = !roleFilter || p.role === roleFilter
    return matchesText && matchesRole
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/admin" className="text-gray-400 text-sm">← Admin</Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Giocatori Serie A</h1>
            <p className="text-gray-400 text-sm">{players.length} giocatori totali</p>
          </div>
          {players.length > 0 && (
            confirmDeleteAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-300">Eliminare tutti?</span>
                <button
                  onClick={handleDeleteAll}
                  disabled={deletingAll}
                  className="text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg disabled:opacity-50"
                >
                  {deletingAll ? '...' : 'Sì, elimina'}
                </button>
                <button
                  onClick={() => setConfirmDeleteAll(false)}
                  className="text-xs font-semibold px-3 py-1.5 bg-gray-700 text-gray-200 rounded-lg"
                >
                  Annulla
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteAll(true)}
                disabled={deletingAll}
                className="text-xs font-bold px-3 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                Elimina tutti
              </button>
            )
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Card: Aggiorna DB giocatori */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div>
            <h2 className="font-bold text-gray-700 text-sm">Aggiorna DB giocatori</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Seleziona una giornata importata e sincronizza l&apos;anagrafica giocatori con i dati dei voti.
            </p>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedGiornata}
              onChange={(e) => {
                setSelectedGiornata(e.target.value)
                setSyncStatus('idle')
                setSyncMsg('')
                setSyncResult(null)
              }}
              disabled={syncStatus === 'loading' || giornate.length === 0}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 bg-white"
            >
              {giornate.length === 0 ? (
                <option value="">Nessuna giornata importata</option>
              ) : (
                giornate.map((g) => (
                  <option key={`${g.stagione}|${g.giornata}`} value={`${g.stagione}|${g.giornata}`}>
                    {g.stagione} — Giornata {g.giornata}
                  </option>
                ))
              )}
            </select>
            <button
              onClick={handleSync}
              disabled={syncStatus === 'loading' || !selectedGiornata}
              className="bg-gray-800 text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40 hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              {syncStatus === 'loading' ? 'Aggiornamento...' : 'Aggiorna DB'}
            </button>
          </div>

          {syncStatus === 'done' && syncResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1">
              <p className="text-sm font-bold text-green-700">
                Sincronizzazione completata — {syncResult.stagione} G{syncResult.giornata}
              </p>
              <div className="flex gap-4 text-xs text-green-600">
                <span>
                  <span className="font-black text-green-800 text-base">{syncResult.inserted}</span>
                  {' '}nuovi giocatori aggiunti
                </span>
                <span>
                  <span className="font-bold">{syncResult.updated}</span>
                  {' '}aggiornati
                </span>
              </div>
            </div>
          )}
          {syncStatus === 'error' && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{syncMsg}</p>
          )}
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 space-y-2">
          <input
            type="text"
            placeholder="Cerca per nome, squadra o codice..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setRoleFilter('')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                !roleFilter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Tutti
            </button>
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r === roleFilter ? '' : r)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  roleFilter === r ? ROLE_COLORS[r] + ' border border-current' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Lista giocatori */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-xs text-gray-400">{filtered.length} risultati</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nessun giocatore trovato</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((player) => (
                <div key={player.id} className="px-4 py-3 flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[player.role]}`}>
                    {player.role}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{player.name}</p>
                    <p className="text-xs text-gray-400">
                      {player.serie_a_team}
                      {player.codice && (
                        <span className="ml-2 font-mono text-gray-300">{player.codice}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(player)}
                      className="text-xs text-blue-600 font-semibold px-2.5 py-1.5 bg-blue-50 rounded-lg border border-blue-100"
                    >
                      Modifica
                    </button>
                    {confirmDeleteId === player.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(player)}
                          disabled={isPending}
                          className="text-xs text-white font-bold px-2.5 py-1.5 bg-red-600 rounded-lg disabled:opacity-50"
                        >
                          Conferma
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-gray-600 font-semibold px-2.5 py-1.5 bg-gray-100 rounded-lg"
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(player.id)}
                        disabled={isPending}
                        className="text-xs text-red-600 font-semibold px-2.5 py-1.5 bg-red-50 rounded-lg border border-red-100 disabled:opacity-40"
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal modifica */}
      {editingPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={closeEdit}>
          <div
            className="bg-white w-full rounded-t-3xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-gray-800">Modifica giocatore</h2>
              <button onClick={closeEdit} className="text-gray-400 text-2xl leading-none">×</button>
            </div>

            {/* Codice (read-only) */}
            {editingPlayer.codice && (
              <div>
                <label className="text-xs font-medium text-gray-400 block mb-1">Codice PianetaFanta</label>
                <p className="font-mono text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  {editingPlayer.codice}
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nome</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Ruolo</label>
              <div className="grid grid-cols-4 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setForm((f) => ({ ...f, role: r }))}
                    className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                      form.role === r ? ROLE_COLORS[r] : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">{ROLE_LABELS[form.role]}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Squadra Serie A</label>
              <input
                type="text"
                value={form.serie_a_team}
                onChange={(e) => setForm((f) => ({ ...f, serie_a_team: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Es. Juventus"
              />
            </div>

            {formMsg && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{formMsg}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeEdit}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                {isPending ? 'Salvo...' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
