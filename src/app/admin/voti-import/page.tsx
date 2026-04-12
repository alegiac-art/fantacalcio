import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import VotiImportClient from './VotiImportClient'

type ArchivioEntry = {
  id: string
  stagione: string
  giornata: number
  filename: string
  storage_path: string
  downloaded_at: string
}

export default async function VotiImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  // Archivio file già scaricati (ignora errore se tabella non esiste)
  const { data: archivio } = await supabase
    .from('voti_archivio')
    .select('*')
    .order('stagione', { ascending: false })
    .order('giornata', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-5">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin" className="text-gray-400 text-2xl font-light leading-none">‹</Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">ADMIN</span>
            </div>
            <h1 className="text-xl font-bold mt-0.5">Import Voti Serie A</h1>
          </div>
        </div>
        <p className="text-gray-400 text-sm mt-1 ml-9">
          Scarica e archivia i voti ufficiali da PianetaFanta
        </p>
      </div>

      <VotiImportClient archivio={(archivio as ArchivioEntry[]) || []} />
    </div>
  )
}
