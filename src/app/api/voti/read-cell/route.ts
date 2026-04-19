import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

/**
 * Restituisce il valore display di una cella, applicando la decodifica ×100
 * per le colonne G in poi (stesso comportamento di preview-excel).
 */
function cellDisplay(cell: XLSX.CellObject | undefined, colIdx: number): string {
  if (!cell || cell.v === undefined || cell.v === null) return '(vuota)'

  if (cell.t === 's') return String(cell.v)

  if (cell.t === 'n' || cell.t === undefined) {
    const v = typeof cell.v === 'number' ? cell.v : parseFloat(String(cell.v))
    if (isNaN(v)) return cell.w ?? ''
    if (colIdx >= 6 && Number.isInteger(v) && v >= 100 && v <= 1099) {
      return (v / 100).toFixed(2).replace('.', ',')
    }
    if (cell.w !== undefined && cell.w !== '') return cell.w
    return String(v)
  }

  return cell.w ?? String(cell.v)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const archivio_id = request.nextUrl.searchParams.get('archivio_id') ?? ''
  const storage_path = request.nextUrl.searchParams.get('storage_path') ?? ''
  const cellRef = (request.nextUrl.searchParams.get('cell') ?? '').trim().toUpperCase()

  if (!cellRef) return NextResponse.json({ error: 'Parametro "cell" obbligatorio (es. H24)' }, { status: 400 })

  // Valida il riferimento cella
  let decoded: { r: number; c: number }
  try {
    decoded = XLSX.utils.decode_cell(cellRef)
    if (decoded.r < 0 || decoded.c < 0) throw new Error()
  } catch {
    return NextResponse.json({ error: `Riferimento cella non valido: "${cellRef}"` }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  let { data: archivio } = await serviceClient
    .from('voti_archivio')
    .select('storage_path, filename')
    .eq('id', archivio_id)
    .single()

  if (!archivio && storage_path) {
    const { data: fallback } = await serviceClient
      .from('voti_archivio')
      .select('storage_path, filename')
      .eq('storage_path', storage_path)
      .single()
    archivio = fallback ?? null
  }

  if (!archivio) {
    return NextResponse.json({ error: `File archivio non trovato (id: ${archivio_id})` }, { status: 404 })
  }

  const { data: fileData, error: downloadErr } = await serviceClient.storage
    .from(BUCKET)
    .download(archivio.storage_path)

  if (downloadErr || !fileData) {
    return NextResponse.json({ error: `Download fallito: ${downloadErr?.message}` }, { status: 500 })
  }

  const arrayBuffer = await fileData.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  if (!sheet['!ref']) {
    return NextResponse.json({ error: 'Il foglio è vuoto' }, { status: 422 })
  }

  const range = XLSX.utils.decode_range(sheet['!ref'])
  if (decoded.r > range.e.r || decoded.c > range.e.c) {
    return NextResponse.json({
      cell: cellRef,
      value: '(fuori range)',
      raw: null,
      filename: archivio.filename,
    })
  }

  const addr = XLSX.utils.encode_cell(decoded)
  const cell = sheet[addr] as XLSX.CellObject | undefined
  const value = cellDisplay(cell, decoded.c)
  const raw = cell ? String(cell.v ?? '') : null

  return NextResponse.json({
    cell: cellRef,
    value,
    raw,
    type: cell?.t ?? null,
    filename: archivio.filename,
  })
}
