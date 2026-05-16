import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface FixtureResult {
  home_team_id: string
  away_team_id: string
  home_total_score: number
  home_goals: number
  away_total_score: number
  away_goals: number
}

interface TeamResult {
  matchday_id: string
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
    fixtureResults: FixtureResult[]
    voti_archivio_id?: string | null
  }
  const { matchday_id, fixtureResults, voti_archivio_id } = body

  if (!matchday_id || !Array.isArray(fixtureResults) || fixtureResults.length === 0) {
    return NextResponse.json({ error: 'matchday_id e fixtureResults sono obbligatori' }, { status: 400 })
  }

  // Build team results from pre-computed fixture results
  const toUpsert: TeamResult[] = []
  for (const fr of fixtureResults) {
    const homeGoals = fr.home_goals
    const awayGoals = fr.away_goals

    let homePoints = 1, awayPoints = 1
    if (homeGoals > awayGoals) { homePoints = 3; awayPoints = 0 }
    else if (homeGoals < awayGoals) { homePoints = 0; awayPoints = 3 }

    toUpsert.push({
      matchday_id,
      team_id: fr.home_team_id,
      total_score: Math.round(fr.home_total_score * 10) / 10,
      goals_scored: homeGoals,
      goals_conceded: awayGoals,
      points: homePoints,
    })
    toUpsert.push({
      matchday_id,
      team_id: fr.away_team_id,
      total_score: Math.round(fr.away_total_score * 10) / 10,
      goals_scored: awayGoals,
      goals_conceded: homeGoals,
      points: awayPoints,
    })
  }

  const { error: upsertErr } = await sc
    .from('results')
    .upsert(toUpsert, { onConflict: 'matchday_id,team_id' })
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // Segna giornata come completata e salva riferimento ai voti usati
  await sc.from('matchdays')
    .update({ status: 'completed', voti_archivio_id: voti_archivio_id ?? null })
    .eq('id', matchday_id)

  const results = toUpsert.map(({ matchday_id: _, ...r }) => r)
  return NextResponse.json({ success: true, results })
}
