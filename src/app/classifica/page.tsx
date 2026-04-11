import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ClassificaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myTeam } = await supabase
    .from('teams')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  // Tutte le squadre con i risultati
  type ResultRow = {
    points: number
    goals_scored: number
    goals_conceded: number
    total_score: number
  }
  type TeamRow = {
    id: string
    name: string
    profiles: { display_name: string | null; email: string } | null
    results: ResultRow[]
  }

  const { data: teamsData } = await supabase
    .from('teams')
    .select(`
      id, name,
      profiles(display_name, email),
      results(points, goals_scored, goals_conceded, total_score)
    `)

  const standings = ((teamsData as unknown as TeamRow[]) || [])
    .map((team) => {
      const results = team.results || []
      const wins = results.filter((r) => r.points === 3).length
      const draws = results.filter((r) => r.points === 1).length
      const losses = results.filter((r) => r.points === 0 && r.total_score > 0).length
      return {
        id: team.id,
        name: team.name,
        owner: team.profiles?.display_name || team.profiles?.email?.split('@')[0] || '—',
        matchesPlayed: results.filter((r) => r.total_score > 0).length,
        wins,
        draws,
        losses,
        totalPoints: results.reduce((s, r) => s + r.points, 0),
        goalsScored: results.reduce((s, r) => s + r.goals_scored, 0),
        goalsConceded: results.reduce((s, r) => s + r.goals_conceded, 0),
        avgScore:
          results.length > 0
            ? results.reduce((s, r) => s + r.total_score, 0) / results.length
            : 0,
      }
    })
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
      if (b.goalsScored - b.goalsConceded !== a.goalsScored - a.goalsConceded)
        return (b.goalsScored - b.goalsConceded) - (a.goalsScored - a.goalsConceded)
      return b.goalsScored - a.goalsScored
    })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 pt-12 pb-6">
        <h1 className="text-xl font-bold">Classifica</h1>
        <p className="text-green-200 text-sm mt-0.5">
          {standings.length} squadre
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Podio top 3 */}
        {standings.length >= 3 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-end justify-center gap-3">
              {/* 2° posto */}
              <div className="flex flex-col items-center flex-1">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl mb-1">
                  🥈
                </div>
                <div className="h-12 w-full bg-gray-100 rounded-t-lg flex items-center justify-center">
                  <span className="font-bold text-gray-600 text-lg">2°</span>
                </div>
                <p className="text-xs font-semibold text-gray-600 mt-1 text-center truncate w-full">
                  {standings[1].name}
                </p>
                <p className="text-xs text-gray-400">{standings[1].totalPoints} pt</p>
              </div>
              {/* 1° posto */}
              <div className="flex flex-col items-center flex-1">
                <div className="w-14 h-14 rounded-full bg-yellow-50 flex items-center justify-center text-3xl mb-1">
                  🥇
                </div>
                <div className="h-20 w-full bg-yellow-100 rounded-t-lg flex items-center justify-center">
                  <span className="font-black text-yellow-700 text-xl">1°</span>
                </div>
                <p className="text-xs font-bold text-yellow-700 mt-1 text-center truncate w-full">
                  {standings[0].name}
                </p>
                <p className="text-xs text-yellow-600 font-semibold">{standings[0].totalPoints} pt</p>
              </div>
              {/* 3° posto */}
              <div className="flex flex-col items-center flex-1">
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-2xl mb-1">
                  🥉
                </div>
                <div className="h-8 w-full bg-orange-50 rounded-t-lg flex items-center justify-center">
                  <span className="font-bold text-orange-600 text-lg">3°</span>
                </div>
                <p className="text-xs font-semibold text-orange-600 mt-1 text-center truncate w-full">
                  {standings[2].name}
                </p>
                <p className="text-xs text-orange-400">{standings[2].totalPoints} pt</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabella completa */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="grid grid-cols-12 text-xs font-bold text-gray-500 uppercase tracking-wide">
              <span className="col-span-1">#</span>
              <span className="col-span-4">Squadra</span>
              <span className="col-span-1 text-center">G</span>
              <span className="col-span-1 text-center">V</span>
              <span className="col-span-1 text-center">P</span>
              <span className="col-span-1 text-center">S</span>
              <span className="col-span-1 text-center">GF</span>
              <span className="col-span-1 text-center">GS</span>
              <span className="col-span-2 text-center font-black text-green-700">PT</span>
            </div>
          </div>

          {standings.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">
              Nessun risultato ancora. La classifica apparirà dopo la prima giornata.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {standings.map((team, i) => {
                const isMe = team.id === myTeam?.id
                return (
                  <div
                    key={team.id}
                    className={`px-4 py-3 grid grid-cols-12 items-center text-sm ${
                      isMe ? 'bg-green-50' : ''
                    }`}
                  >
                    <span className={`col-span-1 font-bold text-sm ${
                      i === 0 ? 'text-yellow-600' :
                      i === 1 ? 'text-gray-500' :
                      i === 2 ? 'text-orange-500' :
                      'text-gray-400'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="col-span-4 min-w-0 pr-1">
                      <p className={`font-semibold truncate text-sm ${isMe ? 'text-green-700' : 'text-gray-800'}`}>
                        {team.name}{isMe && ' ★'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{team.owner}</p>
                    </div>
                    <span className="col-span-1 text-center text-xs text-gray-500">{team.matchesPlayed}</span>
                    <span className="col-span-1 text-center text-xs text-green-600 font-medium">{team.wins}</span>
                    <span className="col-span-1 text-center text-xs text-gray-400">{team.draws}</span>
                    <span className="col-span-1 text-center text-xs text-red-400">{team.losses}</span>
                    <span className="col-span-1 text-center text-xs text-gray-500">{team.goalsScored}</span>
                    <span className="col-span-1 text-center text-xs text-gray-500">{team.goalsConceded}</span>
                    <span className={`col-span-2 text-center font-black text-sm ${isMe ? 'text-green-700' : 'text-gray-800'}`}>
                      {team.totalPoints}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Legenda */}
        <p className="text-xs text-gray-400 text-center pb-2">
          G = Giocate · V = Vinte · P = Pareggiate · S = Perse · GF/GS = Gol Fatti/Subiti · PT = Punti
        </p>
      </div>
    </div>
  )
}
