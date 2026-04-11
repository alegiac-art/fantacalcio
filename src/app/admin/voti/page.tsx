import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { parseSettings } from '@/lib/settings'
import VotiClient from './VotiClient'

export default async function VotiPage({
  searchParams,
}: {
  searchParams: Promise<{ giornata?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const params = await searchParams

  // Tutte le giornate chiuse o completate
  const { data: matchdays } = await supabase
    .from('matchdays')
    .select('*')
    .in('status', ['closed', 'completed'])
    .order('number', { ascending: true })

  // Giornata selezionata (default: ultima chiusa)
  const selectedId =
    params.giornata ||
    (matchdays && matchdays.length > 0 ? matchdays[matchdays.length - 1].id : null)

  const selectedMatchday = matchdays?.find((m) => m.id === selectedId) || null

  // Giocatori coinvolti nelle formazioni di questa giornata
  let players: { id: string; name: string; role: string; serie_a_team: string }[] = []
  let existingRatings: Record<string, {
    rating: number | null; goals: number; assists: number;
    yellow_card: boolean; red_card: boolean; own_goals: number
  }> = {}

  if (selectedMatchday) {
    // Prendi tutti i giocatori nelle formazioni di questa giornata
    const { data: lineupPlayers } = await supabase
      .from('lineup_players')
      .select('player_id, players(id, name, role, serie_a_team), lineups!inner(matchday_id)')
      .eq('lineups.matchday_id', selectedMatchday.id)

    type LP = {
      player_id: string
      players: { id: string; name: string; role: string; serie_a_team: string }
    }

    const seen = new Set<string>()
    for (const lp of (lineupPlayers as unknown as LP[]) || []) {
      if (!seen.has(lp.player_id)) {
        seen.add(lp.player_id)
        players.push(lp.players)
      }
    }
    // Ordina: P, D, C, A poi per nome
    const roleOrder = ['P', 'D', 'C', 'A']
    players.sort((a, b) =>
      roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.name.localeCompare(b.name)
    )

    // Voti già inseriti
    const { data: ratings } = await supabase
      .from('ratings')
      .select('*')
      .eq('matchday_id', selectedMatchday.id)

    for (const r of ratings || []) {
      existingRatings[r.player_id] = {
        rating: r.rating,
        goals: r.goals,
        assists: r.assists,
        yellow_card: r.yellow_card,
        red_card: r.red_card,
        own_goals: r.own_goals,
      }
    }
  }

  // Squadre con le loro formazioni per il calcolo risultati
  const { data: teams } = selectedMatchday
    ? await supabase.from('teams').select('id, name')
    : { data: [] }

  // Impostazioni lega
  const { data: league } = await supabase
    .from('leagues')
    .select('settings')
    .single()
  const settings = parseSettings(league?.settings)

  return (
    <VotiClient
      matchdays={matchdays || []}
      selectedMatchday={selectedMatchday}
      players={players}
      existingRatings={existingRatings}
      teams={teams || []}
      settings={settings}
    />
  )
}
