import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FormazioneClient from './FormazioneClient'

type Player = { id: string; name: string; role: string; serie_a_team: string }
type LineupPlayerRaw = {
  player_id: string
  is_starter: boolean
  bench_order: number
  players: Player
}
type ChangeEntry = { id: string; changed_at: string; change_type: string; description: string }

export default async function FormazionePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myTeam } = await supabase
    .from('teams')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()

  if (!myTeam) redirect('/squadra')

  const { data: openMatchday } = await supabase
    .from('matchdays')
    .select('*')
    .eq('status', 'open')
    .order('number', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!openMatchday) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-green-700 text-white px-4 pt-12 pb-6 flex items-center gap-3">
          <Link href="/squadra" className="text-green-200 text-2xl font-light leading-none">‹</Link>
          <h1 className="text-xl font-bold">Formazione</h1>
        </div>
        <div className="px-4 py-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-amber-800 text-sm">Nessuna giornata aperta al momento.</p>
          </div>
        </div>
      </div>
    )
  }

  // Step 1: verifica esistenza — solo 'id' come la home page (garantito sempre presente)
  const { data: lineupBasic } = await supabase
    .from('lineups')
    .select('id')
    .eq('team_id', myTeam.id)
    .eq('matchday_id', openMatchday.id)
    .maybeSingle()

  if (!lineupBasic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-green-700 text-white px-4 pt-12 pb-6 flex items-center gap-3">
          <Link href="/squadra" className="text-green-200 text-2xl font-light leading-none">‹</Link>
          <h1 className="text-xl font-bold">Formazione G{openMatchday.number}</h1>
        </div>
        <div className="px-4 py-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-amber-800 text-sm">Non hai ancora inviato la formazione per la giornata {openMatchday.number}.</p>
            <Link
              href="/squadra"
              className="mt-3 block text-center bg-green-600 text-white py-2.5 rounded-xl font-semibold text-sm"
            >
              Torna alla squadra per inviarla
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: carica dettagli completi con bench_order (se la colonna esiste)
  // Se fallisce (colonne DB non ancora migrate), usa query di fallback
  let lineupPlayers: LineupPlayerRaw[] = []
  let lineupUpdatedAt: string | null = null

  const { data: lineupFull, error: fullErr } = await supabase
    .from('lineups')
    .select('updated_at, lineup_players(player_id, is_starter, bench_order, players(id, name, role, serie_a_team))')
    .eq('id', lineupBasic.id)
    .single()

  if (!fullErr && lineupFull) {
    lineupPlayers = (lineupFull.lineup_players as unknown as LineupPlayerRaw[]) || []
    lineupUpdatedAt = (lineupFull as unknown as { updated_at: string | null }).updated_at ?? null
  } else {
    // Fallback senza bench_order / updated_at
    const { data: lineupFallback } = await supabase
      .from('lineups')
      .select('lineup_players(player_id, is_starter, players(id, name, role, serie_a_team))')
      .eq('id', lineupBasic.id)
      .single()
    lineupPlayers = ((lineupFallback?.lineup_players as unknown as LineupPlayerRaw[]) || [])
      .map((lp, i) => ({ ...lp, bench_order: i }))
  }

  // Recupera colonne opzionali (formation, created_at, updated_at) in query separata
  let lineupFormation = '4-3-3'
  let lineupCreatedAt: string | null = null

  const { data: lineupMeta } = await supabase
    .from('lineups')
    .select('formation, created_at, updated_at')
    .eq('id', lineupBasic.id)
    .single()
  if (lineupMeta) {
    const lm = lineupMeta as unknown as { formation: string | null; created_at: string | null; updated_at: string | null }
    lineupFormation = lm.formation || '4-3-3'
    lineupCreatedAt = lm.created_at ?? null
    lineupUpdatedAt = lm.updated_at ?? null
  }

  const lineup = {
    id: lineupBasic.id,
    formation: lineupFormation,
    created_at: lineupCreatedAt,
    updated_at: lineupUpdatedAt,
  }

  // Change log
  const { data: changesRaw } = await supabase
    .from('lineup_changes')
    .select('id, changed_at, change_type, description')
    .eq('lineup_id', lineup.id)
    .order('changed_at', { ascending: true })

  // Full roster (for swap options)
  const { data: roster } = await supabase
    .from('rosters')
    .select('players(id, name, role, serie_a_team)')
    .eq('team_id', myTeam.id)

  const allRosterPlayers = (roster || []).map((r) => r.players as unknown as Player)

  return (
    <FormazioneClient
      lineupId={lineup.id}
      teamName={myTeam.name}
      matchdayNumber={openMatchday.number}
      deadline={openMatchday.deadline ?? null}
      formation={lineup.formation}
      lineupPlayers={lineupPlayers}
      allRosterPlayers={allRosterPlayers}
      changes={(changesRaw || []) as ChangeEntry[]}
      lineupCreatedAt={lineup.created_at ?? null}
      lineupUpdatedAt={lineup.updated_at ?? null}
    />
  )
}
