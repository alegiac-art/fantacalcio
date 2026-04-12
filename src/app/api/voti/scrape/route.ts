import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Verifica admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  try {
    const res = await fetch('https://www.pianetafanta.it/voti-ufficiali.asp', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Errore HTTP ${res.status} dalla fonte` }, { status: 502 })
    }

    const html = await res.text()

    // Stagione: es. "2025/2026"
    const stagionMatch = html.match(/(\d{4})\/(\d{4})/)
    const stagione = stagionMatch ? `${stagionMatch[1]}/${stagionMatch[2]}` : null

    // Giornata: es. "31°giornata", "31° giornata", "31ª giornata"
    const giornataMatch = html.match(/(\d+)\s*[°ºª]?\s*giornata/gi)
    let giornata: number | null = null
    if (giornataMatch && giornataMatch.length > 0) {
      const n = giornataMatch[0].match(/(\d+)/)
      if (n) giornata = parseInt(n[1])
    }

    // Link Excel: "voti-ufficiosi-excel.asp?giornataScelta=31&searchBonus="
    const excelMatch = html.match(/voti-ufficiosi-excel\.asp\?giornataScelta=(\d+)([^"'\s<]*)/i)
    const hasExcel = !!excelMatch
    const excelGiornata = excelMatch ? parseInt(excelMatch[1]) : null

    return NextResponse.json({
      success: true,
      stagione,
      giornata,
      hasExcel,
      excelGiornata,
      // Se non troviamo nulla, includiamo un frammento per debug
      ...((!stagione || !giornata) && {
        debug: html.substring(0, 1000).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      }),
    })
  } catch (e) {
    return NextResponse.json({ error: `Errore di rete: ${(e as Error).message}` }, { status: 500 })
  }
}
