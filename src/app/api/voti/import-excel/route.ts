import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

// Colonne (1-based, come vuole ExcelJS: A=1, B=2, ..., G=7, ..., AG=33)
const COL_A  = 1   // codice giocatore
const COL_B  = 2   // nome
const COL_C  = 3   // squadra
const COL_D  = 4   // ruolo
const COL_G  = 7
const COL_H  = 8
const COL_I  = 9
const COL_J  = 10
const COL_K  = 11
const COL_AG = 33  // "VG" = VotoFanta

function isSenzaVoto(s: string): boolean {
  return /^s[.,]?v[.,]?$/i.test(s.replace(/\s/g, ''))
}

/** Valore grezzo della cella come stringa, senza trasformazioni. */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toLocaleDateString('it-IT')
  // Rich text
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim()
  }
  // Formula: usa il risultato
  if (typeof v === 'object' && 'result' in v) {
    const res = (v as ExcelJS.CellFormulaValue).result
    if (res === null || res === undefined) return ''
    if (typeof res === 'number') return String(res)
    if (typeof res === 'string') return res.trim()
  }
  return String(v).trim()
}

/** Valore numerico della cella. Gestisce sia number sia stringhe con virgola italiana. */
function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'))
    return isNaN(n) ? null : n
  }
  if (typeof v === 'object' && 'result' in v) {
    const res = (v as ExcelJS.CellFormulaValue).result
    if (typeof res === 'number') return res
    if (typeof res === 'string') {
      const n = parseFloat((res as string).replace(',', '.'))
      return isNaN(n) ? null : n
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  let body: { archivio_id: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { archivio_id } = body
  if (!archivio_id) return NextResponse.json({ error: 'archivio_id obbligatorio' }, { status: 400 })

  // Recupera record archivio
  const { data: archivio, error: archivioErr } = await supabase
    .from('voti_archivio')
    .select('id, stagione, giornata, storage_path, filename')
    .eq('id', archivio_id)
    .single()

  if (archivioErr || !archivio) {
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
  const serviceClient = createServiceClient()
  const { data: fileData, error: downloadErr } = await serviceClient.storage
    .from(BUCKET)
    .download(archivio.storage_path)

  if (downloadErr || !fileData) {
    return NextResponse.json({ error: `Download file fallito: ${downloadErr?.message}` }, { status: 500 })
  }

  // Parsa Excel con ExcelJS
  const arrayBuffer = await fileData.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(arrayBuffer)
  } catch {
    return NextResponse.json(
      { error: 'Impossibile leggere il file. Assicurati che sia in formato XLSX.' },
      { status: 422 }
    )
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet || worksheet.rowCount < 5) {
    return NextResponse.json({ error: 'Il file non contiene dati sufficienti (attese almeno 5 righe)' }, { status: 422 })
  }

  // Riga 4 = intestazioni
  const headerRow = worksheet.getRow(4)
  const labelG = 'VotoGazzetta'
  const labelH = cellText(headerRow.getCell(COL_H)) || 'H'
  const labelI = cellText(headerRow.getCell(COL_I)) || 'I'
  const labelJ = cellText(headerRow.getCell(COL_J)) || 'J'
  const labelK = cellText(headerRow.getCell(COL_K)) || 'K'

  // Righe dati dalla 5 in poi
  const toInsert: Record<string, unknown>[] = []
  let skippedCoaches = 0

  for (let rowIdx = 5; rowIdx <= worksheet.rowCount; rowIdx++) {
    const row = worksheet.getRow(rowIdx)
    const codice = cellText(row.getCell(COL_A))

    if (!codice) continue
    if (codice.toLowerCase().startsWith('all')) { skippedCoaches++; continue }

    const gCell  = row.getCell(COL_G)
    const agCell = row.getCell(COL_AG)

    // Testo grezzo per i campi _originale (esattamente come appare nella cella)
    const rawG  = cellText(gCell)
    const rawAG = cellText(agCell)

    // Valori numerici: ExcelJS restituisce già il float corretto (es. 6.5, non 65)
    const colG  = isSenzaVoto(rawG)  ? null : cellNum(gCell)
    const colH  = isSenzaVoto(cellText(row.getCell(COL_H))) ? null : cellNum(row.getCell(COL_H))
    const colI  = isSenzaVoto(cellText(row.getCell(COL_I))) ? null : cellNum(row.getCell(COL_I))
    const colJ  = isSenzaVoto(cellText(row.getCell(COL_J))) ? null : cellNum(row.getCell(COL_J))
    const colK  = isSenzaVoto(cellText(row.getCell(COL_K))) ? null : cellNum(row.getCell(COL_K))
    const vFanta = isSenzaVoto(rawAG) ? null : cellNum(agCell)

    toInsert.push({
      archivio_id: archivio.id,
      stagione: archivio.stagione,
      giornata: archivio.giornata,
      codice,
      nome:    cellText(row.getCell(COL_B)) || null,
      squadra: cellText(row.getCell(COL_C)) || null,
      ruolo:   cellText(row.getCell(COL_D)) || null,
      col_g_label: labelG,
      col_g: colG,
      voto_gazzetta_originale: rawG || null,
      col_h_label: labelH,
      col_h: colH,
      col_i_label: labelI,
      col_i: colI,
      col_j_label: labelJ,
      col_j: colJ,
      col_k_label: labelK,
      col_k: colK,
      voto_fanta: vFanta,
      voto_fanta_originale: rawAG || null,
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
