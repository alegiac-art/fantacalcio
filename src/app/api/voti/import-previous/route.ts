import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchStagione(giornata: number): Promise<string | null> {
  // Strategia 1: POST con form data (tipico per pagine ASP)
  try {
    const res = await fetch('https://www.pianetafanta.it/voti-ufficiali.asp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        'Referer': 'https://www.pianetafanta.it/voti-ufficiali.asp',
      },
      body: `giornataScelta=${giornata}`,
      cache: 'no-store',
    })
    if (res.ok) {
      const html = await res.text()
      const m = html.match(/(\d{4})\/(\d{4})/)
      if (m) return `${m[1]}/${m[2]}`
    }
  } catch { /* continua */ }

  // Strategia 2: GET con query param
  try {
    const res = await fetch(
      `https://www.pianetafanta.it/voti-ufficiali.asp?giornataScelta=${giornata}`,
      { headers: { 'User-Agent': UA }, cache: 'no-store' }
    )
    if (res.ok) {
      const html = await res.text()
      const m = html.match(/(\d{4})\/(\d{4})/)
      if (m) return `${m[1]}/${m[2]}`
    }
  } catch { /* continua */ }

  // Strategia 3: pagina base (stessa stagione per tutte le giornate)
  try {
    const res = await fetch('https://www.pianetafanta.it/voti-ufficiali.asp', {
      headers: { 'User-Agent': UA }, cache: 'no-store',
    })
    if (res.ok) {
      const html = await res.text()
      const m = html.match(/(\d{4})\/(\d{4})/)
      if (m) return `${m[1]}/${m[2]}`
    }
  } catch { /* nulla */ }

  return null
}

export async function POST(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  let body: { giornata: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { giornata } = body
  if (!giornata || giornata < 1 || giornata > 38) {
    return NextResponse.json({ error: 'Giornata non valida (1–38)' }, { status: 400 })
  }

  // 1. Ricava la stagione dalla pagina
  const stagione = await fetchStagione(giornata)
  if (!stagione) {
    return NextResponse.json(
      { error: 'Impossibile determinare la stagione dalla fonte. Verifica la connessione.' },
      { status: 502 }
    )
  }

  // 2. Controlla duplicati
  const { data: existing } = await supabase
    .from('voti_archivio')
    .select('id, filename')
    .eq('stagione', stagione)
    .eq('giornata', giornata)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `Giornata già presente in archivio! (${existing.filename})` },
      { status: 409 }
    )
  }

  // 3. Scarica l'Excel
  const excelUrl = `https://www.pianetafanta.it/voti-ufficiosi-excel.asp?giornataScelta=${giornata}&searchBonus=`
  let excelBuffer: ArrayBuffer
  let contentType: string

  try {
    const excelRes = await fetch(excelUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.pianetafanta.it/voti-ufficiali.asp',
        'Accept': 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
      },
    })

    if (!excelRes.ok) {
      return NextResponse.json(
        { error: `Download fallito (HTTP ${excelRes.status}). I voti della giornata ${giornata} potrebbero non essere ancora disponibili.` },
        { status: 502 }
      )
    }

    excelBuffer = await excelRes.arrayBuffer()
    contentType = excelRes.headers.get('content-type') ?? ''

    if (excelBuffer.byteLength < 1000) {
      return NextResponse.json(
        { error: `Il file scaricato sembra vuoto. I voti della giornata ${giornata} potrebbero non essere disponibili.` },
        { status: 502 }
      )
    }
  } catch (e) {
    return NextResponse.json({ error: `Errore di rete: ${(e as Error).message}` }, { status: 500 })
  }

  // 4. Costruisce il nome file e carica
  const ext = contentType.includes('spreadsheetml') ? 'xlsx' : 'xls'
  const stagioneSafe = stagione.replace('/', '-')
  const giornataStr = String(giornata).padStart(2, '0')
  const filename = `voti_${stagioneSafe}_g${giornataStr}.${ext}`

  const serviceClient = createServiceClient()
  await serviceClient.storage.createBucket(BUCKET, { public: false }).catch(() => {})

  const { error: uploadErr } = await serviceClient.storage
    .from(BUCKET)
    .upload(filename, excelBuffer, {
      contentType: contentType || 'application/vnd.ms-excel',
      upsert: false, // non sovrascrivere — il check duplicati è già sopra
    })

  if (uploadErr) {
    return NextResponse.json({ error: `Upload fallito: ${uploadErr.message}` }, { status: 500 })
  }

  // 5. Salva in DB
  await supabase.from('voti_archivio').insert({
    stagione,
    giornata,
    filename,
    storage_path: filename,
  }).then()

  return NextResponse.json({
    success: true,
    filename,
    stagione,
    giornata,
    bytes: excelBuffer.byteLength,
  })
}
