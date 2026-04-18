'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type VotiRow = {
  id: string
  stagione: string
  giornata: number
  codice: string
  nome: string | null
  squadra: string | null
  ruolo: string | null
  col_g_label: string | null
  col_g: number | null
  voto_fanta: number | null
  voto_gazzetta_originale: string | null
  col_h_label: string | null
  col_h: number | null
  col_i_label: string | null
  col_i: number | null
  col_j_label: string | null
  col_j: number | null
  col_k_label: string | null
  col_k: number | null
}

type EditingCell = { rowId: string; col: 'col_g' | 'col_h' | 'col_i' | 'col_j' | 'col_k'; value: string }

const RUOLI = ['P', 'D', 'C', 'A']
const PAGE_SIZE = 50
const NUM_COLS: Array<'col_g' | 'col_h' | 'col_i' | 'col_j' | 'col_k'> = ['col_g', 'col_h', 'col_i', 'col_j', 'col_k']

interface Props {
  stagioni: string[]
  giornatePerStagione: Record<string, number[]>
}

export default function VotiGiornataClient({ stagioni, giornatePerStagione }: Props) {
  const supabase = createClient()

  // ── Filtri ────────────────────────────────────────────────────────────────
  const [filterStagione, setFilterStagione] = useState(stagioni[0] ?? '')
  const [filterGiornata, setFilterGiornata] = useState<string>('')
  const [filterRuolo, setFilterRuolo] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // ── Dati ─────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<VotiRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  // ── Edit ─────────────────────────────────────────────────────────────────
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // ── Delete ────────────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // ── Carica dati ───────────────────────────────────────────────────────────

  const loadData = useCallback(async (pg: number) => {
    setLoading(true)
    setLoadError('')
    try {
      let query = supabase
        .from('voti_giornata')
        .select('*', { count: 'exact' })

      if (filterStagione) query = query.eq('stagione', filterStagione)
      if (filterGiornata) query = query.eq('giornata', parseInt(filterGiornata))
      if (filterRuolo) query = query.eq('ruolo', filterRuolo)
      if (filterSearch) {
        query = query.or(
          `nome.ilike.%${filterSearch}%,codice.ilike.%${filterSearch}%,squadra.ilike.%${filterSearch}%`
        )
      }

      const { data, count, error } = await query
        .order('giornata', { ascending: false })
        .order('ruolo', { ascending: true })
        .order('nome', { ascending: true })
        .range(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE - 1)

      if (error) { setLoadError(error.message); return }
      setRows((data as VotiRow[]) || [])
      setTotal(count ?? 0)
    } finally {
      setLoading(false)
    }
  }, [filterStagione, filterGiornata, filterRuolo, filterSearch]) // eslint-disable-line

  useEffect(() => {
    setPage(0)
    loadData(0)
  }, [filterStagione, filterGiornata, filterRuolo, filterSearch]) // eslint-disable-line

  useEffect(() => {
    if (page > 0) loadData(page)
  }, [page]) // eslint-disable-line

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell) editInputRef.current?.focus()
  }, [editingCell])

  // ── Intestazioni colonne numeriche (dal primo row) ────────────────────────
  const labels = rows[0]
    ? {
        col_g: 'VotoGazzetta',
        col_h: rows[0].col_h_label || 'H',
        col_i: rows[0].col_i_label || 'I',
        col_j: rows[0].col_j_label || 'J',
        col_k: rows[0].col_k_label || 'K',
      }
    : { col_g: 'VotoGazzetta', col_h: 'H', col_i: 'I', col_j: 'J', col_k: 'K' }

  // ── Salva cella editata ───────────────────────────────────────────────────
  const saveCell = async () => {
    if (!editingCell) return
    const numVal = editingCell.value === '' ? null : parseFloat(editingCell.value.replace(',', '.'))
    if (editingCell.value !== '' && isNaN(numVal!)) {
      setEditingCell(null)
      return
    }
    setSavingId(editingCell.rowId)
    const { error } = await supabase
      .from('voti_giornata')
      .update({ [editingCell.col]: numVal })
      .eq('id', editingCell.rowId)

    if (!error) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === editingCell.rowId ? { ...r, [editingCell.col]: numVal } : r
        )
      )
    }
    setSavingId(null)
    setEditingCell(null)
  }

  // ── Elimina singola riga ─────────────────────────────────────────────────
  const deleteRow = async (id: string) => {
    setDeletingId(id)
    setConfirmDeleteId(null)
    const { error } = await supabase.from('voti_giornata').delete().eq('id', id)
    if (!error) {
      setRows((prev) => prev.filter((r) => r.id !== id))
      setTotal((t) => t - 1)
    }
    setDeletingId(null)
  }

  // ── Elimina tutto il filtro corrente ─────────────────────────────────────
  const bulkDelete = async () => {
    setBulkDeleting(true)
    setConfirmBulkDelete(false)
    let query = supabase.from('voti_giornata').delete()
    if (filterStagione) query = query.eq('stagione', filterStagione)
    if (filterGiornata) query = query.eq('giornata', parseInt(filterGiornata))
    if (filterRuolo) query = query.eq('ruolo', filterRuolo)
    if (filterSearch) {
      query = query.or(
        `nome.ilike.%${filterSearch}%,codice.ilike.%${filterSearch}%,squadra.ilike.%${filterSearch}%`
      )
    }
    await query
    setBulkDeleting(false)
    loadData(0)
    setPage(0)
  }

  const giornate = filterStagione ? (giornatePerStagione[filterStagione] ?? []) : []
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const ROLE_COLORS: Record<string, string> = {
    P: 'bg-yellow-100 text-yellow-700',
    D: 'bg-blue-100 text-blue-700',
    C: 'bg-green-100 text-green-700',
    A: 'bg-red-100 text-red-700',
  }

  return (
    <div className="px-4 py-4 space-y-4">

      {/* ── Filtri ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h2 className="font-bold text-gray-700 text-sm">Filtri</h2>

        <div className="grid grid-cols-2 gap-2">
          {/* Stagione */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Stagione</label>
            <select
              value={filterStagione}
              onChange={(e) => { setFilterStagione(e.target.value); setFilterGiornata('') }}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value="">Tutte</option>
              {stagioni.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Giornata */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Giornata</label>
            <select
              value={filterGiornata}
              onChange={(e) => setFilterGiornata(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value="">Tutte</option>
              {giornate.map((g) => <option key={g} value={String(g)}>G{g}</option>)}
            </select>
          </div>

          {/* Ruolo */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ruolo</label>
            <select
              value={filterRuolo}
              onChange={(e) => setFilterRuolo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value="">Tutti</option>
              {RUOLI.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Ricerca */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cerca</label>
            <div className="flex gap-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setFilterSearch(searchInput) }}
                placeholder="Nome / codice / squadra"
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <button
                onClick={() => setFilterSearch(searchInput)}
                className="px-2.5 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-bold"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Barra risultati + azioni ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? 'Caricamento...' : `${total} righe${total !== rows.length ? ` · pag. ${page + 1}/${totalPages}` : ''}`}
        </p>
        {total > 0 && (
          confirmBulkDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 font-semibold">Elimina {total} righe?</span>
              <button
                onClick={bulkDelete}
                disabled={bulkDeleting}
                className="text-xs px-2.5 py-1.5 bg-red-600 text-white font-bold rounded-lg disabled:opacity-50"
              >
                {bulkDeleting ? '...' : 'Conferma'}
              </button>
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="text-xs px-2.5 py-1.5 bg-gray-100 text-gray-600 font-semibold rounded-lg"
              >
                Annulla
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkDeleting}
              className="text-xs px-3 py-1.5 bg-red-50 text-red-600 font-semibold border border-red-200 rounded-lg disabled:opacity-40"
            >
              Elimina tutti i filtrati ({total})
            </button>
          )
        )}
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-red-600 text-sm">{loadError}</p>
        </div>
      )}

      {/* ── Tabella ── */}
      {rows.length === 0 && !loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-400 text-sm">Nessun dato trovato. Prova a cambiare i filtri.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">R</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Codice</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Nome</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Squadra</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">G</th>
                  <th className="px-3 py-2.5 text-center font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">VotoFanta</th>
                  {NUM_COLS.map((col) => (
                    <th key={col} className="px-3 py-2.5 text-center font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {labels[col]}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">VotoOrig.</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => (
                  <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${deletingId === row.id ? 'opacity-30' : ''}`}>
                    {/* Ruolo */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`font-bold px-1.5 py-0.5 rounded text-xs ${ROLE_COLORS[row.ruolo ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                        {row.ruolo ?? '—'}
                      </span>
                    </td>
                    {/* Codice */}
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap font-mono">{row.codice}</td>
                    {/* Nome */}
                    <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap max-w-[140px] truncate">
                      {row.nome ?? '—'}
                    </td>
                    {/* Squadra */}
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.squadra ?? '—'}</td>
                    {/* Giornata */}
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">G{row.giornata}</td>
                    {/* VotoFanta */}
                    <td className="px-3 py-2 text-center whitespace-nowrap font-medium text-indigo-700">
                      {row.voto_fanta !== null ? String(row.voto_fanta) : '—'}
                    </td>
                    {/* Colonne numeriche editabili */}
                    {NUM_COLS.map((col) => {
                      const isEditing = editingCell?.rowId === row.id && editingCell.col === col
                      const isSaving = savingId === row.id
                      return (
                        <td key={col} className="px-1 py-1 text-center whitespace-nowrap">
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editingCell.value}
                              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                              onBlur={saveCell}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCell()
                                if (e.key === 'Escape') setEditingCell(null)
                              }}
                              className="w-14 text-center border border-blue-400 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          ) : (
                            <button
                              onClick={() => setEditingCell({ rowId: row.id, col, value: String(row[col] ?? '') })}
                              disabled={isSaving || deletingId !== null}
                              className={`w-14 text-center rounded px-1 py-0.5 transition-colors ${
                                isSaving
                                  ? 'opacity-50'
                                  : 'hover:bg-blue-50 hover:text-blue-700 cursor-pointer'
                              } ${row[col] === null ? 'text-gray-300' : 'text-gray-800 font-medium'}`}
                            >
                              {row[col] !== null ? String(row[col]) : '—'}
                            </button>
                          )}
                        </td>
                      )
                    })}
                    {/* VotoGazzettaOriginale */}
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap font-mono">
                      {row.voto_gazzetta_originale ?? '—'}
                    </td>
                    {/* Azioni */}
                    <td className="px-2 py-1 whitespace-nowrap">
                      {confirmDeleteId === row.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteRow(row.id)}
                            className="text-xs px-2 py-1 bg-red-600 text-white font-bold rounded"
                          >
                            Sì
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(row.id)}
                          disabled={deletingId !== null || savingId !== null}
                          className="text-xs px-2 py-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginazione */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg font-semibold text-gray-600 disabled:opacity-30"
              >
                ← Prec
              </button>
              <span className="text-xs text-gray-500">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg font-semibold text-gray-600 disabled:opacity-30"
              >
                Succ →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
