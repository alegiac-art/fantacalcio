import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

async function getContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autorizzato', status: 401 } as const

  const sc = createServiceClient()

  const { data: league } = await sc.from('leagues').select('id, settings').single()
  if (!league) return { error: 'Lega non trovata', status: 404 } as const

  const settings = parseSettings(league.settings)
  if (!settings.roster_editing_enabled) {
    return { error: 'La modifica della rosa non è abilitata dall\'admin', status: 403 } as const
  }

  const { data: team } = await sc
    .from('teams')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (!team) return { error: 'Nessuna squadra assegnata', status: 404 } as const

  return { user, sc, settings, team, leagueId: league.id }
}

/** POST /api/rosa — aggiunge un giocatore alla propria rosa */
export async function POST(request: NextRequest) {
  const ctx = await getContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { sc, settings, team } = ctx

  const { player_id } = await request.json()
  if (!player_id) return NextResponse.json({ error: 'player_id obbligatorio' }, { status: 400 })

  // Verifica che il giocatore non sia già in una rosa
  const { data: existing } = await sc
    .from('rosters')
    .select('id')
    .eq('player_id', player_id)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'Il giocatore è già in una rosa' }, { status: 409 })

  // Verifica limiti
  const { data: myRoster } = await sc
    .from('rosters')
    .select('id, players(role)')
    .eq('team_id', team.id)
  const roster = (myRoster ?? []) as unknown as { id: string; players: { role: string } }[]

  if (roster.length >= settings.roster.max_total) {
    return NextResponse.json({ error: `Rosa completa (max ${settings.roster.max_total})` }, { status: 422 })
  }

  const { data: player } = await sc
    .from('players')
    .select('id, name, role, serie_a_team')
    .eq('id', player_id)
    .single()
  if (!player) return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 404 })

  const roleKey = `max_${player.role}` as keyof typeof settings.roster
  const countInRole = roster.filter((r) => r.players.role === player.role).length
  const maxForRole = settings.roster[roleKey] as number
  if (countInRole >= maxForRole) {
    return NextResponse.json({ error: `Limite ${player.role} raggiunto (max ${maxForRole})` }, { status: 422 })
  }

  const { data: row, error: insErr } = await sc
    .from('rosters')
    .insert({ team_id: team.id, player_id, purchase_price: 0 })
    .select('id, purchase_price')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ success: true, roster_id: row.id, player })
}

/** DELETE /api/rosa — rimuove un giocatore dalla propria rosa */
export async function DELETE(request: NextRequest) {
  const ctx = await getContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { sc, team } = ctx

  const { roster_id } = await request.json()
  if (!roster_id) return NextResponse.json({ error: 'roster_id obbligatorio' }, { status: 400 })

  // Verifica che l'entry appartenga alla squadra dell'utente
  const { data: entry } = await sc
    .from('rosters')
    .select('id')
    .eq('id', roster_id)
    .eq('team_id', team.id)
    .maybeSingle()
  if (!entry) return NextResponse.json({ error: 'Giocatore non trovato nella tua rosa' }, { status: 404 })

  const { error: delErr } = await sc.from('rosters').delete().eq('id', roster_id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
