import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Profilo utente
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Lega (ce ne sarà una sola)
  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .single()

  // Squadra dell'utente
  const { data: myTeam } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  // Prossima giornata aperta o in arrivo
  const { data: nextMatchday } = await supabase
    .from('matchdays')
    .select('*')
    .in('status', ['open', 'upcoming'])
    .order('number', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Classifica: tutte le squadre con i loro risultati
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, results(points, goals_scored, goals_conceded)')

  type TeamResult = { points: number; goals_scored: number; goals_conceded: number }
  type TeamData = { id: string; name: string; results: TeamResult[] }

  const standings = ((teamsData as TeamData[]) || [])
    .map((team) => ({
      ...team,
      totalPoints: team.results.reduce((s, r) => s + r.points, 0),
      totalGoals: team.results.reduce((s, r) => s + r.goals_scored, 0),
      matchesPlayed: team.results.length,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints || b.totalGoals - a.totalGoals)

  // Controllo se la formazione è già stata inviata per la prossima giornata
  let hasSubmittedLineup = false
  if (nextMatchday && myTeam) {
    const { data: lineup } = await supabase
      .from('lineups')
      .select('id')
      .eq('team_id', myTeam.id)
      .eq('matchday_id', nextMatchday.id)
      .maybeSingle()
    hasSubmittedLineup = !!lineup
  }

  const myPosition = myTeam
    ? standings.findIndex((t) => t.id === myTeam.id) + 1
    : null

  // Ultima giornata completata: risultato + avversario
  type LastResultData = {
    matchday: { id: string; number: number } | null
    myScore: number | null
    oppScore: number | null
    myGoals: number | null
    oppGoals: number | null
    points: number | null
    opponentName: string | null
  }
  let lastResultData: LastResultData = {
    matchday: null, myScore: null, oppScore: null,
    myGoals: null, oppGoals: null, points: null, opponentName: null,
  }

  if (myTeam) {
    const { data: lastMd } = await supabase
      .from('matchdays')
      .select('id, number')
      .eq('status', 'completed')
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastMd) {
      const [{ data: myRes }, { data: fix }] = await Promise.all([
        supabase.from('results')
          .select('total_score, goals_scored, goals_conceded, points')
          .eq('team_id', myTeam.id).eq('matchday_id', lastMd.id).maybeSingle(),
        supabase.from('fixtures')
          .select('home_team_id, away_team_id')
          .eq('matchday_id', lastMd.id)
          .or(`home_team_id.eq.${myTeam.id},away_team_id.eq.${myTeam.id}`)
          .maybeSingle(),
      ])

      if (myRes && fix) {
        const oppId = fix.home_team_id === myTeam.id ? fix.away_team_id : fix.home_team_id
        const { data: oppRes } = await supabase.from('results')
          .select('total_score, goals_scored, goals_conceded')
          .eq('team_id', oppId).eq('matchday_id', lastMd.id).maybeSingle()
        const oppTeam = standings.find((t) => t.id === oppId)
        lastResultData = {
          matchday: lastMd,
          myScore: myRes.total_score,
          oppScore: oppRes?.total_score ?? null,
          myGoals: myRes.goals_scored,
          oppGoals: myRes.goals_conceded,
          points: myRes.points,
          opponentName: oppTeam?.name ?? null,
        }
      }
    }
  }

  // Prossimo avversario
  let nextOpponentName: string | null = null
  if (nextMatchday && myTeam) {
    const { data: nextFix } = await supabase
      .from('fixtures')
      .select('home_team_id, away_team_id')
      .eq('matchday_id', nextMatchday.id)
      .or(`home_team_id.eq.${myTeam.id},away_team_id.eq.${myTeam.id}`)
      .maybeSingle()
    if (nextFix) {
      const oppId = nextFix.home_team_id === myTeam.id ? nextFix.away_team_id : nextFix.home_team_id
      nextOpponentName = standings.find((t) => t.id === oppId)?.name ?? null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header verde */}
      <div className="bg-green-700 text-white px-4 pt-12 pb-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-green-300 text-sm">Benvenuto,</p>
            <h1 className="text-xl font-bold mt-0.5">
              {profile?.display_name || user.email?.split('@')[0]}
            </h1>
            <p className="text-green-200 text-sm mt-1">
              {league?.name || 'La tua lega'}
            </p>
          </div>
          <span className="text-4xl">⚽</span>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4 pb-4">

        {/* Card squadra */}
        {myTeam ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">La mia squadra</p>
                <p className="text-lg font-bold text-gray-800 mt-0.5">{myTeam.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Posizione</p>
                <p className="text-2xl font-black text-green-600">{myPosition}°</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-amber-800 text-sm">
              Nessuna squadra assegnata. Attendi che l'admin ti assegni una squadra.
            </p>
          </div>
        )}

        {/* Card ultimo risultato */}
        {lastResultData.matchday && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">
              Ultimo risultato — G{lastResultData.matchday.number}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-bold text-gray-800 truncate">{myTeam?.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{lastResultData.myScore?.toFixed(1)} pt</p>
              </div>
              <div className="text-center px-4">
                <p className="text-2xl font-black text-gray-800">
                  {lastResultData.myGoals}–{lastResultData.oppGoals}
                </p>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                  lastResultData.points === 3 ? 'bg-green-100 text-green-700' :
                  lastResultData.points === 1 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {lastResultData.points === 3 ? 'VITTORIA' : lastResultData.points === 1 ? 'PAREGGIO' : 'SCONFITTA'}
                </span>
              </div>
              <div className="flex-1 text-right">
                <p className="font-bold text-gray-800 truncate">{lastResultData.opponentName}</p>
                <p className="text-xs text-gray-400 mt-0.5">{lastResultData.oppScore?.toFixed(1)} pt</p>
              </div>
            </div>
          </div>
        )}

        {/* Card prossima giornata */}
        {nextMatchday ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Prossima giornata</p>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                nextMatchday.status === 'open'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {nextMatchday.status === 'open' ? 'APERTA' : 'IN ARRIVO'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-black text-gray-800">
                G{nextMatchday.number}
              </p>
              {nextOpponentName && (
                <div className="text-right">
                  <p className="text-xs text-gray-400">Avversario</p>
                  <p className="text-sm font-bold text-gray-700">{nextOpponentName}</p>
                </div>
              )}
            </div>
            {nextMatchday.deadline && (
              <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                <span>⏰</span>
                {new Date(nextMatchday.deadline).toLocaleDateString('it-IT', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            {nextMatchday.status === 'open' && myTeam && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                {hasSubmittedLineup ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-600">
                      <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-xs">✓</span>
                      <span className="text-sm font-semibold">Formazione inviata</span>
                    </div>
                    <Link href="/squadra" className="text-xs text-green-600 underline font-medium">
                      Modifica
                    </Link>
                  </div>
                ) : (
                  <Link
                    href="/squadra"
                    className="block w-full text-center bg-green-600 text-white font-semibold py-3 rounded-xl text-sm"
                  >
                    Invia la formazione →
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm text-center py-2">
              Nessuna giornata attiva al momento
            </p>
          </div>
        )}

        {/* Mini classifica */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Classifica</p>
            <Link href="/classifica" className="text-xs text-green-600 font-semibold">
              Vedi tutto →
            </Link>
          </div>
          {standings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">
              Nessun risultato ancora
            </p>
          ) : (
            <div className="space-y-2.5">
              {standings.slice(0, 5).map((team, i) => (
                <div key={team.id} className="flex items-center gap-3">
                  <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-gray-100 text-gray-500' :
                    i === 2 ? 'bg-orange-50 text-orange-600' :
                    'text-gray-400'
                  }`}>
                    {i + 1}
                  </span>
                  <span className={`flex-1 text-sm truncate ${
                    team.id === myTeam?.id
                      ? 'font-bold text-green-700'
                      : 'text-gray-700'
                  }`}>
                    {team.name}
                    {team.id === myTeam?.id && ' ★'}
                  </span>
                  <span className="text-sm font-bold text-gray-800 shrink-0">
                    {team.totalPoints} pt
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logout */}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full text-center text-sm text-gray-400 py-2 hover:text-gray-600 transition-colors"
          >
            Esci dall'account
          </button>
        </form>
      </div>
    </div>
  )
}
