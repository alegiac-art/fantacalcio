import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseWorkbook, extractMeta } from '@/lib/excel/parse'

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

  // Valori opzionali forniti manualmente dall'utente
  const overrideStagione = (formData.get('stagione') as string | null)?.trim() || null
  const overrideGiornataRaw = formData.get('giornata') as string | null
  const overrideGiornata = overrideGiornataRaw ? parseInt(overrideGiornataRaw, 10) || null : null

  const filename = file.name
  if (!filename.match(/\.(xls|xlsx)$/i)) {
    return NextResponse.json({ error: 'Il file deve essere .xls o .xlsx' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  if (arrayBuffer.byteLength < 100) {
    return NextResponse.json({ error: 'Il file sembra vuoto o corrotto' }, { status: 400 })
  }

  // Rileva formato e legge il workbook (solo per estrarre metadati)
  let detectedFormat: string
  let stagione: string | null
  let giornata: number | null
  try {
    const { workbook, format } = parseWorkbook(arrayBuffer)
    detectedFormat = format

    const fromName = parseFilename(filename)
    stagione = fromName.stagione
    giornata = fromName.giornata

    if (!stagione || !giornata) {
      const fromContent = extractMeta(workbook)
      stagione = stagione ?? fromContent.stagione
      giornata = giornata ?? fromContent.giornata
    }

    // Override manuali dell'utente (priorità massima)
    if (overrideStagione) stagione = overrideStagione
    if (overrideGiornata) giornata = overrideGiornata
  } catch (e) {
    return NextResponse.json({ error: `Errore parsing file: ${(e as Error).message}` }, { status: 422 })
  }

  const serviceClient = createServiceClient()
  await serviceClient.storage.createBucket(BUCKET, { public: false }).catch(() => {})

  // Carica il file esattamente com'è, senza modifiche al nome o al formato
  const fileBuffer = Buffer.from(arrayBuffer)
  const contentType = filename.match(/\.xlsx$/i)
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.ms-excel'

  const { error: uploadErr } = await serviceClient.storage
    .from(BUCKET)
    .upload(filename, fileBuffer, { contentType, upsert: true })

  if (uploadErr) {
    return NextResponse.json({ error: `Upload fallito: ${uploadErr.message}` }, { status: 500 })
  }

  // Inserimento in voti_archivio
  let archivioId: string | null = null

  if (stagione && giornata) {
    const { data: row, error: upsertErr } = await serviceClient
      .from('voti_archivio')
      .upsert(
        { stagione, giornata, filename, storage_path: filename },
        { onConflict: 'stagione,giornata' }
      )
      .select('id')
      .single()
    if (upsertErr) {
      return NextResponse.json({ error: `Errore salvataggio archivio: ${upsertErr.message}` }, { status: 500 })
    }
    archivioId = row?.id ?? null
  } else {
    // Cerca se esiste già per storage_path, altrimenti inserisce
    const { data: existing } = await serviceClient
      .from('voti_archivio')
      .select('id')
      .eq('storage_path', filename)
      .maybeSingle()

    if (existing) {
      archivioId = existing.id
    } else {
      // stagione o giornata null: inserisce solo se la tabella lo permette
      const { data: row, error: insertErr } = await serviceClient
        .from('voti_archivio')
        .insert({ stagione, giornata, filename, storage_path: filename })
        .select('id')
        .single()
      if (insertErr) {
        // Se NOT NULL constraint, restituisce errore chiaro invece di fallire silenziosamente
        return NextResponse.json({
          error: `File caricato nello storage ma non salvato in archivio: ${insertErr.message}. Compila i campi Stagione e Giornata prima di caricare.`,
          dbError: insertErr.message,
          uploaded: true,
          filename,
          storage_path: filename,
          stagione,
          giornata,
          format: detectedFormat,
          bytes: arrayBuffer.byteLength,
        }, { status: 422 })
      }
      archivioId = row?.id ?? null
    }
  }

  return NextResponse.json({
    success: true,
    id: archivioId,
    filename,
    storage_path: filename,
    stagione,
    giornata,
    format: detectedFormat,
    bytes: arrayBuffer.byteLength,
  })
}
