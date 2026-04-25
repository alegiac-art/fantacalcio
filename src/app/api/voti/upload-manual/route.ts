import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '@/lib/excel/parse'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

/** Prova a estrarre stagione e giornata dal nome file (es. voti_2025-2026_g31.xls) */
function parseFilename(name: string): { stagione: string | null; giornata: number | null } {
  const m = name.match(/voti[_-](\d{4}-\d{4})[_-]g(\d{1,2})/i)
  if (!m) return { stagione: null, giornata: null }
  return { stagione: m[1].replace('-', '/'), giornata: parseInt(m[2], 10) }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Impossibile leggere il form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Nessun file ricevuto' }, { status: 400 })

  const originalName = file.name
  if (!originalName.match(/\.(xls|xlsx)$/i)) {
    return NextResponse.json({ error: 'Il file deve essere .xls o .xlsx' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  if (arrayBuffer.byteLength < 100) {
    return NextResponse.json({ error: 'Il file sembra vuoto o corrotto' }, { status: 400 })
  }

  // Rileva formato reale e riscrivi sempre come XLSX
  let xlsxBuffer: Buffer
  try {
    const { workbook } = parseWorkbook(arrayBuffer)
    xlsxBuffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  } catch (e) {
    return NextResponse.json({ error: `Errore parsing file: ${(e as Error).message}` }, { status: 422 })
  }

  // Nome file di destinazione: sostituisce estensione con .xlsx
  const baseName = originalName.replace(/\.(xls|xlsx)$/i, '')
  const storageName = `manual_${baseName}.xlsx`

  const { stagione, giornata } = parseFilename(originalName)

  const serviceClient = createServiceClient()
  await serviceClient.storage.createBucket(BUCKET, { public: false }).catch(() => {})

  const { error: uploadErr } = await serviceClient.storage
    .from(BUCKET)
    .upload(storageName, xlsxBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })

  if (uploadErr) {
    return NextResponse.json({ error: `Upload fallito: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: archivioRow } = await serviceClient
    .from('voti_archivio')
    .upsert(
      { stagione, giornata, filename: storageName, storage_path: storageName },
      { onConflict: 'stagione,giornata' }
    )
    .select('id')
    .single()

  return NextResponse.json({
    success: true,
    id: archivioRow?.id ?? null,
    filename: storageName,
    storage_path: storageName,
    stagione,
    giornata,
    original_name: originalName,
    bytes: xlsxBuffer.byteLength,
  })
}
