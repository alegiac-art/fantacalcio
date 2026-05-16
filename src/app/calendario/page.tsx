import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CalendarioClient from './CalendarioClient'

export default async function CalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myTeam } = await supabase
    .from('teams')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  const [
    { data: matchdays },
    { data: allResults },
    { data: allFixtures },
    { data: allLineups },
    { data: allLineupPlayers },
  ] = await Promise.all([
    supabase
      .from('matchdays')
      .select('id, number, deadline, status, voti_archivio:voti_archivio_id(stagione, giornata)')
      .order('number', { ascending: true }),

    supabase
      .from('results')
      .select('matchday_id, team_id, total_score, goals_scored, goals_conceded, points, teams(id, name)'),

    supabase
      .from('fixtures')
      .select('matchday_id, home_team_id, away_team_id, home_team:teams!fixtures_home_team_id_fkey(id, name), away_team:teams!fixtures_away_team_id_fkey(id, name)'),

    supabase
      .from('lineups')
      .select('id, team_id, matchday_id, formation'),

    supabase
      .from('lineup_players')
      .select('lineup_id, player_id, is_starter, bench_order, asterisco, players(name, role, codice)'),
  ])

  // ── Tipi ──────────────────────────────────────────────────────────────────────

  type ResultRow = {
    matchday_id: string; team_id: string
    total_score: number; goals_scored: number; goals_conceded: number; points: number
    teams: { id: string; name: string }
  }
  type FixtureRow = {
    matchday_id: string; home_team_id: string; away_team_id: string
    home_team: { id: string; name: string }; away_team: { id: string; name: string }
  }
  type LineupRow = { id: string; team_id: string; matchday_id: string; formation: string }
  type LPRow = {
    lineup_id: string; player_id: string
    is_starter: boolean; bench_order: number; asterisco: boolean
    players: { name: string; role: string; codice: string | null }
  }

  // ── Indici ────────────────────────────────────────────────────────────────────

  const resultsByMatchday = ((allResults as unknown as ResultRow[]) || []).reduce<
    Record<string, ResultRow[]>
  >((acc, r) => {
    if (!acc[r.matchday_id]) acc[r.matchday_id] = []
    acc[r.matchday_id].push(r)
    return acc
  }, {})

  const fixturesByMatchday = ((allFixtures as unknown as FixtureRow[]) || []).reduce<
    Record<string, FixtureRow[]>
  >((acc, f) => {
    if (!acc[f.matchday_id]) acc[f.matchday_id] = []
    acc[f.matchday_id].push(f)
    return acc
  }, {})

  // lineup_players grouped by lineup_id
  const lpByLineup = ((allLineupPlayers as unknown as LPRow[]) || []).reduce<Record<string, LPRow[]>>(
    (acc, lp) => {
      if (!acc[lp.lineup_id]) acc[lp.lineup_id] = []
      acc[lp.lineup_id].push(lp)
      return acc
    }, {}
  )

  // Costruisci lineupsByMatchdayTeam: matchday_id → team_id → LineupData
  type LineupPlayer = {
    player_id: string; name: string; role: string; codice: string | null
    is_starter: boolean; bench_order: number; asterisco: boolean
  }
  type LineupData = { formation: string; players: LineupPlayer[] }

  const lineupsByMatchdayTeam: Record<string, Record<string, LineupData>> = {}

  for (const lineup of (allLineups as unknown as LineupRow[]) || []) {
    if (!lineupsByMatchdayTeam[lineup.matchday_id])
      lineupsByMatchdayTeam[lineup.matchday_id] = {}

    const lps = lpByLineup[lineup.id] || []
    lineupsByMatchdayTeam[lineup.matchday_id][lineup.team_id] = {
      formation: lineup.formation,
      players: lps.map((lp) => ({
        player_id: lp.player_id,
        name: lp.players.name,
        role: lp.players.role,
        codice: lp.players.codice ?? null,
        is_starter: lp.is_starter,
        bench_order: lp.bench_order ?? 0,
        asterisco: lp.asterisco ?? false,
      })),
    }
  }

  return (
    <CalendarioClient
      matchdays={(matchdays || []).map((m) => {
        const raw = m as unknown as { id: string; number: number; deadline: string | null; status: string; voti_archivio: { stagione: string; giornata: number }[] | null }
        return {
          id: raw.id, number: raw.number, deadline: raw.deadline, status: raw.status,
          voti_archivio: Array.isArray(raw.voti_archivio) ? (raw.voti_archivio[0] ?? null) : (raw.voti_archivio ?? null),
        }
      })}
      myTeamId={myTeam?.id ?? null}
      fixturesByMatchday={fixturesByMatchday as Record<string, FixtureRow[]>}
      resultsByMatchday={resultsByMatchday as Record<string, ResultRow[]>}
      lineupsByMatchdayTeam={lineupsByMatchdayTeam}
    />
  )
}
