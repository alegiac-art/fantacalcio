import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'
const PREVIEW_ROWS = 10

export async function GET(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const archivio_id = request.nextUrl.searchParams.get('archivio_id')
  if (!archivio_id) return NextResponse.json({ error: 'archivio_id obbligatorio' }, { status: 400 })

  // Usa service client per bypassare RLS sul lookup
  const serviceClient = createServiceClient()

  const { data: archivio, error: archivioErr } = await serviceClient
    .from('voti_archivio')
    .select('storage_path, filename')
    .eq('id', archivio_id)
    .single()

  if (archivioErr || !archivio) {
    return NextResponse.json({ error: `File archivio non trovato (id: ${archivio_id})` }, { status: 404 })
  }

  const { data: fileData, error: downloadErr } = await serviceClient.storage
    .from(BUCKET)
    .download(archivio.storage_path)

  if (downloadErr || !fileData) {
    return NextResponse.json({ error: `Download fallito: ${downloadErr?.message}` }, { status: 500 })
  }

  const arrayBuffer = await fileData.arrayBuffer()

  // Leggi con xlsx (supporta sia XLS che XLSX)
  // cellText:true forza il calcolo di cell.w per tutte le celle
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellText: true, cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // sheet_to_json con raw:false restituisce le stringhe formattate (cell.w)
  const allRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as string[][]

  const rows = allRows.slice(0, PREVIEW_ROWS).map((row) =>
    row.map((cell) => String(cell ?? ''))
  )

  return NextResponse.json({ filename: archivio.filename, rows })
}
