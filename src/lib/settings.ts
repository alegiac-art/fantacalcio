export interface LeagueSettings {
  roster: {
    max_total: number
    max_P: number
    max_D: number
    max_C: number
    max_A: number
  }
  scoring: {
    goal_threshold: number
    goal_band: number
  }
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  roster: {
    max_total: 25,
    max_P: 3,
    max_D: 8,
    max_C: 8,
    max_A: 6,
  },
  scoring: {
    goal_threshold: 66,
    goal_band: 6,
  },
}

export function parseSettings(raw: unknown): LeagueSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS
  const s = raw as Partial<LeagueSettings>
  return {
    roster: {
      max_total: s.roster?.max_total ?? DEFAULT_SETTINGS.roster.max_total,
      max_P: s.roster?.max_P ?? DEFAULT_SETTINGS.roster.max_P,
      max_D: s.roster?.max_D ?? DEFAULT_SETTINGS.roster.max_D,
      max_C: s.roster?.max_C ?? DEFAULT_SETTINGS.roster.max_C,
      max_A: s.roster?.max_A ?? DEFAULT_SETTINGS.roster.max_A,
    },
    scoring: {
      goal_threshold: s.scoring?.goal_threshold ?? DEFAULT_SETTINGS.scoring.goal_threshold,
      goal_band: s.scoring?.goal_band ?? DEFAULT_SETTINGS.scoring.goal_band,
    },
  }
}

/** Calcola i fantagol di una squadra in base al punteggio totale e ai parametri lega */
export function calcFantaGoals(totalScore: number, settings: LeagueSettings): number {
  const { goal_threshold, goal_band } = settings.scoring
  if (totalScore < goal_threshold) return 0
  return Math.floor((totalScore - goal_threshold) / goal_band) + 1
}

/** Calcola il punteggio fantacalcio di un singolo giocatore */
export function calcPlayerScore(
  role: string,
  rating: number | null,
  goals: number,
  assists: number,
  yellow_card: boolean,
  red_card: boolean,
  own_goals: number
): number {
  if (!rating) return 0
  let score = rating
  const goalBonus = role === 'P' ? 3 : role === 'D' ? 3 : role === 'C' ? 2.5 : 2
  score += goals * goalBonus
  score += assists * 1
  if (yellow_card) score -= 0.5
  if (red_card) score -= 1
  score -= own_goals * 2
  return Math.max(0, score)
}
