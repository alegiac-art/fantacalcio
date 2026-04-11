'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Player } from '@/lib/types'
import Link from 'next/link'

const ROLES = ['P', 'D', 'C', 'A']
const ROLE_LABELS: Record<string, string> = {
  P: 'Portiere', D: 'Difensore', C: 'Centrocampista', A: 'Attaccante',
}
const ROLE_COLORS: Record<string, string> = {
  P: 'bg-yellow-100 text-yellow-700',
  D: 'bg-blue-100 text-blue-700',
  C: 'bg-green-100 text-green-700',
  A: 'bg-red-100 text-red-700',
}

interface Props {
  initialPlayers: Player[]
}

export default function GiocatoriClient({ initialPlayers }: Props) {
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [showForm, setShowForm] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [filter, setFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [form, setForm] = useState({ name: '', role: 'A', serie_a_team: '' })
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const openAdd = () => {
    setEditingPlayer(null)
    setForm({ name: '', role: 'A', serie_a_team: '' })
    setShowForm(true)
  }

  const openEdit = (p: Player) => {
    setEditingPlayer(p)
    setForm({ name: p.name, role: p.role, serie_a_team: p.serie_a_team })
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.name.trim() || !form.serie_a_team.trim()) {
      setMessage('Nome e squadra sono obbligatori.')
      return
    }
    startTransition(async () => {
      const supabase = createClient()
      if (editingPlayer) {
        const { data, error } = await supabase
          .from('players')
          .update({ name: form.name.trim(), role: form.role, serie_a_team: form.serie_a_team.trim() })
          .eq('id', editingPlayer.id)
          .select()
          .single()
        if (error) { setMessage('Errore nel salvataggio.'); return }
        setPlayers((prev) => prev.map((p) => (p.id === editingPlayer.id ? (data as Player) : p)))
      } else {
        const { data, error } = await supabase
          .from('players')
          .insert({ name: form.name.trim(), role: form.role, serie_a_team: form.serie_a_team.trim() })
          .select()
          .single()
        if (error) { setMessage('Errore nel salvataggio.'); return }
        setPlayers((prev) => [...prev, data as Player].sort((a, b) =>
          a.role.localeCompare(b.role) || a.name.localeCompare(b.name)
        ))
      }
      setShowForm(false)
      setMessage('')
      router.refresh()
    })
  }

  const handleDelete = (player: Player) => {
    if (!confirm(`Eliminare ${player.name}? L'operazione non può essere annullata.`)) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('players').delete().eq('id', player.id)
      if (error) { setMessage('Errore nell\'eliminazione.'); return }
      setPlayers((prev) => prev.filter((p) => p.id !== player.id))
    })
  }

  const filtered = players.filter((p) => {
    const matchesText = p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.serie_a_team.toLowerCase().includes(filter.toLowerCase())
    const matchesRole = !roleFilter || p.role === roleFilter
    return matchesText && matchesRole
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/admin" className="text-gray-400 text-sm">← Admin</Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Giocatori Serie A</h1>
            <p className="text-gray-400 text-sm">{players.length} giocatori totali</p>
          </div>
          <button
            onClick={openAdd}
            className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-xl"
          >
            + Aggiungi
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 space-y-2">
        <input
          type="text"
          placeholder="Cerca per nome o squadra..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <h2 className="font-bold text-lg text-gray-800">
              {editingPlayer ? 'Modifica giocatore' : 'Nuovo giocatore'}
            </h2>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nome</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Es. Mario Rossi"
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
            {message && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{message}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowForm(false); setMessage('') }}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                {isPending ? 'Salvo...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista giocatori */}
      <div className="px-4 py-3 space-y-1">
        <p className="text-xs text-gray-400 mb-2">{filtered.length} risultati</p>
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center">
            <p className="text-gray-400 text-sm">Nessun giocatore trovato</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {filtered.map((player) => (
              <div key={player.id} className="px-4 py-3 flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[player.role]}`}>
                  {player.role}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{player.name}</p>
                  <p className="text-xs text-gray-400">{player.serie_a_team}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(player)}
                    className="text-xs text-blue-600 font-semibold px-2 py-1 bg-blue-50 rounded-lg"
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => handleDelete(player)}
                    className="text-xs text-red-600 font-semibold px-2 py-1 bg-red-50 rounded-lg"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
