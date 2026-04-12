import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'In arrivo',
  open: 'Aperta',
  closed: 'Chiusa',
  completed: 'Completata',
}

const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-gray-100 text-gray-500',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  completed: 'bg-blue-100 text-blue-700',
}

export default async function CalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myTeam } = await supabase
    .from('teams')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  // Tutte le giornate
  const { data: matchdays } = await supabase
    .from('matchdays')
    .select('*')
    .order('number', { ascending: true })

  // Risultati per ogni giornata
  type ResultRow = {
    team_id: string
    total_score: number
    goals_scored: number
    goals_conceded: number
    points: number
    teams: { id: string; name: string }
  }
  type MatchdayResult = { matchday_id: string } & ResultRow

  const { data: allResults } = await supabase
    .from('results')
    .select('matchday_id, team_id, total_score, goals_scored, goals_conceded, points, teams(id, name)')

  // Sfide per ogni giornata
  type FixtureRow = {
    matchday_id: string
    home_team_id: string
    away_team_id: string
    home_team: { id: string; name: string }
    away_team: { id: string; name: string }
  }

  const { data: allFixtures } = await supabase
    .from('fixtures')
    .select('matchday_id, home_team_id, away_team_id, home_team:teams!fixtures_home_team_id_fkey(id, name), away_team:teams!fixtures_away_team_id_fkey(id, name)')

  const resultsByMatchday = ((allResults as unknown as MatchdayResult[]) || []).reduce<
    Record<string, MatchdayResult[]>
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-700 text-white px-4 pt-12 pb-6">
        <h1 className="text-xl font-bold">Calendario</h1>
        <p className="text-green-200 text-sm mt-0.5">
          {(matchdays || []).length} giornate
        </p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {(!matchdays || matchdays.length === 0) && (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">
              Nessuna giornata ancora. L'admin deve creare il calendario.
            </p>
          </div>
        )}

        {(matchdays || []).map((matchday) => {
          const fixtures = fixturesByMatchday[matchday.id] || []
          const results = resultsByMatchday[matchday.id] || []
          const hasResults = results.some((r) => r.total_score > 0)

          return (
            <div
              key={matchday.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              {/* Header giornata */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-800">
                    Giornata {matchday.number}
                  </h2>
                  {matchday.deadline && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Scadenza:{' '}
                      {new Date(matchday.deadline).toLocaleDateString('it-IT', {
                        day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'Europe/Rome',
                      })}
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  STATUS_COLORS[matchday.status] || 'bg-gray-100 text-gray-500'
                }`}>
                  {STATUS_LABELS[matchday.status] || matchday.status}
                </span>
              </div>

              {/* Sfide e risultati */}
              {fixtures.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {fixtures.map((fixture) => {
                    const homeResult = results.find((r) => r.team_id === fixture.home_team_id)
                    const awayResult = results.find((r) => r.team_id === fixture.away_team_id)
                    const isMyMatch =
                      myTeam &&
                      (fixture.home_team_id === myTeam.id || fixture.away_team_id === myTeam.id)

                    return (
                      <div
                        key={fixture.home_team_id + fixture.away_team_id}
                        className={`px-4 py-3 ${isMyMatch ? 'bg-green-50' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          {/* Casa */}
                          <div className="flex-1 text-right">
                            <p className={`text-sm font-semibold truncate ${
                              isMyMatch && fixture.home_team_id === myTeam?.id
                                ? 'text-green-700'
                                : 'text-gray-800'
                            }`}>
                              {fixture.home_team?.name || '—'}
                            </p>
                            {hasResults && homeResult && (
                              <p className="text-xs text-gray-400">
                                {homeResult.total_score.toFixed(1)} pt
                              </p>
                            )}
                          </div>

                          {/* Risultato o VS */}
                          <div className="shrink-0 w-16 text-center">
                            {hasResults && homeResult && awayResult ? (
                              <div>
                                <p className="text-sm font-black text-gray-800">
                                  {homeResult.goals_scored} – {awayResult.goals_scored}
                                </p>
                                <p className="text-xs text-gray-400">fantaG</p>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                VS
                              </span>
                            )}
                          </div>

                          {/* Ospite */}
                          <div className="flex-1 text-left">
                            <p className={`text-sm font-semibold truncate ${
                              isMyMatch && fixture.away_team_id === myTeam?.id
                                ? 'text-green-700'
                                : 'text-gray-800'
                            }`}>
                              {fixture.away_team?.name || '—'}
                            </p>
                            {hasResults && awayResult && (
                              <p className="text-xs text-gray-400">
                                {awayResult.total_score.toFixed(1)} pt
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 px-4 py-3 text-center">
                  Nessuna sfida programmata
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
