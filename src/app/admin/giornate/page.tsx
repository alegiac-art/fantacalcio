import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { parseSettings } from '@/lib/settings'
import GiornateClient from './GiornateClient'

export default async function GiornatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const [
    { data: league },
    { data: matchdays },
    { data: teams },
    { data: fixtures },
    { data: votiArchivio },
    { data: allLineups },
    { data: allLineupPlayers },
    { data: allResults },
  ] = await Promise.all([
    supabase.from('leagues').select('id, name, settings').single(),
    supabase.from('matchdays').select('*').order('number'),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('fixtures').select('id, matchday_id, home_team_id, away_team_id'),
    supabase
      .from('voti_archivio')
      .select('id, stagione, giornata, filename')
      .not('stagione', 'is', null)
      .not('giornata', 'is', null)
      .order('stagione', { ascending: false })
      .order('giornata', { ascending: false }),
    supabase.from('lineups').select('id, team_id, matchday_id, formation'),
    supabase
      .from('lineup_players')
      .select('lineup_id, player_id, is_starter, bench_order, asterisco, players(id, name, role, codice)'),
    supabase.from('results').select('matchday_id, team_id, total_score, goals_scored, goals_conceded, points'),
  ])

  const settings = parseSettings((league as unknown as { settings: unknown } | null)?.settings)

  // ── Costruisci lineupsByMatchdayTeam ─────────────────────────────────────────
  type LineupPlayer = {
    player_id: string; name: string; role: string; codice: string | null
    is_starter: boolean; bench_order: number; asterisco: boolean
  }
  type LineupData = { formation: string; players: LineupPlayer[] }
  type LPRow = {
    lineup_id: string; player_id: string; is_starter: boolean
    bench_order: number; asterisco: boolean
    players: { id: string; name: string; role: string; codice: string | null }
  }

  const lpByLineupId = ((allLineupPlayers as unknown as LPRow[]) ?? []).reduce<Record<string, LPRow[]>>(
    (acc, lp) => { if (!acc[lp.lineup_id]) acc[lp.lineup_id] = []; acc[lp.lineup_id].push(lp); return acc }, {}
  )

  type LineupRow = { id: string; team_id: string; matchday_id: string; formation: string }
  const lineupsByMatchdayTeam: Record<string, Record<string, LineupData>> = {}
  for (const lineup of (allLineups as unknown as LineupRow[]) ?? []) {
    if (!lineupsByMatchdayTeam[lineup.matchday_id])
      lineupsByMatchdayTeam[lineup.matchday_id] = {}
    const lps = lpByLineupId[lineup.id] ?? []
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

  // ── Risultati per giornata ────────────────────────────────────────────────────
  type ResultRow = { matchday_id: string; team_id: string; total_score: number; goals_scored: number; goals_conceded: number; points: number }
  const resultsByMatchday = ((allResults as unknown as ResultRow[]) ?? []).reduce<Record<string, ResultRow[]>>(
    (acc, r) => { if (!acc[r.matchday_id]) acc[r.matchday_id] = []; acc[r.matchday_id].push(r); return acc }, {}
  )

  return (
    <GiornateClient
      league={league ? { id: league.id, name: league.name } : null}
      initialMatchdays={matchdays || []}
      teams={teams || []}
      initialFixtures={fixtures || []}
      votiArchivio={(votiArchivio || []) as { id: string; stagione: string; giornata: number; filename: string | null }[]}
      settings={settings}
      lineupsByMatchdayTeam={lineupsByMatchdayTeam}
      resultsByMatchday={resultsByMatchday}
    />
  )
}
