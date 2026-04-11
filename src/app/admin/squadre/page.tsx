import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { parseSettings } from '@/lib/settings'
import SquadreClient from './SquadreClient'

export default async function SquadrePage() {
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
    { data: teams },
    { data: allProfiles },
    { data: allPlayers },
  ] = await Promise.all([
    supabase.from('leagues').select('*').single(),
    supabase.from('teams').select(`
      id, name, owner_id,
      profiles(id, display_name, email),
      rosters(id, purchase_price, players(id, name, role, serie_a_team))
    `).order('name'),
    supabase.from('profiles').select('id, display_name, email').order('email'),
    supabase.from('players').select('id, name, role, serie_a_team').order('role').order('name'),
  ])

  const settings = parseSettings(league?.settings)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <SquadreClient
      league={league}
      initialTeams={(teams || []) as any}
      profiles={allProfiles || []}
      allPlayers={allPlayers || []}
      settings={settings}
    />
  )
}
