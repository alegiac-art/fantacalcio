import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

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

  // raw: false → ogni cella viene restituita come stringa formattata (cell.w),
  // mai convertita in numero JavaScript. defval: '' per celle vuote.
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as string[][]

  const value: string = rows[decoded.r]?.[decoded.c] ?? ''

  return NextResponse.json({ cell: cellRef, value, filename: archivio.filename })
}
