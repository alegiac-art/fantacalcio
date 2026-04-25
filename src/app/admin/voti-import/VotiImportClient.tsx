'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

type LogLevel = 'info' | 'ok' | 'error' | 'debug'
type LogEntry = { id: number; ts: string; level: LogLevel; msg: string }

type ArchivioEntry = {
  id: string
  stagione: string
  giornata: number
  filename: string
  storage_path: string
  downloaded_at: string
}

type ScrapeResult = {
  success?: boolean
  error?: string
  debug?: string
  stagione: string | null
  giornata: number | null
  hasExcel: boolean
  excelGiornata: number | null
}

interface Props {
  archivio: ArchivioEntry[]
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function VotiImportClient({ archivio: initialArchivio }: Props) {
  const [scrapeStatus, setScrapeStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle')
  const [downloadMsg, setDownloadMsg] = useState('')
  const [archivio, setArchivio] = useState<ArchivioEntry[]>(initialArchivio)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<Record<string, { text: string; isError: boolean }>>({})
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{ filename: string; rows: string[][] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // ── Leggi valore cella ────────────────────────────────────────────────────
  const [cellModalEntry, setCellModalEntry] = useState<ArchivioEntry | null>(null)
  const [cellRef, setCellRef] = useState('')
  const [cellResult, setCellResult] = useState<number | null>(null)
  const [cellLoading, setCellLoading] = useState(false)
  const [cellError, setCellError] = useState('')

  // ── Debug console ────────────────────────────────────────────────────────
  const [debugLog, setDebugLog] = useState<LogEntry[]>([])
  const [debugOpen, setDebugOpen] = useState(true)
  const debugEndRef = useRef<HTMLDivElement>(null)
  const logIdRef = useRef(0)

  const dbgLog = useCallback((msg: string, level: LogLevel = 'info') => {
    const now = new Date()
    const ts = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setDebugLog((prev) => [...prev, { id: ++logIdRef.current, ts, level, msg }])
  }, [])

  useEffect(() => {
    if (debugOpen) debugEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [debugLog, debugOpen])

  // ── Importazione manuale ─────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [manualStatus, setManualStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [manualMsg, setManualMsg] = useState('')
  const [manualEntry, setManualEntry] = useState<ArchivioEntry | null>(null)

  // ── Importa giornata precedente ───────────────────────────────────────────
  const [prevGiornata, setPrevGiornata] = useState('')
  const [prevStatus, setPrevStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [prevMsg, setPrevMsg] = useState('')

  // ── Scarica file in locale ────────────────────────────────────────────────

  const handleDownloadFile = async (entry: ArchivioEntry) => {
    setDownloadingId(entry.id)
    try {
      const res = await fetch(`/api/voti/signed-url?path=${encodeURIComponent(entry.storage_path)}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        alert(`Errore: ${data.error ?? 'URL non disponibile'}`)
        return
      }
      const a = document.createElement('a')
      a.href = data.url
      a.download = entry.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  // ── Elimina voce archivio ─────────────────────────────────────────────────

  const handleDelete = async (entry: ArchivioEntry) => {
    setDeletingId(entry.id)
    setConfirmDeleteId(null)
    try {
      const res = await fetch('/api/voti/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, storage_path: entry.storage_path }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        alert(`Errore: ${data.error ?? 'Eliminazione fallita'}`)
      } else {
        setArchivio((prev) => prev.filter((e) => e.id !== entry.id))
      }
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`)
    } finally {
      setDeletingId(null)
    }
  }

  // ── Controlla disponibilità ────────────────────────────────────────────────

  const handleCheck = async () => {
    setScrapeStatus('loading')
    setScrapeResult(null)
    setDownloadStatus('idle')
    setDownloadMsg('')
    try {
      const res = await fetch('/api/voti/scrape')
      const data: ScrapeResult = await res.json()
      setScrapeResult(data)
      setScrapeStatus(data.error ? 'error' : 'done')
    } catch (e) {
      setScrapeResult({ stagione: null, giornata: null, hasExcel: false, excelGiornata: null, error: (e as Error).message })
      setScrapeStatus('error')
    }
  }

  // ── Scarica e archivia ────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (!scrapeResult?.stagione || !scrapeResult?.excelGiornata) return

    setDownloadStatus('downloading')
    setDownloadMsg('')
    dbgLog(`Scaricamento file G${scrapeResult.excelGiornata} stagione ${scrapeResult.stagione} da PianetaFanta…`)
    try {
      const res = await fetch('/api/voti/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giornata: scrapeResult.excelGiornata,
          stagione: scrapeResult.stagione,
        }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setDownloadStatus('error')
        setDownloadMsg(data.error ?? 'Errore sconosciuto')
        dbgLog(`Errore download: ${data.error ?? 'sconosciuto'}`, 'error')
        return
      }

      setDownloadStatus('done')
      setDownloadMsg(`Archiviato: ${data.filename} (${formatBytes(data.bytes)})`)
      dbgLog(`File scaricato: ${data.filename} (${formatBytes(data.bytes)})`, 'ok')

      // Aggiunge all'archivio locale con l'id reale restituito dal server
      const newEntry: ArchivioEntry = {
        id: data.id ?? crypto.randomUUID(),
        stagione: scrapeResult.stagione!,
        giornata: scrapeResult.excelGiornata!,
        filename: data.filename,
        storage_path: data.filename,
        downloaded_at: new Date().toISOString(),
      }
      setArchivio((prev) => {
        // Rimuove eventuale duplicato per stessa stagione/giornata
        const filtered = prev.filter(
          (e) => !(e.stagione === newEntry.stagione && e.giornata === newEntry.giornata)
        )
        return [newEntry, ...filtered]
      })
    } catch (e) {
      setDownloadStatus('error')
      setDownloadMsg((e as Error).message)
    }
  }

  const handleImportPrev = async () => {
    const g = parseInt(prevGiornata, 10)
    if (!g || g < 1 || g > 38) {
      setPrevMsg('Inserisci un numero di giornata valido (1–38)')
      setPrevStatus('error')
      return
    }
    setPrevStatus('loading')
    setPrevMsg('')
    dbgLog(`Importazione giornata precedente G${g} da PianetaFanta…`)
    try {
      const res = await fetch('/api/voti/import-previous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giornata: g }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setPrevStatus('error')
        setPrevMsg(data.error ?? 'Errore sconosciuto')
        dbgLog(`Errore importazione: ${data.error ?? 'sconosciuto'}`, 'error')
        return
      }
      setPrevStatus('done')
      setPrevMsg(`Archiviato: ${data.filename} (${formatBytes(data.bytes)})`)
      dbgLog(`File archiviato: ${data.filename} (${formatBytes(data.bytes)})`, 'ok')
      const newEntry: ArchivioEntry = {
        id: data.id ?? crypto.randomUUID(),
        stagione: data.stagione,
        giornata: data.giornata,
        filename: data.filename,
        storage_path: data.filename,
        downloaded_at: new Date().toISOString(),
      }
      setArchivio((prev) => {
        const filtered = prev.filter(
          (e) => !(e.stagione === newEntry.stagione && e.giornata === newEntry.giornata)
        )
        return [newEntry, ...filtered]
      })
      setPrevGiornata('')
    } catch (e) {
      setPrevStatus('error')
      setPrevMsg((e as Error).message)
    }
  }

  // ── Preview contenuto Excel ───────────────────────────────────────────────

  const handlePreview = async (entry: ArchivioEntry, limit?: number) => {
    setPreviewId(entry.id)
    setPreviewData(null)
    setPreviewLoading(true)
    dbgLog(`Preview: ${entry.filename}${limit ? ` (${limit} righe)` : ''}`)
    try {
      const params = new URLSearchParams({
        archivio_id: entry.id,
        storage_path: entry.storage_path,
        ...(limit ? { limit: String(limit) } : {}),
      })
      const res = await fetch(`/api/voti/preview-excel?${params}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        dbgLog(`Errore preview: ${data.error ?? 'sconosciuto'}`, 'error')
        alert(`Errore preview: ${data.error ?? 'Sconosciuto'}`)
        setPreviewId(null)
      } else {
        dbgLog(`Preview OK — formato: ${data.format ?? '?'} | ${data.rows.length} righe × ${data.rows[0]?.length ?? 0} colonne`, 'ok')
        setPreviewData(data)
      }
    } catch (e) {
      dbgLog(`Errore: ${(e as Error).message}`, 'error')
      alert(`Errore: ${(e as Error).message}`)
      setPreviewId(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const closePreview = () => {
    setPreviewId(null)
    setPreviewData(null)
  }

  const openCellModal = (entry: ArchivioEntry) => {
    setCellModalEntry(entry)
    setCellRef('')
    setCellResult(null)
    setCellError('')
  }

  const closeCellModal = () => {
    setCellModalEntry(null)
    setCellResult(null)
    setCellError('')
  }

  const handleReadCell = async () => {
    if (!cellModalEntry || !cellRef.trim()) return
    setCellLoading(true)
    setCellResult(null)
    setCellError('')
    dbgLog(`Lettura cella ${cellRef.trim()} da ${cellModalEntry.filename}…`)
    try {
      const params = new URLSearchParams({
        archivio_id: cellModalEntry.id,
        storage_path: cellModalEntry.storage_path,
        cell: cellRef.trim(),
      })
      const res = await fetch(`/api/voti/read-cell?${params}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        setCellError(data.error ?? 'Errore sconosciuto')
        dbgLog(`Errore lettura cella: ${data.error ?? 'sconosciuto'}`, 'error')
      } else {
        setCellResult(data.length)
        dbgLog(`Cella ${data.cell} — formato file: ${data.format ?? '?'} | RAW cell.v: "${data.raw}" | caratteri: ${data.length}`, 'debug')
      }
    } catch (e) {
      setCellError((e as Error).message)
      dbgLog(`Errore: ${(e as Error).message}`, 'error')
    } finally {
      setCellLoading(false)
    }
  }

  const handleManualUpload = async () => {
    if (!manualFile) return
    setManualStatus('uploading')
    setManualMsg('')
    setManualEntry(null)
    dbgLog(`Upload manuale: ${manualFile.name} (${formatBytes(manualFile.size)})`)
    try {
      const fd = new FormData()
      fd.append('file', manualFile)
      const res = await fetch('/api/voti/upload-manual', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || data.error) {
        setManualStatus('error')
        setManualMsg(data.error ?? 'Errore sconosciuto')
        dbgLog(`Errore upload: ${data.error ?? 'sconosciuto'}`, 'error')
        return
      }
      setManualStatus('done')
      setManualMsg(`Caricato: ${data.filename} (${formatBytes(data.bytes)})`)
      dbgLog(`File convertito e salvato: ${data.filename} (${formatBytes(data.bytes)}) | formato rilevato: ${data.format ?? '?'}`, 'ok')
      const entry: ArchivioEntry = {
        id: data.id ?? crypto.randomUUID(),
        stagione: data.stagione ?? '',
        giornata: data.giornata ?? 0,
        filename: data.filename,
        storage_path: data.storage_path,
        downloaded_at: new Date().toISOString(),
      }
      setManualEntry(entry)
      setArchivio((prev) => [entry, ...prev.filter((e) => e.filename !== entry.filename)])
    } catch (e) {
      setManualStatus('error')
      setManualMsg((e as Error).message)
    }
  }

  // ── Importa Excel in DB ───────────────────────────────────────────────────

  const handleImportExcel = async (entry: ArchivioEntry) => {
    setImportingId(entry.id)
    setImportMsg((prev) => ({ ...prev, [entry.id]: { text: '', isError: false } }))
    dbgLog(`Importazione in DB: ${entry.filename}`)
    try {
      const res = await fetch('/api/voti/import-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archivio_id: entry.id,
          storage_path: entry.storage_path,
          filename: entry.filename,
          stagione: entry.stagione || null,
          giornata: entry.giornata || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setImportMsg((prev) => ({ ...prev, [entry.id]: { text: data.error ?? 'Errore sconosciuto', isError: true } }))
        dbgLog(`Errore importazione DB: ${data.error ?? 'sconosciuto'}`, 'error')
      } else {
        setImportedIds((prev) => new Set([...prev, entry.id]))
        setImportMsg((prev) => ({
          ...prev,
          [entry.id]: {
            text: `${data.inserted} giocatori importati (${data.skippedCoaches} all. saltati${data.duplicatesInFile > 0 ? `, ${data.duplicatesInFile} duplicati nel file` : ''})`,
            isError: false,
          },
        }))
        dbgLog(`Importazione OK — ${data.inserted} giocatori | ${data.skippedCoaches} allenatori saltati${data.duplicatesInFile > 0 ? ` | ${data.duplicatesInFile} duplicati` : ''}`, 'ok')
      }
    } catch (e) {
      setImportMsg((prev) => ({ ...prev, [entry.id]: { text: (e as Error).message, isError: true } }))
    } finally {
      setImportingId(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const alreadyArchived = scrapeResult?.stagione && scrapeResult?.excelGiornata
    ? archivio.some(
        (e) => e.stagione === scrapeResult.stagione && e.giornata === scrapeResult.excelGiornata
      )
    : false

  return (
    <>
    <div className="px-4 py-4 space-y-4 pb-60">

      {/* Card: Controlla nuovi voti */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h2 className="font-bold text-gray-700 text-sm mb-3">Verifica disponibilità</h2>
        <p className="text-xs text-gray-400 mb-3">
          Controlla se PianetaFanta ha pubblicato nuovi voti ufficiali disponibili per il download.
        </p>
        <button
          onClick={handleCheck}
          disabled={scrapeStatus === 'loading'}
          className="w-full bg-gray-800 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 hover:bg-gray-700 transition-colors"
        >
          {scrapeStatus === 'loading' ? 'Controllo in corso...' : 'Controlla disponibilità voti'}
        </button>
      </div>

      {/* Risultato scraping */}
      {scrapeResult && (
        <div className={`rounded-2xl p-4 border ${
          scrapeStatus === 'error'
            ? 'bg-red-50 border-red-200'
            : scrapeResult.hasExcel
              ? 'bg-green-50 border-green-200'
              : 'bg-amber-50 border-amber-200'
        }`}>
          {scrapeResult.error ? (
            <div>
              <p className="font-bold text-red-700 text-sm">Errore</p>
              <p className="text-red-600 text-sm mt-1">{scrapeResult.error}</p>
              {scrapeResult.debug && (
                <details className="mt-2">
                  <summary className="text-xs text-red-500 cursor-pointer">Dettagli tecnici</summary>
                  <pre className="text-xs text-red-400 mt-1 whitespace-pre-wrap break-all">{scrapeResult.debug}</pre>
                </details>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800 text-sm">
                    {scrapeResult.stagione
                      ? `Stagione ${scrapeResult.stagione}`
                      : 'Stagione non rilevata'}
                  </p>
                  {scrapeResult.giornata && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {scrapeResult.giornata}ª giornata Serie A
                    </p>
                  )}
                </div>
                {scrapeResult.hasExcel ? (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                    Excel disponibile
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    Non disponibile
                  </span>
                )}
              </div>

              {scrapeResult.hasExcel && scrapeResult.excelGiornata && scrapeResult.stagione && (
                <div className="pt-2 border-t border-green-200">
                  {alreadyArchived ? (
                    <p className="text-xs text-green-700 font-semibold text-center py-1">
                      Giornata {scrapeResult.excelGiornata} già in archivio
                    </p>
                  ) : (
                    <button
                      onClick={handleDownload}
                      disabled={downloadStatus === 'downloading'}
                      className="w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
                    >
                      {downloadStatus === 'downloading'
                        ? 'Download in corso...'
                        : `Scarica e archivia voti G${scrapeResult.excelGiornata}`}
                    </button>
                  )}

                  {downloadStatus === 'done' && (
                    <p className="text-xs text-green-700 font-semibold text-center mt-2">
                      {downloadMsg}
                    </p>
                  )}
                  {downloadStatus === 'error' && (
                    <p className="text-xs text-red-600 text-center mt-2">{downloadMsg}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card: Importa giornata precedente */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h2 className="font-bold text-gray-700 text-sm mb-1">Importa voti giornata precedente</h2>
        <p className="text-xs text-gray-400 mb-3">
          Inserisci il numero di giornata (1–38) per scaricare e archiviare i voti di una giornata passata.
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={38}
            value={prevGiornata}
            onChange={(e) => {
              setPrevGiornata(e.target.value)
              setPrevStatus('idle')
              setPrevMsg('')
            }}
            placeholder="Es. 10"
            disabled={prevStatus === 'loading'}
            className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
          />
          <button
            onClick={handleImportPrev}
            disabled={prevStatus === 'loading' || !prevGiornata}
            className="flex-1 bg-gray-800 text-white font-bold py-2 rounded-xl text-sm disabled:opacity-50 hover:bg-gray-700 transition-colors"
          >
            {prevStatus === 'loading' ? 'Importazione...' : 'Ricerca ed importa'}
          </button>
        </div>
        {prevStatus === 'done' && (
          <p className="text-xs text-green-700 font-semibold mt-2">{prevMsg}</p>
        )}
        {prevStatus === 'error' && (
          <p className="text-xs text-red-600 mt-2">{prevMsg}</p>
        )}
      </div>

      {/* Card: Importazione manuale */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h2 className="font-bold text-gray-700 text-sm mb-1">Importazione manuale</h2>
        <p className="text-xs text-gray-400 mb-3">
          Carica un file .xls o .xlsx dal tuo computer. Il file verrà convertito in XLSX e salvato nell&apos;archivio.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setManualFile(f)
            setManualStatus('idle')
            setManualMsg('')
            setManualEntry(null)
          }}
        />

        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 border border-dashed border-gray-300 text-gray-500 font-medium py-2 px-3 rounded-xl text-sm hover:border-gray-400 hover:text-gray-700 transition-colors text-left truncate"
          >
            {manualFile ? manualFile.name : 'Scegli file .xls / .xlsx…'}
          </button>
          <button
            onClick={handleManualUpload}
            disabled={!manualFile || manualStatus === 'uploading'}
            className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            {manualStatus === 'uploading' ? 'Caricamento...' : 'Carica'}
          </button>
        </div>

        {manualStatus === 'done' && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-green-700 font-semibold">{manualMsg}</p>
            {manualEntry && (
              <button
                onClick={() => handlePreview(manualEntry, 20)}
                disabled={previewLoading && previewId === manualEntry.id}
                className="w-full border border-gray-200 text-gray-600 font-semibold py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                {previewLoading && previewId === manualEntry.id ? 'Caricamento preview...' : 'Preview prime 20 righe'}
              </button>
            )}
          </div>
        )}
        {manualStatus === 'error' && (
          <p className="text-xs text-red-600 mt-2">{manualMsg}</p>
        )}
      </div>

      {/* Archivio */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-sm">Archivio file</h2>
          <span className="text-xs text-gray-400">{archivio.length} file</span>
        </div>

        {archivio.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Nessun file archiviato ancora.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {archivio.map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-green-700">XLS</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{entry.filename}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {entry.stagione} · G{entry.giornata} · {formatDate(entry.downloaded_at)}
                    </p>
                    {importMsg[entry.id]?.text && (
                      <p className={`text-xs mt-0.5 font-medium ${importMsg[entry.id].isError ? 'text-red-500' : 'text-green-600'}`}>
                        {importMsg[entry.id].text}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handlePreview(entry)}
                      disabled={previewLoading && previewId === entry.id}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 font-semibold border border-gray-200 disabled:opacity-40"
                    >
                      {previewLoading && previewId === entry.id ? '...' : 'Preview contenuto'}
                    </button>
                    <button
                      onClick={() => openCellModal(entry)}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-semibold border border-amber-200"
                    >
                      Leggi cella
                    </button>
                    <button
                      onClick={() => handleDownloadFile(entry)}
                      disabled={downloadingId === entry.id}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold border border-blue-200 disabled:opacity-40"
                    >
                      {downloadingId === entry.id ? '...' : 'Scarica'}
                    </button>
                    <button
                      onClick={() => handleImportExcel(entry)}
                      disabled={importingId === entry.id || importedIds.has(entry.id)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold border disabled:opacity-40 ${
                        importedIds.has(entry.id)
                          ? 'bg-green-50 text-green-600 border-green-200'
                          : 'bg-purple-50 text-purple-600 border-purple-200'
                      }`}
                    >
                      {importingId === entry.id ? '...' : importedIds.has(entry.id) ? 'Importato' : 'Importa'}
                    </button>
                    {confirmDeleteId === entry.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(entry)}
                          disabled={deletingId === entry.id}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-bold disabled:opacity-50"
                        >
                          {deletingId === entry.id ? '...' : 'Conferma'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-semibold"
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        disabled={deletingId !== null}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 font-semibold border border-red-200 disabled:opacity-40"
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
    {/* ── Modal preview Excel ── */}
    {previewData && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        onClick={closePreview}
      >
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <p className="font-bold text-gray-800 text-sm">Preview contenuto</p>
              <p className="text-xs text-gray-400 mt-0.5">{previewData.filename} — prime {previewData.rows.length} righe</p>
            </div>
            <button
              onClick={closePreview}
              className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none"
            >
              ×
            </button>
          </div>

          {/* Tabella */}
          <div className="overflow-auto flex-1 p-4">
            <table className="text-xs border-collapse w-max min-w-full">
              <thead>
                <tr>
                  <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-gray-400 font-semibold text-right w-8">#</th>
                  {(previewData.rows[0] ?? []).map((_, ci) => (
                    <th key={ci} className="border border-gray-200 bg-gray-50 px-2 py-1 text-gray-500 font-semibold whitespace-nowrap">
                      {XLSX_COL_LABEL(ci)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-100 px-2 py-1 text-gray-300 text-right font-mono">{ri + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-gray-100 px-2 py-1 text-gray-700 whitespace-nowrap font-mono">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
    {/* ── Debug console ── */}
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-950 border-t border-gray-700 shadow-2xl flex flex-col" style={{ height: debugOpen ? '200px' : '32px' }}>
      {/* Barra titolo — NON è un toggle, ha bottoni espliciti */}
      <div className="flex items-center justify-between px-3 bg-gray-900 border-b border-gray-700 shrink-0" style={{ height: '32px' }}>
        <span className="text-xs font-bold text-green-400 font-mono tracking-wider">DEBUG CONSOLE</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 font-mono">{debugLog.length} eventi</span>
          <button onClick={() => setDebugLog([])} className="text-xs text-gray-500 hover:text-red-400 font-mono transition-colors">clear</button>
          <button onClick={() => setDebugOpen((o) => !o)} className="text-xs text-gray-400 hover:text-white font-mono transition-colors px-1">
            {debugOpen ? '▼ chiudi' : '▲ apri'}
          </button>
        </div>
      </div>
      {/* Log entries */}
      {debugOpen && (
        <div className="overflow-y-auto flex-1 font-mono text-xs px-3 py-1.5 space-y-0.5">
          {debugLog.length === 0 && (
            <p className="text-gray-600 italic py-1">Nessun evento ancora. Esegui un&apos;operazione.</p>
          )}
          {debugLog.map((entry) => (
            <div key={entry.id} className="flex gap-2 leading-5 min-h-5">
              <span className="text-gray-600 shrink-0">{entry.ts}</span>
              <span className={`shrink-0 w-11 ${
                entry.level === 'ok'    ? 'text-green-400' :
                entry.level === 'error' ? 'text-red-400' :
                entry.level === 'debug' ? 'text-cyan-400' :
                'text-gray-500'
              }`}>
                {entry.level === 'ok' ? '[OK] ' : entry.level === 'error' ? '[ERR]' : entry.level === 'debug' ? '[DBG]' : '[INF]'}
              </span>
              <span className={`break-all ${
                entry.level === 'ok'    ? 'text-green-300' :
                entry.level === 'error' ? 'text-red-300' :
                entry.level === 'debug' ? 'text-cyan-300' :
                'text-gray-300'
              }`}>{entry.msg}</span>
            </div>
          ))}
          <div ref={debugEndRef} />
        </div>
      )}
    </div>

    {/* ── Modal leggi cella ── */}
    {cellModalEntry && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        onClick={closeCellModal}
      >
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col p-5 gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-800 text-sm">Leggi valore cella</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-55">{cellModalEntry.filename}</p>
            </div>
            <button
              onClick={closeCellModal}
              className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none"
            >
              ×
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={cellRef}
              onChange={(e) => {
                setCellRef(e.target.value.toUpperCase())
                setCellResult(null)
                setCellError('')
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleReadCell() }}
              placeholder="Es. H24"
              disabled={cellLoading}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50 uppercase"
            />
            <button
              onClick={handleReadCell}
              disabled={cellLoading || !cellRef.trim()}
              className="bg-amber-500 text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40 hover:bg-amber-600 transition-colors"
            >
              {cellLoading ? '...' : 'Leggi'}
            </button>
          </div>

          {cellError && (
            <p className="text-xs text-red-600 font-medium">{cellError}</p>
          )}

          {cellResult !== null && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-1">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Cella {cellRef}</p>
              <p className="text-2xl font-black text-gray-800 font-mono tracking-tight">
                {cellResult} {cellResult === 1 ? 'carattere' : 'caratteri'}
              </p>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  )
}

/** Converte indice colonna 0-based in etichetta Excel (A, B, …, Z, AA, AB, …) */
function XLSX_COL_LABEL(n: number): string {
  let label = ''
  n += 1
  while (n > 0) {
    const rem = (n - 1) % 26
    label = String.fromCharCode(65 + rem) + label
    n = Math.floor((n - 1) / 26)
  }
  return label
}
