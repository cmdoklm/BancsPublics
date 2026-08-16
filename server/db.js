// Initialisation base SQLite : bancs + notes
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'bancs.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS bancs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',      -- 'osm' ou 'user'
  osm_id TEXT,
  photo_path TEXT,
  verified INTEGER NOT NULL DEFAULT 0,      -- 1 si detection IA a confirme un banc
  verif_score REAL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  banc_id INTEGER NOT NULL REFERENCES bancs(id) ON DELETE CASCADE,
  vue INTEGER NOT NULL CHECK(vue BETWEEN 1 AND 5),
  poubelle INTEGER NOT NULL CHECK(poubelle BETWEEN 0 AND 1),
  ombre INTEGER NOT NULL CHECK(ombre BETWEEN 0 AND 1),
  confort INTEGER NOT NULL CHECK(confort BETWEEN 1 AND 5),
  proprete INTEGER NOT NULL CHECK(proprete BETWEEN 1 AND 5),
  commentaire TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bancs_geo ON bancs(lat, lon);
CREATE INDEX IF NOT EXISTS idx_notes_banc ON notes(banc_id);
`);

module.exports = db;
