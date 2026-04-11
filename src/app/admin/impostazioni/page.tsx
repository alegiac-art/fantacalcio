import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { parseSettings } from '@/lib/settings'
import ImpostazioniClient from './ImpostazioniClient'

export default async function ImpostazioniPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) redirect('/')

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, settings')
    .single()

  const settings = parseSettings(league?.settings)

  return (
    <ImpostazioniClient
      leagueId={league?.id ?? null}
      leagueName={league?.name ?? ''}
      initialSettings={settings}
    />
  )
}
