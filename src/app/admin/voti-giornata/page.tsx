import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import VotiGiornataClient from './VotiGiornataClient'

export default async function VotiGiornataPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/')

  // Opzioni filtro: stagioni e giornate distinte
  const { data: archivio } = await supabase
    .from('voti_archivio')
    .select('stagione, giornata')
    .order('stagione', { ascending: false })
    .order('giornata', { ascending: false })

  const stagioni = [...new Set((archivio || []).map((r) => r.stagione))].sort().reverse()
  const giornatePerStagione: Record<string, number[]> = {}
  for (const r of archivio || []) {
    if (!giornatePerStagione[r.stagione]) giornatePerStagione[r.stagione] = []
    if (!giornatePerStagione[r.stagione].includes(r.giornata))
      giornatePerStagione[r.stagione].push(r.giornata)
  }
  for (const k of Object.keys(giornatePerStagione))
    giornatePerStagione[k].sort((a, b) => b - a)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <Link href="/admin" className="text-gray-400 text-sm block mb-2">← Admin</Link>
        <h1 className="text-xl font-bold">Archivio Voti</h1>
        <p className="text-gray-400 text-sm">Visualizza, modifica ed elimina i voti importati</p>
      </div>
      <VotiGiornataClient
        stagioni={stagioni}
        giornatePerStagione={giornatePerStagione}
      />
    </div>
  )
}
