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
  bonuses: {
    goal_P: number       // bonus per gol segnato: portiere
    goal_D: number       // bonus per gol segnato: difensore
    goal_C: number       // bonus per gol segnato: centrocampista
    goal_A: number       // bonus per gol segnato: attaccante
    assist: number       // bonus per assist
    yellow_card: number  // malus ammonizione (magnitudine positiva, applicata negativa)
    red_card: number     // malus espulsione
    own_goal: number     // malus autogol
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
  bonuses: {
    goal_P: 3,
    goal_D: 3,
    goal_C: 2.5,
    goal_A: 2,
    assist: 1,
    yellow_card: 0.5,
    red_card: 1,
    own_goal: 2,
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
    bonuses: {
      goal_P: s.bonuses?.goal_P ?? DEFAULT_SETTINGS.bonuses.goal_P,
      goal_D: s.bonuses?.goal_D ?? DEFAULT_SETTINGS.bonuses.goal_D,
      goal_C: s.bonuses?.goal_C ?? DEFAULT_SETTINGS.bonuses.goal_C,
      goal_A: s.bonuses?.goal_A ?? DEFAULT_SETTINGS.bonuses.goal_A,
      assist: s.bonuses?.assist ?? DEFAULT_SETTINGS.bonuses.assist,
      yellow_card: s.bonuses?.yellow_card ?? DEFAULT_SETTINGS.bonuses.yellow_card,
      red_card: s.bonuses?.red_card ?? DEFAULT_SETTINGS.bonuses.red_card,
      own_goal: s.bonuses?.own_goal ?? DEFAULT_SETTINGS.bonuses.own_goal,
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
  own_goals: number,
  settings: LeagueSettings
): number {
  if (!rating) return 0
  const b = settings.bonuses
  let score = rating
  const goalBonus = role === 'P' ? b.goal_P : role === 'D' ? b.goal_D : role === 'C' ? b.goal_C : b.goal_A
  score += goals * goalBonus
  score += assists * b.assist
  if (yellow_card) score -= b.yellow_card
  if (red_card) score -= b.red_card
  score -= own_goals * b.own_goal
  return Math.max(0, score)
}
