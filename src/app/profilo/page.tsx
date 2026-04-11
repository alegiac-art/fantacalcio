import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfiloClient from './ProfiloClient'

export default async function ProfiloPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, motto, logo_url, jersey_style, jersey_color1, jersey_color2')
    .eq('owner_id', user.id)
    .maybeSingle()

  return (
    <ProfiloClient
      userId={user.id}
      email={user.email ?? ''}
      displayName={profile?.display_name ?? ''}
      team={team ?? null}
    />
  )
}
