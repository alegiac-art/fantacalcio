'use client'

import { useState } from 'react'

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
        return
      }

      setDownloadStatus('done')
      setDownloadMsg(`Archiviato: ${data.filename} (${formatBytes(data.bytes)})`)

      // Aggiunge all'archivio locale ottimisticamente
      const newEntry: ArchivioEntry = {
        id: crypto.randomUUID(),
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

  // ── Render ────────────────────────────────────────────────────────────────

  const alreadyArchived = scrapeResult?.stagione && scrapeResult?.excelGiornata
    ? archivio.some(
        (e) => e.stagione === scrapeResult.stagione && e.giornata === scrapeResult.excelGiornata
      )
    : false

  return (
    <div className="px-4 py-4 space-y-4">

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
              <div key={entry.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <span className="text-xs font-black text-green-700">XLS</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{entry.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {entry.stagione} · G{entry.giornata} · {formatDate(entry.downloaded_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
