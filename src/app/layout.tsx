import type { Metadata, Viewport } from 'next'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/BottomNav'

export const metadata: Metadata = {
  title: 'Fantacalcio',
  description: 'La tua lega di fantacalcio tra amici',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#16a34a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.is_admin ?? false
  }

  return (
    <html lang="it" className="h-full">
      <body className="h-full bg-gray-50 antialiased">
        <main className={user ? 'pb-20' : ''}>
          {children}
        </main>
        {user && <BottomNav isAdmin={isAdmin} />}
      </body>
    </html>
  )
}
