import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface QuotazioneRow {
  codice: string
  name: string
  role: string
  serie_a_team: string
  quotazione: number | null
}

function normalizeRole(raw: string): string | null {
  const r = raw.trim().toUpperCase()
  if (r === 'P' || r === 'POR') return 'P'
  if (r === 'D' || r === 'DIF' || r === 'DS') return 'D'
  if (r === 'C' || r === 'CEN' || r === 'M' || r === 'MED') return 'C'
  if (r === 'A' || r === 'ATT') return 'A'
  return null
}

/** POST /api/giocatori/import-quotazioni — importa quotazioni da XLS */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const body = await request.json() as { rows: QuotazioneRow[] }
  const rows = body.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Nessun dato ricevuto' }, { status: 400 })
  }

  const sc = createServiceClient()

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    if (!row.codice || !row.name) { skipped++; continue }
    const role = normalizeRole(row.role)
    if (!role) { skipped++; continue }

    // Check if player with this codice already exists
    const { data: existing } = await sc
      .from('players')
      .select('id')
      .eq('codice', row.codice)
      .maybeSingle()

    if (existing) {
      const { error } = await sc
        .from('players')
        .update({
          name: row.name,
          role,
          serie_a_team: row.serie_a_team,
          quotazione: row.quotazione,
        })
        .eq('id', existing.id)
      if (!error) updated++
      else skipped++
    } else {
      const { error } = await sc
        .from('players')
        .insert({
          codice: row.codice,
          name: row.name,
          role,
          serie_a_team: row.serie_a_team,
          quotazione: row.quotazione,
          is_active: true,
        })
      if (!error) inserted++
      else skipped++
    }
  }

  return NextResponse.json({ success: true, inserted, updated, skipped, total: rows.length })
}
