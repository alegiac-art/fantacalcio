import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

function isSenzaVoto(s: string): boolean {
  // "s.v.", "s,v,", "sv", "S.V." ecc.
  return /^s[.,]?v[.,]?$/i.test(s.replace(/\s/g, ''))
}

// Legge una cella direttamente dal foglio, restituisce valore numerico e stringa originale.
// Usa cell.v (valore JS grezzo) per i numeri — evita qualsiasi problema di formato/locale.
function readCell(sheet: XLSX.WorkSheet, rowIdx: number, colIdx: number): { display: string; num: number | null } {
  const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
  const cell = sheet[addr]
  if (!cell || cell.v === undefined || cell.v === null) return { display: '', num: null }

  if (cell.t === 'n') {
    // Cella numerica: .v è già il float corretto (es. 7.04)
    const v = typeof cell.v === 'number' ? cell.v : parseFloat(String(cell.v))
    const display = cell.w ? String(cell.w).trim() : String(cell.v)
    if (isNaN(v)) return { display, num: null }
    // Arrotonda a 1 decimale
    return { display, num: Math.round(v * 10) / 10 }
  }

  // Cella testo (es. "s.v.")
  const s = String(cell.w ?? cell.v).trim()
  if (!s || isSenzaVoto(s)) return { display: s || '', num: null }

  // Prova a parsare come numero italiano (virgola decimale)
  const normalized = s.replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(normalized)
  if (isNaN(n)) return { display: s, num: null }
  return { display: s, num: Math.round(n * 10) / 10 }
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

  // Controlla se già importato (controlla per stagione+giornata, non solo archivio_id)
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

  // Parsa Excel
  const arrayBuffer = await fileData.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // Leggi tutte le righe come stringhe per colonne testo (A-D)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][]

  if (rows.length < 5) {
    return NextResponse.json({ error: 'Il file non contiene dati sufficienti (attese almeno 5 righe)' }, { status: 422 })
  }

  // Riga 4 (indice 3) = intestazioni
  const headers = rows[3] as string[]

  // Mappa le colonne per indice (0-based: A=0, B=1, ..., G=6, H=7, I=8, J=9, K=10)
  const COL_A = 0  // codice giocatore
  const COL_B = 1  // nome
  const COL_C = 2  // squadra
  const COL_D = 3  // ruolo
  const COL_G = 6
  const COL_H = 7
  const COL_I = 8
  const COL_J = 9
  const COL_K = 10

  // Colonna G rinominata "VotoGazzetta"; le altre usano l'intestazione del file
  const labelG = 'VotoGazzetta'
  const labelH = String(headers[COL_H] || 'H').trim()
  const labelI = String(headers[COL_I] || 'I').trim()
  const labelJ = String(headers[COL_J] || 'J').trim()
  const labelK = String(headers[COL_K] || 'K').trim()

  // Righe dati dalla 5 in poi (indice 4+)
  const toInsert: Record<string, unknown>[] = []
  let skippedCoaches = 0

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i]
    const codice = String(row[COL_A] ?? '').trim()

    // Salta righe vuote
    if (!codice) continue

    // Salta allenatori (codice "all." case-insensitive)
    if (codice.toLowerCase().startsWith('all')) {
      skippedCoaches++
      continue
    }

    // Leggi G-K direttamente dalla cella (evita problemi di formato/locale)
    const cellG = readCell(sheet, i, COL_G)
    const cellH = readCell(sheet, i, COL_H)
    const cellI = readCell(sheet, i, COL_I)
    const cellJ = readCell(sheet, i, COL_J)
    const cellK = readCell(sheet, i, COL_K)

    toInsert.push({
      archivio_id: archivio.id,
      stagione: archivio.stagione,
      giornata: archivio.giornata,
      codice,
      nome: String(row[COL_B] ?? '').trim() || null,
      squadra: String(row[COL_C] ?? '').trim() || null,
      ruolo: String(row[COL_D] ?? '').trim() || null,
      col_g_label: labelG,
      col_g: cellG.num,
      voto_gazzetta_originale: cellG.display || null,
      col_h_label: labelH,
      col_h: cellH.num,
      col_i_label: labelI,
      col_i: cellI.num,
      col_j_label: labelJ,
      col_j: cellJ.num,
      col_k_label: labelK,
      col_k: cellK.num,
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'Nessun giocatore trovato nel file (solo allenatori o file vuoto)' }, { status: 422 })
  }

  // Deduplica per codice (tiene l'ultima occorrenza in caso di duplicati nel file)
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
