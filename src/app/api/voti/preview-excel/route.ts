import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'
const PREVIEW_ROWS = 10

/**
 * Legge una cella XLS e restituisce la stringa da mostrare nella preview.
 *
 * Priorità:
 *   1. Cella testo (cell.t === 's'): usa cell.v as-is (preserva virgola, "5,54" → "5,54")
 *   2. Cella numerica: usa cell.w (stringa formattata da SheetJS) se disponibile
 *   3. Fallback: String(cell.v)
 */
function cellDisplay(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return ''

  // Cella testo: restituisce il valore grezzo (stringa con virgola intatta)
  if (cell.t === 's') {
    return String(cell.v)
  }

  // Cella numerica o formula: usa cell.w (stringa già formattata da SheetJS)
  if (cell.w !== undefined && cell.w !== '') {
    return cell.w
  }

  return String(cell.v)
}

export async function GET(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const archivio_id = request.nextUrl.searchParams.get('archivio_id') ?? ''
  const storage_path = request.nextUrl.searchParams.get('storage_path') ?? ''

  if (!archivio_id) return NextResponse.json({ error: 'archivio_id obbligatorio' }, { status: 400 })

  const serviceClient = createServiceClient()

  let { data: archivio } = await serviceClient
    .from('voti_archivio')
    .select('storage_path, filename')
    .eq('id', archivio_id)
    .single()

  // Fallback: ID fittizio → cerca per storage_path passato dal client
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

  // Leggi senza cellText:true per non sovrascrivere cell.w originali
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  if (!sheet['!ref']) {
    return NextResponse.json({ filename: archivio.filename, rows: [] })
  }

  const range = XLSX.utils.decode_range(sheet['!ref'])
  const maxRow = Math.min(range.e.r, PREVIEW_ROWS - 1)
  const maxCol = range.e.c

  // Leggi cella per cella (non sheet_to_json) per preservare le virgole nelle stringhe
  const rows: string[][] = []
  for (let r = range.s.r; r <= maxRow; r++) {
    const rowData: string[] = []
    for (let c = range.s.c; c <= maxCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      rowData.push(cellDisplay(sheet[addr]))
    }
    rows.push(rowData)
  }

  return NextResponse.json({ filename: archivio.filename, rows })
}
