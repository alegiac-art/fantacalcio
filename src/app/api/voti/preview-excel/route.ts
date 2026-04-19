import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'
const PREVIEW_ROWS = 10

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toLocaleDateString('it-IT')
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('')
  }
  if (typeof v === 'object' && 'result' in v) {
    const res = (v as ExcelJS.CellFormulaValue).result
    if (res === null || res === undefined) return ''
    return String(res)
  }
  return String(v)
}

export async function GET(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const archivio_id = request.nextUrl.searchParams.get('archivio_id')
  if (!archivio_id) return NextResponse.json({ error: 'archivio_id obbligatorio' }, { status: 400 })

  const { data: archivio, error: archivioErr } = await supabase
    .from('voti_archivio')
    .select('storage_path, filename')
    .eq('id', archivio_id)
    .single()

  if (archivioErr || !archivio) {
    return NextResponse.json({ error: 'File archivio non trovato' }, { status: 404 })
  }

  const serviceClient = createServiceClient()
  const { data: fileData, error: downloadErr } = await serviceClient.storage
    .from(BUCKET)
    .download(archivio.storage_path)

  if (downloadErr || !fileData) {
    return NextResponse.json({ error: `Download fallito: ${downloadErr?.message}` }, { status: 500 })
  }

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
  if (!worksheet) {
    return NextResponse.json({ error: 'Nessun foglio trovato nel file' }, { status: 422 })
  }

  // Calcola il numero massimo di colonne nelle prime PREVIEW_ROWS righe
  let maxCol = 0
  for (let ri = 1; ri <= Math.min(PREVIEW_ROWS, worksheet.rowCount); ri++) {
    const row = worksheet.getRow(ri)
    if (row.cellCount > maxCol) maxCol = row.cellCount
  }

  // Costruisci la tabella di preview
  const rows: string[][] = []
  for (let ri = 1; ri <= Math.min(PREVIEW_ROWS, worksheet.rowCount); ri++) {
    const row = worksheet.getRow(ri)
    const rowData: string[] = []
    for (let ci = 1; ci <= maxCol; ci++) {
      rowData.push(cellToString(row.getCell(ci)))
    }
    rows.push(rowData)
  }

  return NextResponse.json({ filename: archivio.filename, rows })
}
