-- ============================================
-- SCHEMA FANTACALCIO
-- Incolla tutto nel SQL Editor di Supabase e clicca Run
-- ============================================

-- 1. PROFILI UTENTI (estende auth.users di Supabase)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: crea automaticamente il profilo quando un utente si registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. LEGA
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'La mia lega',
  admin_id UUID REFERENCES profiles(id),
  season TEXT DEFAULT '2024-25',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SQUADRE FANTASY
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. GIOCATORI DI SERIE A
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('P', 'D', 'C', 'A')),
  serie_a_team TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ROSE (giocatori nelle squadre fantasy)
CREATE TABLE IF NOT EXISTS rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  purchase_price INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, player_id)
);

-- 6. GIORNATE DI CAMPIONATO
CREATE TABLE IF NOT EXISTS matchdays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'open', 'closed', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, number)
);

-- 7. SFIDE (chi gioca contro chi ogni giornata)
CREATE TABLE IF NOT EXISTS fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matchday_id UUID REFERENCES matchdays(id) ON DELETE CASCADE,
  home_team_id UUID REFERENCES teams(id),
  away_team_id UUID REFERENCES teams(id)
);

-- 8. FORMAZIONI
CREATE TABLE IF NOT EXISTS lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  matchday_id UUID REFERENCES matchdays(id) ON DELETE CASCADE,
  module TEXT DEFAULT '4-4-2',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, matchday_id)
);

-- 9. GIOCATORI NELLA FORMAZIONE
CREATE TABLE IF NOT EXISTS lineup_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID REFERENCES lineups(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  is_starter BOOLEAN DEFAULT TRUE,
  slot_position INTEGER DEFAULT 0
);

-- 10. VOTI GIORNATA (inseriti dall'admin dopo ogni giornata di Serie A)
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matchday_id UUID REFERENCES matchdays(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10),
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  yellow_card BOOLEAN DEFAULT FALSE,
  red_card BOOLEAN DEFAULT FALSE,
  own_goals INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(matchday_id, player_id)
);

-- 11. RISULTATI PER SQUADRA OGNI GIORNATA
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matchday_id UUID REFERENCES matchdays(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  total_score DECIMAL(6,2) DEFAULT 0,
  goals_scored INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(matchday_id, team_id)
);

-- 12. INVITI
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineup_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Funzione helper: verifica se l'utente corrente e' admin
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Policy: tutti gli utenti autenticati possono LEGGERE tutto
CREATE POLICY "Lettura autenticati" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON leagues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON players FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON rosters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON matchdays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON fixtures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON lineups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON lineup_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura autenticati" ON results FOR SELECT TO authenticated USING (true);

-- Policy: utenti possono aggiornare il proprio profilo
CREATE POLICY "Aggiorna profilo personale" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- Policy: utenti possono gestire la propria formazione
CREATE POLICY "Inserisci formazione" ON lineups FOR INSERT TO authenticated
  WITH CHECK (team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid()));
CREATE POLICY "Aggiorna formazione" ON lineups FOR UPDATE TO authenticated
  USING (team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid()));
CREATE POLICY "Elimina formazione" ON lineups FOR DELETE TO authenticated
  USING (team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid()));

CREATE POLICY "Gestisci giocatori formazione" ON lineup_players FOR ALL TO authenticated
  USING (lineup_id IN (
    SELECT l.id FROM lineups l
    JOIN teams t ON l.team_id = t.id
    WHERE t.owner_id = auth.uid()
  ));

-- Policy: solo admin puo' scrivere su tutto il resto
CREATE POLICY "Admin gestisce leghe" ON leagues FOR ALL TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admin gestisce squadre" ON teams FOR ALL TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admin gestisce giocatori" ON players FOR ALL TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admin gestisce rose" ON rosters FOR ALL TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admin gestisce giornate" ON matchdays FOR ALL TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admin gestisce sfide" ON fixtures FOR ALL TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admin gestisce voti" ON ratings FOR ALL TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admin gestisce risultati" ON results FOR ALL TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admin gestisce inviti" ON invitations FOR ALL TO authenticated
  USING (public.is_current_user_admin());
