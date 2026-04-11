import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LineupForm from './LineupForm'

const ROLE_LABELS: Record<string, string> = {
  P: 'Portieri',
  D: 'Difensori',
  C: 'Centrocampisti',
  A: 'Attaccanti',
}

const ROLE_ORDER = ['P', 'D', 'C', 'A']

export default async function SquadraPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Squadra dell'utente
  const { data: myTeam } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!myTeam) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-green-700 text-white px-4 pt-12 pb-6">
          <h1 className="text-xl font-bold">La mia squadra</h1>
        </div>
        <div className="px-4 py-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-amber-800 text-sm">
              Nessuna squadra assegnata. Attendi che l'admin ti assegni una squadra.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Rosa della squadra
  const { data: roster } = await supabase
    .from('rosters')
    .select('*, players(id, name, role, serie_a_team)')
    .eq('team_id', myTeam.id)
    .order('created_at', { ascending: true })

  // Prossima giornata aperta
  const { data: openMatchday } = await supabase
    .from('matchdays')
    .select('*')
    .eq('status', 'open')
    .order('number', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Formazione già inviata (se esiste)
  type ExistingLineup = {
    id: string
    formation: string | null
    created_at: string | null
    updated_at: string | null
  }
  type LineupPlayerFull = {
    player_id: string
    is_starter: boolean
    bench_order: number
    players: { role: string }
  }

  let existingLineup: ExistingLineup | null = null
  let existingLineupPlayers: string[] = []
  let existingBenchByRole: Record<string, string[]> = { P: [], D: [], C: [], A: [] }
  let existingFormation = '4-3-3'

  if (openMatchday) {
    // Step 1: esistenza con solo 'id' — stesso approccio della home che funziona
    const { data: lineupBasic } = await supabase
      .from('lineups')
      .select('id')
      .eq('team_id', myTeam.id)
      .eq('matchday_id', openMatchday.id)
      .maybeSingle()

    if (lineupBasic) {
      existingLineup = { id: lineupBasic.id, formation: null, created_at: null, updated_at: null }

      // Step 2: colonne opzionali (formation, updated_at) — ignora se non esistono
      const { data: lineupExtra } = await supabase
        .from('lineups')
        .select('formation, updated_at')
        .eq('id', lineupBasic.id)
        .single()
      if (lineupExtra) {
        const le = lineupExtra as unknown as { formation: string | null; updated_at: string | null }
        existingFormation = le.formation || '4-3-3'
        existingLineup = { ...existingLineup, formation: le.formation, updated_at: le.updated_at }
      }

      // Step 3: giocatori con bench_order, fallback senza
      const { data: lpWithOrder, error: lpErr } = await supabase
        .from('lineup_players')
        .select('player_id, is_starter, bench_order, players(role)')
        .eq('lineup_id', lineupBasic.id)

      const lps: LineupPlayerFull[] = lpErr
        ? []
        : (lpWithOrder as unknown as LineupPlayerFull[]) || []

      if (lpErr) {
        // Fallback senza bench_order
        const { data: lpBasic } = await supabase
          .from('lineup_players')
          .select('player_id, is_starter, players(role)')
          .eq('lineup_id', lineupBasic.id)
        const lpb = (lpBasic as unknown as LineupPlayerFull[]) || []
        existingLineupPlayers = lpb.filter((lp) => lp.is_starter).map((lp) => lp.player_id)
      } else {
        existingLineupPlayers = lps.filter((lp) => lp.is_starter).map((lp) => lp.player_id)
        const benchSorted = lps.filter((lp) => !lp.is_starter).sort((a, b) => a.bench_order - b.bench_order)
        for (const lp of benchSorted) {
          const role = lp.players?.role
          if (role && existingBenchByRole[role] !== undefined) existingBenchByRole[role].push(lp.player_id)
        }
      }
    }
  }

  // Raggruppa per ruolo
  type RosterEntry = {
    players: { id: string; name: string; role: string; serie_a_team: string }
    purchase_price: number
  }

  const rosterByRole: Record<string, RosterEntry[]> = {}
  for (const role of ROLE_ORDER) {
    rosterByRole[role] = ((roster as RosterEntry[]) || []).filter(
      (r) => r.players.role === role
    )
  }

  const isDeadlinePassed =
    openMatchday?.deadline
      ? new Date(openMatchday.deadline) < new Date()
      : false

  // Storico ultime 5 giornate completate
  const { data: completedMatchdays } = await supabase
    .from('matchdays')
    .select('id, number')
    .eq('status', 'completed')
    .order('number', { ascending: false })
    .limit(5)

  type PastLineupPlayer = { player_id: string; is_starter: boolean; players: { name: string; role: string } }
  type PastLineup = { id: string; matchday_id: string; lineup_players: PastLineupPlayer[] }
  type PastRating = { matchday_id: string; player_id: string; rating: number | null; goals: number; assists: number; yellow_card: boolean; red_card: boolean }
  type PastResult = { matchday_id: string; total_score: number; goals_scored: number; goals_conceded: number; points: number }

  let pastLineups: PastLineup[] = []
  let pastRatings: PastRating[] = []
  let pastResults: PastResult[] = []

  if (completedMatchdays && completedMatchdays.length > 0) {
    const matchdayIds = completedMatchdays.map((m) => m.id)

    const [{ data: lData }, { data: rData }, { data: resData }] = await Promise.all([
      supabase
        .from('lineups')
        .select('id, matchday_id, lineup_players(player_id, is_starter, players(name, role))')
        .eq('team_id', myTeam.id)
        .in('matchday_id', matchdayIds),
      supabase
        .from('ratings')
        .select('matchday_id, player_id, rating, goals, assists, yellow_card, red_card')
        .in('matchday_id', matchdayIds),
      supabase
        .from('results')
        .select('matchday_id, total_score, goals_scored, goals_conceded, points')
        .eq('team_id', myTeam.id)
        .in('matchday_id', matchdayIds),
    ])

    pastLineups = (lData as unknown as PastLineup[]) || []
    pastRatings = (rData as PastRating[]) || []
    pastResults = (resData as PastResult[]) || []
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 pt-12 pb-6">
        <h1 className="text-xl font-bold">{myTeam.name}</h1>
        <p className="text-green-200 text-sm mt-0.5">
          {(roster || []).length} giocatori in rosa
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Banner giornata aperta */}
        {openMatchday && !isDeadlinePassed && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <p className="text-green-800 font-semibold text-sm">
              Giornata {openMatchday.number} — Invia la formazione
            </p>
            {openMatchday.deadline && (
              <p className="text-green-600 text-xs mt-1">
                Scadenza:{' '}
                {new Date(openMatchday.deadline).toLocaleDateString('it-IT', {
                  weekday: 'long', day: 'numeric', month: 'long',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        )}

        {openMatchday && isDeadlinePassed && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-red-700 text-sm font-medium">
              Scadenza superata — non puoi più modificare la formazione.
            </p>
          </div>
        )}

        {/* Link a formazione esistente */}
        {openMatchday && existingLineup && (
          <Link
            href="/squadra/formazione"
            className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="font-semibold text-gray-800 text-sm">
                Formazione G{openMatchday.number} inviata
              </p>
              {existingLineup.updated_at ? (
                <p className="text-xs text-gray-400 mt-0.5">
                  Modificata: {new Date(existingLineup.updated_at).toLocaleString('it-IT', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              ) : existingLineup.created_at ? (
                <p className="text-xs text-gray-400 mt-0.5">
                  Inviata: {new Date(existingLineup.created_at).toLocaleString('it-IT', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              ) : null}
            </div>
            <span className="text-green-600 font-bold text-sm">Vedi ›</span>
          </Link>
        )}

        {/* Formazione interattiva */}
        {openMatchday && !isDeadlinePassed && (
          <LineupForm
            teamId={myTeam.id}
            matchdayId={openMatchday.id}
            matchdayNumber={openMatchday.number}
            roster={(roster as RosterEntry[]) || []}
            existingLineupId={existingLineup?.id ?? null}
            existingFormation={existingFormation}
            existingStarters={existingLineupPlayers}
            existingBenchByRole={existingBenchByRole}
            lineupCreatedAt={existingLineup?.created_at ?? null}
            lineupUpdatedAt={existingLineup?.updated_at ?? null}
          />
        )}

        {/* Rosa per ruolo */}
        {ROLE_ORDER.map((role) => (
          <div key={role} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-700 text-sm">{ROLE_LABELS[role]}</h2>
              <span className="text-xs text-gray-400 font-medium">
                {rosterByRole[role].length}
              </span>
            </div>
            {rosterByRole[role].length === 0 ? (
              <p className="text-gray-400 text-sm px-4 py-3">Nessun giocatore</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {rosterByRole[role].map((entry) => (
                  <div key={entry.players.id} className="px-4 py-3 flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      role === 'P' ? 'bg-yellow-100 text-yellow-700' :
                      role === 'D' ? 'bg-blue-100 text-blue-700' :
                      role === 'C' ? 'bg-green-100 text-green-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {role}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {entry.players.name}
                      </p>
                      <p className="text-xs text-gray-400">{entry.players.serie_a_team}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {entry.purchase_price}M
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {/* Storico giornate */}
        {completedMatchdays && completedMatchdays.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">
              Storico giornate
            </h2>
            <div className="space-y-3">
              {completedMatchdays.map((md) => {
                const lineup = pastLineups.find((l) => l.matchday_id === md.id)
                const result = pastResults.find((r) => r.matchday_id === md.id)
                const starters = lineup?.lineup_players.filter((lp) => lp.is_starter) || []
                const ratingMap: Record<string, PastRating> = {}
                for (const r of pastRatings.filter((r) => r.matchday_id === md.id)) {
                  ratingMap[r.player_id] = r
                }
                const points = result?.points
                const pointsBadge =
                  points === 3 ? 'bg-green-100 text-green-700' :
                  points === 1 ? 'bg-yellow-100 text-yellow-700' :
                  points === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'

                return (
                  <div key={md.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Header giornata */}
                    <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                      <span className="font-bold text-gray-800">Giornata {md.number}</span>
                      {result ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-500">
                            {result.total_score.toFixed(1)} pt
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-600 font-medium">
                            {result.goals_scored}–{result.goals_conceded}
                          </span>
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${pointsBadge}`}>
                            {points === 3 ? 'V' : points === 1 ? 'P' : 'S'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Nessun risultato</span>
                      )}
                    </div>

                    {/* Titolari */}
                    {starters.length === 0 ? (
                      <p className="text-xs text-gray-400 px-4 py-3 text-center">
                        Nessuna formazione inviata
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {['P', 'D', 'C', 'A'].map((role) =>
                          starters
                            .filter((lp) => lp.players.role === role)
                            .map((lp) => {
                              const r = ratingMap[lp.player_id]
                              return (
                                <div key={lp.player_id} className="px-4 py-2 flex items-center gap-2">
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                    role === 'P' ? 'bg-yellow-100 text-yellow-700' :
                                    role === 'D' ? 'bg-blue-100 text-blue-700' :
                                    role === 'C' ? 'bg-green-100 text-green-700' :
                                    'bg-red-100 text-red-700'
                                  }`}>
                                    {role}
                                  </span>
                                  <span className="text-sm text-gray-700 flex-1 truncate">
                                    {lp.players.name}
                                  </span>
                                  {r?.rating ? (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-sm font-bold text-gray-800">
                                        {r.rating}
                                      </span>
                                      {r.goals > 0 && (
                                        <span className="text-xs text-green-600 font-bold">
                                          +{r.goals}G
                                        </span>
                                      )}
                                      {r.assists > 0 && (
                                        <span className="text-xs text-blue-500 font-bold">
                                          +{r.assists}A
                                        </span>
                                      )}
                                      {r.yellow_card && (
                                        <span className="text-xs bg-yellow-300 text-yellow-800 px-1 rounded font-bold">
                                          G
                                        </span>
                                      )}
                                      {r.red_card && (
                                        <span className="text-xs bg-red-500 text-white px-1 rounded font-bold">
                                          R
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-300 shrink-0">—</span>
                                  )}
                                </div>
                              )
                            })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
