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

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .order('role', { ascending: true })
    .order('name', { ascending: true })

  return <GiocatoriClient initialPlayers={players || []} />
}
