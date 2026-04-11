import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InvitiClient from './InvitiClient'

export default async function InvitiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const [{ data: league }, { data: invitations }] = await Promise.all([
    supabase.from('leagues').select('id, name').single(),
    supabase.from('invitations').select('*').order('created_at', { ascending: false }),
  ])

  return <InvitiClient league={league} initialInvitations={invitations || []} />
}
