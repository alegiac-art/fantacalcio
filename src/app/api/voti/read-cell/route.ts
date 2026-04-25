import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '@/lib/excel/parse'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

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

  let decoded: { r: number; c: number }
  try {
    decoded = XLSX.utils.decode_cell(cellRef)
    if (decoded.r < 0 || decoded.c < 0) throw new Error()
  } catch {
    return NextResponse.json({ error: `Riferimento cella non valido: "${cellRef}"` }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  let resolvedPath = storage_path
  let resolvedFilename = storage_path.split('/').pop() ?? storage_path

  if (archivio_id) {
    const { data: byId } = await serviceClient
      .from('voti_archivio')
      .select('storage_path, filename')
      .eq('id', archivio_id)
      .single()

    if (byId) {
      resolvedPath = byId.storage_path
      resolvedFilename = byId.filename
    } else if (storage_path) {
      const { data: byPath } = await serviceClient
        .from('voti_archivio')
        .select('storage_path, filename')
        .eq('storage_path', storage_path)
        .single()
      if (byPath) {
        resolvedPath = byPath.storage_path
        resolvedFilename = byPath.filename
      }
    }
  }

  if (!resolvedPath) {
    return NextResponse.json({ error: `File non trovato (id: ${archivio_id})` }, { status: 404 })
  }

  const { data: fileData, error: downloadErr } = await serviceClient.storage
    .from(BUCKET)
    .download(resolvedPath)

  if (downloadErr || !fileData) {
    return NextResponse.json({ error: `Download fallito: ${downloadErr?.message}` }, { status: 500 })
  }

  const arrayBuffer = await fileData.arrayBuffer()

  // Rileva il formato reale (biff/zip/html/csv) e usa il parser corretto
  const { workbook, format } = parseWorkbook(arrayBuffer)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  if (!sheet['!ref']) {
    return NextResponse.json({ error: 'Il foglio è vuoto' }, { status: 422 })
  }

  const addr = XLSX.utils.encode_cell(decoded)
  const cell: XLSX.CellObject | undefined = sheet[addr]

  const cellV = cell?.v !== undefined ? String(cell.v) : ''
  const length = cellV.length

  // DEBUG
  console.log(`[read-cell] file: ${resolvedFilename} | formato: ${format} | cella: ${cellRef} | cell.v: "${cellV}" | caratteri: ${length}`)
  console.log({ raw: cell?.v, formatted: cell?.w, type: cell?.t })

  return NextResponse.json({ cell: cellRef, raw: cellV, length, format, filename: resolvedFilename })
}
