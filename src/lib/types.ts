export interface Profile {
  id: string
  email: string
  display_name: string | null
  is_admin: boolean
  created_at: string
}

export interface League {
  id: string
  name: string
  admin_id: string | null
  season: string
  created_at: string
}

export interface Team {
  id: string
  league_id: string
  owner_id: string | null
  name: string
  created_at: string
  profiles?: Profile
}

export interface Player {
  id: string
  name: string
  role: 'P' | 'D' | 'C' | 'A'
  serie_a_team: string
  is_active: boolean
  created_at: string
}

export interface RosterEntry {
  id: string
  team_id: string
  player_id: string
  purchase_price: number
  created_at: string
  players: Player
}

export interface Matchday {
  id: string
  league_id: string
  number: number
  deadline: string | null
  status: 'upcoming' | 'open' | 'closed' | 'completed'
  created_at: string
}

export interface Fixture {
  id: string
  matchday_id: string
  home_team_id: string
  away_team_id: string
  home_team?: Team
  away_team?: Team
}

export interface Lineup {
  id: string
  team_id: string
  matchday_id: string
  module: string
  submitted_at: string
}

export interface LineupPlayer {
  id: string
  lineup_id: string
  player_id: string
  is_starter: boolean
  slot_position: number
  players?: Player
}

export interface Rating {
  id: string
  matchday_id: string
  player_id: string
  rating: number | null
  goals: number
  assists: number
  yellow_card: boolean
  red_card: boolean
  own_goals: number
  players?: Player
}

export interface Result {
  id: string
  matchday_id: string
  team_id: string
  total_score: number
  goals_scored: number
  goals_conceded: number
  points: number
  teams?: Team
}

export interface TeamStanding {
  id: string
  name: string
  totalPoints: number
  totalGoalsScored: number
  totalGoalsConceded: number
  matchesPlayed: number
  wins: number
  draws: number
  losses: number
}
