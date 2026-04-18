'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LeagueSettings } from '@/lib/settings'
import { calcFantaGoals } from '@/lib/settings'

interface Props {
  leagueId: string | null
  leagueName: string
  initialSettings: LeagueSettings
}

export default function ImpostazioniClient({ leagueId, leagueName, initialSettings }: Props) {
  const [settings, setSettings] = useState<LeagueSettings>(initialSettings)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const set = (section: keyof LeagueSettings, key: string, value: number) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }))
  }

  const handleSave = () => {
    if (!leagueId) { setMessage('Nessuna lega trovata.'); setIsError(true); return }
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('leagues')
        .update({ settings })
        .eq('id', leagueId)
      if (error) { setMessage('Errore nel salvataggio.'); setIsError(true); return }
      setIsError(false)
      setMessage('Impostazioni salvate!')
      router.refresh()
    })
  }

  // Anteprima calcolo gol
  const exampleScores = [60, 62, 65, 66, 68, 72, 78, 84, 90]

  const totalRoster =
    settings.roster.max_P +
    settings.roster.max_D +
    settings.roster.max_C +
    settings.roster.max_A

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-800 text-white px-4 pt-12 pb-4">
        <Link href="/admin" className="text-gray-400 text-sm block mb-2">← Admin</Link>
        <h1 className="text-xl font-bold">Impostazioni lega</h1>
        <p className="text-gray-400 text-sm">{leagueName}</p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* ROSA */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <h2 className="font-bold text-blue-800">Limiti Rosa</h2>
            <p className="text-xs text-blue-600 mt-0.5">
              Numero massimo di giocatori per ruolo in ogni rosa
            </p>
          </div>
          <div className="p-4 space-y-4">
            <NumberInput
              label="Portieri (P)"
              value={settings.roster.max_P}
              onChange={(v) => set('roster', 'max_P', v)}
              color="yellow"
            />
            <NumberInput
              label="Difensori (D)"
              value={settings.roster.max_D}
              onChange={(v) => set('roster', 'max_D', v)}
              color="blue"
            />
            <NumberInput
              label="Centrocampisti (C)"
              value={settings.roster.max_C}
              onChange={(v) => set('roster', 'max_C', v)}
              color="green"
            />
            <NumberInput
              label="Attaccanti (A)"
              value={settings.roster.max_A}
              onChange={(v) => set('roster', 'max_A', v)}
              color="red"
            />

            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Totale per ruolo</span>
                <span className="font-bold text-gray-800">{totalRoster}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-gray-600">Massimo totale rosa</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={totalRoster}
                    max={40}
                    value={settings.roster.max_total}
                    onChange={(e) => set('roster', 'max_total', parseInt(e.target.value) || 25)}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {totalRoster > settings.roster.max_total && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ La somma per ruolo ({totalRoster}) supera il massimo totale ({settings.roster.max_total})
                </p>
              )}
            </div>
          </div>
        </div>

        {/* PUNTEGGI */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-green-100">
            <h2 className="font-bold text-green-800">Calcolo Fantagol</h2>
            <p className="text-xs text-green-600 mt-0.5">
              Soglia di punti per il primo gol e fascia per ogni gol aggiuntivo
            </p>
          </div>
          <div className="p-4 space-y-4">
            <NumberInput
              label="Soglia primo gol (punti)"
              value={settings.scoring.goal_threshold}
              onChange={(v) => set('scoring', 'goal_threshold', v)}
              color="green"
              min={50}
              max={100}
              step={1}
              description="Punti totali necessari per segnare almeno 1 gol"
            />
            <NumberInput
              label="Fascia per gol aggiuntivo (punti)"
              value={settings.scoring.goal_band}
              onChange={(v) => set('scoring', 'goal_band', v)}
              color="green"
              min={1}
              max={20}
              step={1}
              description="Ogni quanti punti sopra la soglia si segna un gol in più"
            />

            {/* Anteprima */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Anteprima calcolo
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left pb-1">Punteggio squadra</th>
                      <th className="text-center pb-1">Fantagol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exampleScores.map((score) => {
                      const goals = calcFantaGoals(score, settings)
                      const isThreshold = score === settings.scoring.goal_threshold
                      return (
                        <tr
                          key={score}
                          className={`border-t border-gray-50 ${isThreshold ? 'bg-green-50' : ''}`}
                        >
                          <td className="py-1.5 text-gray-700">
                            {score} pt
                            {isThreshold && (
                              <span className="ml-1 text-green-600 font-semibold">← soglia</span>
                            )}
                          </td>
                          <td className="text-center">
                            {goals === 0 ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <span className="font-bold text-green-700">
                                {'⚽'.repeat(Math.min(goals, 5))} {goals > 5 ? `(${goals})` : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* BONUS GOL PER RUOLO */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
            <h2 className="font-bold text-orange-800">Bonus e Malus</h2>
            <p className="text-xs text-orange-600 mt-0.5">
              Bonus per gol/assist e malus per cartellini e autogol
            </p>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Bonus per gol</p>
            <NumberInput
              label="Portiere (P)"
              value={settings.bonuses.goal_P}
              onChange={(v) => set('bonuses', 'goal_P', v)}
              color="yellow"
              min={0} max={10} step={0.5}
            />
            <NumberInput
              label="Difensore (D)"
              value={settings.bonuses.goal_D}
              onChange={(v) => set('bonuses', 'goal_D', v)}
              color="blue"
              min={0} max={10} step={0.5}
            />
            <NumberInput
              label="Centrocampista (C)"
              value={settings.bonuses.goal_C}
              onChange={(v) => set('bonuses', 'goal_C', v)}
              color="green"
              min={0} max={10} step={0.5}
            />
            <NumberInput
              label="Attaccante (A)"
              value={settings.bonuses.goal_A}
              onChange={(v) => set('bonuses', 'goal_A', v)}
              color="red"
              min={0} max={10} step={0.5}
            />

            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Bonus assist</p>
              <NumberInput
                label="Assist"
                value={settings.bonuses.assist}
                onChange={(v) => set('bonuses', 'assist', v)}
                color="green"
                min={0} max={5} step={0.5}
              />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Malus (magnitudine, applicati negativi)</p>
              <div className="space-y-4">
                <NumberInput
                  label="Ammonizione"
                  value={settings.bonuses.yellow_card}
                  onChange={(v) => set('bonuses', 'yellow_card', v)}
                  color="yellow"
                  min={0} max={5} step={0.5}
                  description="Valore sottratto al punteggio"
                />
                <NumberInput
                  label="Espulsione"
                  value={settings.bonuses.red_card}
                  onChange={(v) => set('bonuses', 'red_card', v)}
                  color="red"
                  min={0} max={5} step={0.5}
                  description="Valore sottratto al punteggio"
                />
                <NumberInput
                  label="Autogol"
                  value={settings.bonuses.own_goal}
                  onChange={(v) => set('bonuses', 'own_goal', v)}
                  color="red"
                  min={0} max={10} step={0.5}
                  description="Valore sottratto per ogni autogol"
                />
              </div>
            </div>
          </div>
        </div>

        {message && (
          <p className={`text-sm p-3 rounded-xl ${
            isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {message}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={isPending}
          className="w-full bg-gray-800 text-white font-bold py-4 rounded-2xl disabled:opacity-50 text-sm"
        >
          {isPending ? 'Salvataggio...' : 'Salva impostazioni'}
        </button>
      </div>
    </div>
  )
}

// Componente input numerico riutilizzabile
function NumberInput({
  label, value, onChange, color, min = 1, max = 99, step = 1, description,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  color: 'yellow' | 'blue' | 'green' | 'red'
  min?: number
  max?: number
  step?: number
  description?: string
}) {
  const colorMap = {
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className={`w-8 h-8 rounded-full text-lg font-bold flex items-center justify-center ${colorMap[color]}`}
        >
          −
        </button>
        <span className={`w-10 text-center font-black text-lg ${colorMap[color].split(' ')[1]}`}>
          {value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className={`w-8 h-8 rounded-full text-lg font-bold flex items-center justify-center ${colorMap[color]}`}
        >
          +
        </button>
      </div>
    </div>
  )
}
