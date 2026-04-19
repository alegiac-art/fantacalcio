import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

export async function POST(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  let body: { giornata: number; stagione: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { giornata, stagione } = body
  if (!giornata || !stagione) {
    return NextResponse.json({ error: 'giornata e stagione sono obbligatori' }, { status: 400 })
  }

  try {
    // 1. Download dall'URL PianetaFanta
    const excelUrl = `https://www.pianetafanta.it/voti-ufficiosi-excel.asp?giornataScelta=${giornata}&searchBonus=`
    const excelRes = await fetch(excelUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.pianetafanta.it/voti-ufficiali.asp',
        'Accept': 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
      },
    })

    if (!excelRes.ok) {
      return NextResponse.json(
        { error: `Download fallito: HTTP ${excelRes.status} — il file potrebbe non essere ancora disponibile` },
        { status: 502 }
      )
    }

    const buffer = await excelRes.arrayBuffer()
    if (buffer.byteLength < 1000) {
      return NextResponse.json(
        { error: 'Il file scaricato sembra vuoto o non valido' },
        { status: 502 }
      )
    }

    // 2. Determina estensione dal Content-Type
    const ct = excelRes.headers.get('content-type') ?? ''
    const ext = ct.includes('spreadsheetml') ? 'xlsx' : 'xls'

    // 3. Costruisce il nome file: voti_2025-2026_g31.xlsx
    const stagioneSafe = stagione.replace('/', '-')
    const giornataStr = String(giornata).padStart(2, '0')
    const filename = `voti_${stagioneSafe}_g${giornataStr}.${ext}`

    // 4. Service client per operazioni privilegiate su Storage
    const serviceClient = createServiceClient()

    // Crea il bucket se non esiste (richiede service role key)
    await serviceClient.storage.createBucket(BUCKET, { public: false }).catch(() => {})

    // 5. Upload in Supabase Storage (via service client)
    const { error: uploadErr } = await serviceClient.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: ct || 'application/vnd.ms-excel',
        upsert: true,
      })

    if (uploadErr) {
      return NextResponse.json({ error: `Upload fallito: ${uploadErr.message}` }, { status: 500 })
    }

    // 6. Salva record in voti_archivio e restituisce l'id reale
    const { data: archivioRow } = await supabase.from('voti_archivio').upsert(
      { stagione, giornata, filename, storage_path: filename },
      { onConflict: 'stagione,giornata' }
    ).select('id').single()

    return NextResponse.json({ success: true, filename, bytes: buffer.byteLength, id: archivioRow?.id ?? null })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
