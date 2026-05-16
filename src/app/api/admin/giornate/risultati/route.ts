import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { calcFantaGoals, parseSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

interface TeamResult {
  team_id: string
  total_score: number
  goals_scored: number
  goals_conceded: number
  points: number
}

/** POST /api/admin/giornate/risultati — salva i risultati di una giornata */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const sc = createServiceClient()

  const body = await request.json() as {
    matchday_id: string
    stagione: string
    giornata: number
    /** editedVotes: codice → voto_fanta override (null = usa quello originale) */
    editedVotes: Record<string, number | null>
  }
  const { matchday_id, stagione, giornata, editedVotes } = body
  if (!matchday_id || !stagione || !giornata) {
    return NextResponse.json({ error: 'matchday_id, stagione e giornata sono obbligatori' }, { status: 400 })
  }

  // Impostazioni lega
  const { data: league } = await sc.from('leagues').select('id, settings').single()
  if (!league) return NextResponse.json({ error: 'Lega non trovata' }, { status: 404 })
  const settings = parseSettings(league.settings)

  // Sfide della giornata
  const { data: fixtures } = await sc
    .from('fixtures')
    .select('id, home_team_id, away_team_id')
    .eq('matchday_id', matchday_id)
  if (!fixtures || fixtures.length === 0) {
    return NextResponse.json({ error: 'Nessuna sfida trovata per questa giornata' }, { status: 404 })
  }

  // Lineups della giornata
  const { data: lineups } = await sc
    .from('lineups')
    .select('id, team_id')
    .eq('matchday_id', matchday_id)
  const lineupByTeam = (lineups ?? []).reduce<Record<string, string>>(
    (acc, l) => { acc[l.team_id] = l.id; return acc }, {}
  )

  // Lineup players (solo titolari) con codice giocatore
  const lineupIds = (lineups ?? []).map((l) => l.id)
  if (lineupIds.length === 0) {
    return NextResponse.json({ error: 'Nessuna formazione trovata per questa giornata' }, { status: 404 })
  }
  const { data: lpRows } = await sc
    .from('lineup_players')
    .select('lineup_id, player_id, is_starter, players(codice)')
    .in('lineup_id', lineupIds)
    .eq('is_starter', true)

  // Voti importati per questa stagione/giornata
  const { data: votiRows } = await sc
    .from('voti_giornata')
    .select('codice, voto_fanta')
    .eq('stagione', stagione)
    .eq('giornata', giornata)
  const votiByCodeice = (votiRows ?? []).reduce<Record<string, number | null>>(
    (acc, v) => { acc[v.codice] = v.voto_fanta; return acc }, {}
  )

  // Calcola score per team
  const teamScores: Record<string, number> = {}

  for (const lp of (lpRows ?? []) as unknown as { lineup_id: string; player_id: string; is_starter: boolean; players: { codice: string | null } }[]) {
    const lineup = (lineups ?? []).find((l) => l.id === lp.lineup_id)
    if (!lineup) continue
    const codice = lp.players?.codice
    if (!codice) continue

    // Usa voto editato se presente, altrimenti voto originale
    const voto = editedVotes[codice] !== undefined
      ? editedVotes[codice]
      : votiByCodeice[codice] ?? null

    if (voto === null || voto === undefined) continue
    teamScores[lineup.team_id] = (teamScores[lineup.team_id] ?? 0) + voto
  }

  // Calcola risultati per sfida
  const results: TeamResult[] = []
  for (const fixture of fixtures) {
    const homeScore = teamScores[fixture.home_team_id] ?? 0
    const awayScore = teamScores[fixture.away_team_id] ?? 0
    const homeGoals = calcFantaGoals(homeScore, settings)
    const awayGoals = calcFantaGoals(awayScore, settings)

    let homePoints = 1, awayPoints = 1
    if (homeGoals > awayGoals) { homePoints = 3; awayPoints = 0 }
    else if (homeGoals < awayGoals) { homePoints = 0; awayPoints = 3 }

    results.push({
      team_id: fixture.home_team_id,
      total_score: Math.round(homeScore * 10) / 10,
      goals_scored: homeGoals,
      goals_conceded: awayGoals,
      points: homePoints,
    })
    results.push({
      team_id: fixture.away_team_id,
      total_score: Math.round(awayScore * 10) / 10,
      goals_scored: awayGoals,
      goals_conceded: homeGoals,
      points: awayPoints,
    })
  }

  // Upsert results
  const toUpsert = results.map((r) => ({ matchday_id, ...r }))
  const { error: upsertErr } = await sc
    .from('results')
    .upsert(toUpsert, { onConflict: 'matchday_id,team_id' })
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // Segna giornata come completata
  await sc.from('matchdays').update({ status: 'completed' }).eq('id', matchday_id)

  return NextResponse.json({ success: true, results })
}
