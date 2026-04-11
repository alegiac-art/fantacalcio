'use client'

import { useState, useTransition, useRef, useId } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Team {
  id: string
  name: string
  motto: string | null
  logo_url: string | null
  jersey_style: string | null
  jersey_color1: string | null
  jersey_color2: string | null
}

interface Props {
  userId: string
  email: string
  displayName: string
  team: Team | null
}

// ── Jersey SVG ──────────────────────────────────────────────────────────────
function JerseyPreview({ style, color1, color2 }: {
  style: string; color1: string; color2: string
}) {
  const uid = useId().replace(/:/g, 'x')
  const BODY = 'M 70,18 L 16,44 L 0,68 L 0,96 L 32,84 L 38,216 L 162,216 L 168,84 L 200,96 L 200,68 L 184,44 L 130,18 L 113,50 L 100,60 L 87,50 Z'

  return (
    <svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" className="w-44 mx-auto drop-shadow-xl">
      <defs>
        <pattern id={`stripes-${uid}`} x="0" y="0" width="22" height="300" patternUnits="userSpaceOnUse">
          <rect width="11" height="300" fill={color1} />
          <rect x="11" width="11" height="300" fill={color2} />
        </pattern>
        <linearGradient id={`shadow-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="black" stopOpacity="0.15" />
          <stop offset="35%" stopColor="black" stopOpacity="0" />
          <stop offset="65%" stopColor="black" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {/* Body */}
      <path d={BODY} fill={style === 'stripes' ? `url(#stripes-${uid})` : color1} />
      {/* Shading */}
      <path d={BODY} fill={`url(#shadow-${uid})`} />
      {/* Collar */}
      <path
        d="M 70,18 L 87,50 L 100,60 L 113,50 L 130,18"
        fill="none" stroke={color2} strokeWidth="9"
        strokeLinejoin="round" strokeLinecap="round"
      />
      {/* Outline */}
      <path d={BODY} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
    </svg>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ProfiloClient({ userId, email, displayName, team }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Display name
  const [name, setName] = useState(displayName)

  // Team fields
  const [teamName, setTeamName] = useState(team?.name ?? '')
  const [motto, setMotto] = useState(team?.motto ?? '')
  const [jerseyStyle, setJerseyStyle] = useState<'solid' | 'stripes'>(
    (team?.jersey_style as 'solid' | 'stripes') ?? 'solid'
  )
  const [color1, setColor1] = useState(team?.jersey_color1 ?? '#16a34a')
  const [color2, setColor2] = useState(team?.jersey_color2 ?? '#ffffff')
  const [logoUrl, setLogoUrl] = useState(team?.logo_url ?? '')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Messages
  const [profileMsg, setProfileMsg] = useState('')
  const [teamMsg, setTeamMsg] = useState('')
  const [jerseyMsg, setJerseyMsg] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [profileErr, setProfileErr] = useState(false)
  const [teamErr, setTeamErr] = useState(false)
  const [jerseyErr, setJerseyErr] = useState(false)
  const [passwordErr, setPasswordErr] = useState(false)

  // ── Save display name ──────────────────────────────────────────────────────
  const handleSaveName = () => {
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name.trim() })
        .eq('id', userId)
      if (error) { setProfileErr(true); setProfileMsg('Errore nel salvataggio.'); return }
      setProfileErr(false)
      setProfileMsg('Nome aggiornato!')
      router.refresh()
    })
  }

  // ── Save team name + motto ─────────────────────────────────────────────────
  const handleSaveTeam = () => {
    if (!team) return
    if (!teamName.trim()) { setTeamErr(true); setTeamMsg('Il nome non può essere vuoto.'); return }
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('teams')
        .update({ name: teamName.trim(), motto: motto.trim() || null })
        .eq('id', team.id)
      if (error) { setTeamErr(true); setTeamMsg('Errore nel salvataggio.'); return }
      setTeamErr(false)
      setTeamMsg('Squadra aggiornata!')
      router.refresh()
    })
  }

  // ── Save jersey ────────────────────────────────────────────────────────────
  const handleSaveJersey = () => {
    if (!team) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('teams')
        .update({ jersey_style: jerseyStyle, jersey_color1: color1, jersey_color2: color2 })
        .eq('id', team.id)
      if (error) { setJerseyErr(true); setJerseyMsg('Errore nel salvataggio.'); return }
      setJerseyErr(false)
      setJerseyMsg('Maglia salvata!')
      router.refresh()
    })
  }

  // ── Upload logo ────────────────────────────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!team) return
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setTeamErr(true); setTeamMsg('Logo troppo grande: max 2 MB.'); return
    }
    setUploadingLogo(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `team-${team.id}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true })
    if (uploadError) {
      setTeamErr(true); setTeamMsg('Errore nel caricamento del logo.')
      setUploadingLogo(false); return
    }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    await supabase.from('teams').update({ logo_url: publicUrl }).eq('id', team.id)
    setLogoUrl(publicUrl)
    setTeamErr(false)
    setTeamMsg('Logo caricato!')
    setUploadingLogo(false)
    router.refresh()
  }

  // ── Change password ────────────────────────────────────────────────────────
  const handleChangePassword = () => {
    if (newPassword.length < 6) {
      setPasswordErr(true); setPasswordMsg('La password deve avere almeno 6 caratteri.'); return
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr(true); setPasswordMsg('Le password non coincidono.'); return
    }
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) { setPasswordErr(true); setPasswordMsg('Errore. Riprova.'); return }
      setPasswordErr(false)
      setPasswordMsg('Password aggiornata!')
      setNewPassword('')
      setConfirmPassword('')
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-800 text-white px-4 pt-12 pb-6">
        <Link href="/" className="text-gray-400 text-sm block mb-3">← Home</Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-green-600 flex items-center justify-center text-2xl font-black">
            {(name || email).charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-bold">{name || email.split('@')[0]}</h1>
            <p className="text-gray-400 text-xs mt-0.5">{email}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* ── Nome visualizzato ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="font-bold text-gray-700 text-sm">Il mio nome</h2>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Nome visualizzato</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Come vuoi essere chiamato"
              />
            </div>
            {profileMsg && (
              <p className={`text-xs p-2 rounded-lg ${profileErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {profileMsg}
              </p>
            )}
            <button
              onClick={handleSaveName}
              disabled={isPending}
              className="w-full bg-gray-800 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              Salva nome
            </button>
          </div>
        </div>

        {/* ── Squadra ── */}
        {team ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-green-50 border-b border-green-100">
              <h2 className="font-bold text-green-800 text-sm">La mia squadra</h2>
            </div>
            <div className="p-4 space-y-3">

              {/* Logo */}
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 cursor-pointer shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">🛡️</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">Logo squadra</p>
                  <p className="text-xs text-gray-400 mt-0.5">JPG o PNG, max 2 MB</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="mt-1.5 text-xs text-green-600 font-semibold bg-green-50 px-3 py-1 rounded-lg disabled:opacity-50"
                  >
                    {uploadingLogo ? 'Caricamento...' : logoUrl ? 'Cambia logo' : 'Carica logo'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </div>
              </div>

              {/* Nome squadra */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Nome squadra</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Motto */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Motto</label>
                <input
                  type="text"
                  value={motto}
                  onChange={(e) => setMotto(e.target.value)}
                  maxLength={60}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Es. Vincere è l'unica opzione"
                />
              </div>

              {teamMsg && (
                <p className={`text-xs p-2 rounded-lg ${teamErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {teamMsg}
                </p>
              )}
              <button
                onClick={handleSaveTeam}
                disabled={isPending}
                className="w-full bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                Salva squadra
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-amber-800 text-sm">
              Nessuna squadra assegnata — contatta l'admin.
            </p>
          </div>
        )}

        {/* ── Personalizzazione maglia ── */}
        {team && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <h2 className="font-bold text-blue-800 text-sm">Maglia</h2>
              <p className="text-xs text-blue-600 mt-0.5">Personalizza i colori della tua maglia</p>
            </div>
            <div className="p-4 space-y-4">

              {/* Preview maglia */}
              <div className="py-2">
                <JerseyPreview style={jerseyStyle} color1={color1} color2={color2} />
              </div>

              {/* Stile */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Stile maglia</p>
                <div className="flex gap-3">
                  {(['solid', 'stripes'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setJerseyStyle(s)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        jerseyStyle === s
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {s === 'solid' ? 'Tinta unita' : 'A strisce'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colori */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {jerseyStyle === 'stripes' ? 'Colore 1' : 'Colore maglia'}
                    </p>
                    <p className="text-xs text-gray-400">{color1.toUpperCase()}</p>
                  </div>
                  <input
                    type="color"
                    value={color1}
                    onChange={(e) => setColor1(e.target.value)}
                    className="w-12 h-10 rounded-xl border-2 border-gray-200 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${jerseyStyle === 'solid' ? 'text-gray-400' : 'text-gray-700'}`}>
                      {jerseyStyle === 'stripes' ? 'Colore 2' : 'Colore colletto'}
                    </p>
                    <p className="text-xs text-gray-400">{color2.toUpperCase()}</p>
                  </div>
                  <input
                    type="color"
                    value={color2}
                    onChange={(e) => setColor2(e.target.value)}
                    className="w-12 h-10 rounded-xl border-2 border-gray-200 cursor-pointer"
                  />
                </div>
              </div>

              {jerseyMsg && (
                <p className={`text-xs p-2 rounded-lg ${jerseyErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {jerseyMsg}
                </p>
              )}
              <button
                onClick={handleSaveJersey}
                disabled={isPending}
                className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                Salva maglia
              </button>
            </div>
          </div>
        )}

        {/* ── Cambio password ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="font-bold text-gray-700 text-sm">Cambia password</h2>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Nuova password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="minimo 6 caratteri"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Conferma password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="ripeti la password"
              />
            </div>
            {passwordMsg && (
              <p className={`text-xs p-2 rounded-lg ${passwordErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {passwordMsg}
              </p>
            )}
            <button
              onClick={handleChangePassword}
              disabled={isPending}
              className="w-full bg-gray-800 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              Aggiorna password
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
