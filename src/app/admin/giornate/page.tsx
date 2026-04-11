import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

  const [{ data: league }, { data: matchdays }, { data: teams }] = await Promise.all([
    supabase.from('leagues').select('id, name').single(),
    supabase.from('matchdays').select('*').order('number'),
    supabase.from('teams').select('id, name').order('name'),
  ])

  // Sfide per ogni giornata
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, matchday_id, home_team_id, away_team_id')

  return (
    <GiornateClient
      league={league}
      initialMatchdays={matchdays || []}
      teams={teams || []}
      initialFixtures={fixtures || []}
    />
  )
}
