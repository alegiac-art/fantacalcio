import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'voti-excel'

export async function GET(request: NextRequest) {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const path = request.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path obbligatorio' }, { status: 400 })

  const serviceClient = createServiceClient()
  const { data, error } = await serviceClient.storage
    .from(BUCKET)
    .createSignedUrl(path, 60) // valido 60 secondi

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'URL non generato' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
