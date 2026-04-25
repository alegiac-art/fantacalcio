import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const sc = createServiceClient()

  // 1. Elimina prima i record dipendenti senza CASCADE
  const { error: lpErr } = await sc
    .from('lineup_players')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (lpErr) return NextResponse.json({ error: `Errore lineup_players: ${lpErr.message}` }, { status: 500 })

  // 2. Elimina tutti i giocatori (rosters e ratings cascadano automaticamente)
  const { error: plErr } = await sc
    .from('players')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (plErr) return NextResponse.json({ error: `Errore players: ${plErr.message}` }, { status: 500 })

  return NextResponse.json({ success: true })
}
