import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Role = 'P' | 'D' | 'C' | 'A'

/** Normalizza il ruolo dal formato del file voti (es. 'Por', 'Dif', 'Cen', 'Att') a P/D/C/A */
function normalizeRole(ruolo: string | null): Role | null {
  if (!ruolo) return null
  const r = ruolo.trim().toUpperCase()
  if (r === 'P' || r.startsWith('POR')) return 'P'
  if (r === 'D' || r.startsWith('DIF') || r === 'DS') return 'D'
  if (r === 'C' || r.startsWith('CEN') || r.startsWith('MED') || r === 'M') return 'C'
  if (r === 'A' || r.startsWith('ATT')) return 'A'
  return null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  let body: { stagione: string; giornata: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { stagione, giornata } = body
  if (!stagione || !giornata) {
    return NextResponse.json({ error: 'stagione e giornata sono obbligatori' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Legge tutti i giocatori della giornata selezionata
  const { data: votiRows, error: votiErr } = await serviceClient
    .from('voti_giornata')
    .select('codice, nome, ruolo, squadra')
    .eq('stagione', stagione)
    .eq('giornata', giornata)

  if (votiErr) {
    return NextResponse.json({ error: `Errore lettura voti: ${votiErr.message}` }, { status: 500 })
  }

  if (!votiRows || votiRows.length === 0) {
    return NextResponse.json({
      error: `Nessun dato trovato in voti_giornata per ${stagione} G${giornata}. Assicurati di aver importato i voti prima di sincronizzare.`,
    }, { status: 404 })
  }

  // Filtra allenatori (codice che inizia con 'all', case insensitive)
  const giocatori = votiRows.filter(
    (r) => r.codice && !r.codice.toLowerCase().startsWith('all')
  )

  if (giocatori.length === 0) {
    return NextResponse.json({ error: 'Solo allenatori trovati — nessun giocatore da sincronizzare' }, { status: 422 })
  }

  // Ricava i codici presenti e quelli già in players
  const allCodici = giocatori.map((r) => r.codice as string)

  const { data: existingPlayers } = await serviceClient
    .from('players')
    .select('id, codice')
    .in('codice', allCodici)

  const existingCodiciSet = new Set((existingPlayers ?? []).map((p) => p.codice as string))

  const toInsert: { codice: string; name: string; role: Role; serie_a_team: string }[] = []
  const toUpdate: { codice: string; name: string; role: Role; serie_a_team: string }[] = []
  let skippedBadRole = 0

  for (const r of giocatori) {
    const codice = r.codice as string
    const name = (r.nome as string | null)?.trim() || codice
    const role = normalizeRole(r.ruolo as string | null)
    const serie_a_team = (r.squadra as string | null)?.trim() || ''

    if (!role) { skippedBadRole++; continue }

    if (existingCodiciSet.has(codice)) {
      toUpdate.push({ codice, name, role, serie_a_team })
    } else {
      toInsert.push({ codice, name, role, serie_a_team })
    }
  }

  // INSERT nuovi giocatori (a batch da 200)
  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const { error: insErr } = await serviceClient
      .from('players')
      .insert(batch)
    if (insErr) {
      return NextResponse.json({ error: `Errore inserimento: ${insErr.message}` }, { status: 500 })
    }
    inserted += batch.length
  }

  // UPDATE giocatori esistenti (aggiorna nome, ruolo, squadra)
  let updated = 0
  for (const p of toUpdate) {
    const { error: updErr } = await serviceClient
      .from('players')
      .update({ name: p.name, role: p.role, serie_a_team: p.serie_a_team })
      .eq('codice', p.codice)
    if (updErr) {
      return NextResponse.json({ error: `Errore aggiornamento ${p.codice}: ${updErr.message}` }, { status: 500 })
    }
    updated++
  }

  return NextResponse.json({
    success: true,
    inserted,
    updated,
    skippedBadRole,
    total: inserted + updated,
    stagione,
    giornata,
  })
}
