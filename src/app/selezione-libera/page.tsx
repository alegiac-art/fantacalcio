import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { parseSettings } from '@/lib/settings'
import SelezioneLibera from './SelezioneLibera'

export default async function SelezioneLiberaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: myTeam },
    { data: teams },
    { data: rosters },
    { data: players },
    { data: votiArchivio },
    { data: league },
  ] = await Promise.all([
    supabase.from('teams').select('id, name').eq('owner_id', user.id).maybeSingle(),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('rosters').select('team_id, player_id'),
    supabase.from('players').select('id, name, role, codice, serie_a_team').eq('is_active', true).order('name'),
    supabase
      .from('voti_archivio')
      .select('id, stagione, giornata, filename')
      .not('stagione', 'is', null)
      .not('giornata', 'is', null)
      .order('stagione', { ascending: false })
      .order('giornata', { ascending: false }),
    supabase.from('leagues').select('settings').single(),
  ])

  const settings = parseSettings(league?.settings)

  // Build playerIdsByTeam lookup
  const playerIdsByTeam: Record<string, string[]> = {}
  for (const r of rosters ?? []) {
    if (!playerIdsByTeam[r.team_id]) playerIdsByTeam[r.team_id] = []
    playerIdsByTeam[r.team_id].push(r.player_id)
  }

  return (
    <SelezioneLibera
      myTeamId={myTeam?.id ?? null}
      teams={(teams || []) as { id: string; name: string }[]}
      players={(players || []) as { id: string; name: string; role: string; codice: string | null; serie_a_team: string | null }[]}
      playerIdsByTeam={playerIdsByTeam}
      votiArchivio={(votiArchivio || []) as { id: string; stagione: string; giornata: number; filename: string | null }[]}
      settings={settings}
    />
  )
}
