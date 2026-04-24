import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'
const DEFAULT_PREVIEW_ROWS = 10
const MAX_PREVIEW_ROWS = 50

/**
 * Legge una cella XLS e restituisce la stringa da mostrare nella preview.
 *
 * - Cella testo (cell.t === 's'): usa cell.v as-is (virgola preservata: "s,v," → "s,v,")
 * - Cella numerica colonna G+ (colIdx ≥ 6): se cell.v è un intero ≥ 100,
 *   è un voto codificato ×100 → divido per 100 e mostro con virgola (554 → "5,54")
 * - Altrimenti: cell.w (stringa formattata da SheetJS) o String(cell.v)
 */
function cellDisplay(cell: XLSX.CellObject | undefined, colIdx: number): string {
  if (!cell || cell.v === undefined || cell.v === null) return ''

  // Cella testo: valore grezzo con virgola intatta
  if (cell.t === 's') {
    return String(cell.v)
  }

  // Cella numerica
  if (cell.t === 'n' || cell.t === undefined) {
    const v = typeof cell.v === 'number' ? cell.v : parseFloat(String(cell.v))
    if (isNaN(v)) return cell.w ?? ''

    // Colonne G in poi (indice ≥ 6): voti codificati ×100 come interi
    // es. 554 → 5.54 → "5,54"  |  650 → 6.50 → "6,50"
    if (colIdx >= 6 && Number.isInteger(v) && v >= 100 && v <= 1099) {
      return (v / 100).toFixed(2).replace('.', ',')
    }

    // Altrimenti usa cell.w se disponibile
    if (cell.w !== undefined && cell.w !== '') return cell.w
    return String(v)
  }

  return cell.w ?? String(cell.v)
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
  const limitParam = parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10)
  const previewRows = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_PREVIEW_ROWS)
    : DEFAULT_PREVIEW_ROWS

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
  const maxRow = Math.min(range.e.r, previewRows - 1)
  const maxCol = range.e.c

  // Leggi cella per cella (non sheet_to_json) per preservare le virgole nelle stringhe
  const rows: string[][] = []
  for (let r = range.s.r; r <= maxRow; r++) {
    const rowData: string[] = []
    for (let c = range.s.c; c <= maxCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      rowData.push(cellDisplay(sheet[addr], c))
    }
    rows.push(rowData)
  }

  return NextResponse.json({ filename: archivio.filename, rows })
}
