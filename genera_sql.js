const fs = require('fs')
const path = require('path')

const csvPath = path.join(__dirname, 'listone_fantapazz.csv')
const outputPath = path.join(__dirname, 'import_giocatori.sql')

const content = fs.readFileSync(csvPath, 'utf8')
const lines = content.split('\n').filter(l => l.trim())

// Salta l'header
const rows = lines.slice(1)

// Escape apici singoli nel nome
const esc = s => s.replace(/'/g, "''").trim()

let sql = `-- ============================================
-- IMPORTAZIONE GIOCATORI DA LISTONE FANTAPAZZ
-- Esegui nel SQL Editor di Supabase
-- ============================================

-- Aggiunge la colonna quotazione se non esiste
ALTER TABLE players ADD COLUMN IF NOT EXISTS quotazione INTEGER DEFAULT 0;

-- Inserisce tutti i giocatori
INSERT INTO players (name, role, serie_a_team, quotazione) VALUES\n`

const values = []
for (const line of rows) {
  const parts = line.split(';')
  if (parts.length < 4) continue
  const role = esc(parts[0])
  const name = esc(parts[1])
  const team = esc(parts[2])
  const quot = parseInt(parts[3]) || 0

  if (!name || !role || !team) continue
  if (!['P','D','C','A'].includes(role)) continue

  values.push(`  ('${name}', '${role}', '${team}', ${quot})`)
}

sql += values.join(',\n')
sql += `\nON CONFLICT DO NOTHING;\n\n`
sql += `-- Totale giocatori importati: ${values.length}\n`
sql += `SELECT COUNT(*) as totale_giocatori FROM players;\n`

fs.writeFileSync(outputPath, sql, 'utf8')
console.log(`✓ Generati ${values.length} giocatori in import_giocatori.sql`)
