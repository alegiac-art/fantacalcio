import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LegaClient from './LegaClient'

export default async function LegaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, display_name, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const { data: league } = await supabase.from('leagues').select('*').maybeSingle()

  return (
    <LegaClient
      userId={user.id}
      currentLeague={league}
      currentDisplayName={profile.display_name}
    />
  )
}
