import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

export async function DELETE(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  let body: { id: string; storage_path: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { id, storage_path } = body
  if (!id || !storage_path) {
    return NextResponse.json({ error: 'id e storage_path sono obbligatori' }, { status: 400 })
  }

  try {
    // 1. Elimina il file da Supabase Storage (service client)
    const serviceClient = createServiceClient()
    const { error: storageErr } = await serviceClient.storage
      .from(BUCKET)
      .remove([storage_path])

    if (storageErr) {
      return NextResponse.json({ error: `Errore eliminazione file: ${storageErr.message}` }, { status: 500 })
    }

    // 2. Elimina il record dalla tabella
    const { error: dbErr } = await supabase
      .from('voti_archivio')
      .delete()
      .eq('id', id)

    if (dbErr) {
      return NextResponse.json({ error: `Errore eliminazione record: ${dbErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
