import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '@/lib/excel/parse'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

// Colonne 0-based: A=0, B=1, ..., G=6, H=7, ..., K=10, AG=32
const COL_A  = 0
const COL_B  = 1
const COL_C  = 2
const COL_D  = 3
const COL_G  = 6
const COL_H  = 7
const COL_I  = 8
const COL_J  = 9
const COL_K  = 10
const COL_AG = 32

function isSenzaVoto(s: string): boolean {
  return /^s[.,]?v[.,]?$/i.test(s.replace(/\s/g, ''))
}

/**
 * Legge una cella XLS/XLSX e restituisce:
 *   text  – stringa grezza (cell.w se disponibile, altrimenti String(cell.v))
 *   num   – valore numerico (null se s.v. o non parsabile)
 */
function readCell(sheet: XLSX.WorkSheet, row: number, col: number): { text: string; num: number | null } {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  const cell: XLSX.CellObject | undefined = sheet[addr]

  if (!cell || cell.v === undefined || cell.v === null) return { text: '', num: null }

  // Testo grezzo: usa cell.w (stringa formattata dal file) se presente
  const text = (cell.w !== undefined ? String(cell.w) : String(cell.v)).trim()

  if (isSenzaVoto(text)) return { text, num: null }

  // Valore numerico
  if (typeof cell.v === 'number') return { text, num: cell.v }

  // Cella testo con numero italiano ("6,5" → 6.5)
  const n = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
  return { text, num: isNaN(n) ? null : n }
}

export async function POST(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  let body: { archivio_id: string; storage_path?: string; filename?: string; stagione?: string | null; giornata?: number | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { archivio_id } = body
  if (!archivio_id) return NextResponse.json({ error: 'archivio_id obbligatorio' }, { status: 400 })

  // Usa service client per bypassare eventuali RLS
  const serviceClient = createServiceClient()

  let archivio: { id: string; stagione: string | null; giornata: number | null; storage_path: string; filename: string } | null = null

  const { data: byId } = await serviceClient
    .from('voti_archivio')
    .select('id, stagione, giornata, storage_path, filename')
    .eq('id', archivio_id)
    .single()

  if (byId) {
    archivio = byId
  } else if (body.storage_path) {
    // Fallback: cerca per storage_path
    const { data: byPath } = await serviceClient
      .from('voti_archivio')
      .select('id, stagione, giornata, storage_path, filename')
      .eq('storage_path', body.storage_path)
      .single()

    if (byPath) {
      archivio = byPath
    } else {
      // File caricato manualmente senza record DB: usa i campi passati dal client
      archivio = {
        id: archivio_id,
        storage_path: body.storage_path,
        filename: body.filename ?? body.storage_path,
        stagione: body.stagione ?? null,
        giornata: body.giornata ?? null,
      }
    }
  }

  if (!archivio) {
    return NextResponse.json({ error: 'File archivio non trovato' }, { status: 404 })
  }

  // Controlla se già importato
  const { count } = await supabase
    .from('voti_giornata')
    .select('id', { count: 'exact', head: true })
    .eq('stagione', archivio.stagione)
    .eq('giornata', archivio.giornata)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Voti già importati per ${archivio.stagione} G${archivio.giornata} (${count} giocatori). Elimina prima i dati esistenti dalla tabella voti_giornata.` },
      { status: 409 }
    )
  }

  // Scarica il file da Storage
  const { data: fileData, error: downloadErr } = await serviceClient.storage
    .from(BUCKET)
    .download(archivio.storage_path)

  if (downloadErr || !fileData) {
    return NextResponse.json({ error: `Download file fallito: ${downloadErr?.message}` }, { status: 500 })
  }

  // Rileva formato reale (biff/zip/html/csv) e usa il parser corretto
  const arrayBuffer = await fileData.arrayBuffer()
  const { workbook } = parseWorkbook(arrayBuffer)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // Leggi tutte le righe (raw:true per i valori, raw:false per i testi formattati)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][]

  if (rows.length < 5) {
    return NextResponse.json({ error: 'Il file non contiene dati sufficienti (attese almeno 5 righe)' }, { status: 422 })
  }

  // Riga 4 (indice 3) = intestazioni
  const headers = rows[3] as string[]
  const labelG = 'VotoGazzetta'
  const labelH = String(headers[COL_H] || 'H').trim()
  const labelI = String(headers[COL_I] || 'I').trim()
  const labelJ = String(headers[COL_J] || 'J').trim()
  const labelK = String(headers[COL_K] || 'K').trim()

  // Righe dati dalla 5 in poi (indice 4+)
  const toInsert: Record<string, unknown>[] = []
  let skippedCoaches = 0

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const codice = String(row[COL_A] ?? '').trim()

    if (!codice) continue
    if (codice.toLowerCase().startsWith('all')) { skippedCoaches++; continue }

    const cellG  = readCell(sheet, i, COL_G)
    const cellH  = readCell(sheet, i, COL_H)
    const cellI  = readCell(sheet, i, COL_I)
    const cellJ  = readCell(sheet, i, COL_J)
    const cellK  = readCell(sheet, i, COL_K)
    const cellAG = readCell(sheet, i, COL_AG)

    toInsert.push({
      archivio_id: archivio.id,
      stagione: archivio.stagione,
      giornata: archivio.giornata,
      codice,
      nome:    String(row[COL_B] ?? '').trim() || null,
      squadra: String(row[COL_C] ?? '').trim() || null,
      ruolo:   String(row[COL_D] ?? '').trim() || null,
      col_g_label: labelG,
      col_g:   cellG.num,
      voto_gazzetta_originale: cellG.text || null,
      col_h_label: labelH,
      col_h:   cellH.num,
      col_i_label: labelI,
      col_i:   cellI.num,
      col_j_label: labelJ,
      col_j:   cellJ.num,
      col_k_label: labelK,
      col_k:   cellK.num,
      voto_fanta: cellAG.num,
      voto_fanta_originale: cellAG.text || null,
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'Nessun giocatore trovato nel file (solo allenatori o file vuoto)' }, { status: 422 })
  }

  // Deduplica per codice
  const deduped = Object.values(
    toInsert.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
      acc[row.codice as string] = row
      return acc
    }, {})
  )

  // Inserimento a batch (max 500 righe per volta)
  const BATCH = 500
  let inserted = 0
  const duplicatesInFile = toInsert.length - deduped.length

  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH)
    const { error: insertErr } = await supabase
      .from('voti_giornata')
      .upsert(batch, { onConflict: 'stagione,giornata,codice' })

    if (insertErr) {
      return NextResponse.json(
        { error: `Errore inserimento (batch ${Math.floor(i / BATCH) + 1}): ${insertErr.message}` },
        { status: 500 }
      )
    }
    inserted += batch.length
  }

  return NextResponse.json({
    success: true,
    inserted,
    skippedCoaches,
    duplicatesInFile,
    stagione: archivio.stagione,
    giornata: archivio.giornata,
    labels: { g: labelG, h: labelH, i: labelI, j: labelJ, k: labelK },
  })
}
