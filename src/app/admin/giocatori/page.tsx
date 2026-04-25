import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GiocatoriClient from './GiocatoriClient'

export default async function GiocatoriPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const [{ data: players }, { data: archivio }] = await Promise.all([
    supabase
      .from('players')
      .select('*')
      .order('role', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('voti_archivio')
      .select('stagione, giornata')
      .not('stagione', 'is', null)
      .not('giornata', 'is', null)
      .order('stagione', { ascending: false })
      .order('giornata', { ascending: false }),
  ])

  const giornate = (archivio ?? []) as { stagione: string; giornata: number }[]

  return <GiocatoriClient initialPlayers={players || []} giornate={giornate} />
}
