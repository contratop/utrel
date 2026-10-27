import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL DEFAULT '',
  avatar        TEXT,
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS boards (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  background       TEXT NOT NULL DEFAULT 'aurora',
  background_image TEXT,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (board_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members(user_id);

CREATE TABLE IF NOT EXISTS lists (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  color      TEXT,
  card_limit INTEGER,
  position   REAL NOT NULL DEFAULT 1000,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(board_id);

CREATE TABLE IF NOT EXISTS cards (
  id           TEXT PRIMARY KEY,
  board_id     TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  list_id      TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  due_date     TEXT,
  due_complete INTEGER NOT NULL DEFAULT 0,
  priority     TEXT NOT NULL DEFAULT 'none',
  cover_color  TEXT,
  cover_image  TEXT,
  position     REAL NOT NULL DEFAULT 1000,
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id);
CREATE INDEX IF NOT EXISTS idx_cards_list ON cards(list_id);

CREATE TABLE IF NOT EXISTS labels (
  id       TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name     TEXT NOT NULL DEFAULT '',
  color    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_labels_board ON labels(board_id);

CREATE TABLE IF NOT EXISTS card_labels (
  card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE TABLE IF NOT EXISTS card_members (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, user_id)
);

CREATE TABLE IF NOT EXISTS checklists (
  id       TEXT PRIMARY KEY,
  card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  title    TEXT NOT NULL DEFAULT 'Checklist',
  position REAL NOT NULL DEFAULT 1000
);
CREATE INDEX IF NOT EXISTS idx_checklists_card ON checklists(card_id);

CREATE TABLE IF NOT EXISTS checklist_items (
  id            TEXT PRIMARY KEY,
  checklist_id  TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  done          INTEGER NOT NULL DEFAULT 0,
  position      REAL NOT NULL DEFAULT 1000,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_checklist ON checklist_items(checklist_id);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  card_id    TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id);
`

/** Añade columnas nuevas a bases de datos ya existentes (imágenes personalizadas). */
function migrate(db) {
  const columnsOf = (table) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => column.name)

  const add = (table, column, definition) => {
    if (!columnsOf(table).includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  add('boards', 'background_image', 'TEXT')
  add('cards', 'cover_image', 'TEXT')
  add('lists', 'color', 'TEXT')
  add('lists', 'card_limit', 'INTEGER')
  add('users', 'avatar', 'TEXT')
  add('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0')
  add('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0')

  ensureAdmin(db)
}

/**
 * Garantiza que siempre exista un administrador activo. En instalaciones
 * nuevas lo será el primer usuario que se registre; en bases de datos que ya
 * tenían usuarios, el más antiguo pasa a ser administrador.
 */
function ensureAdmin(db) {
  const admins = db
    .prepare('SELECT COUNT(*) AS total FROM users WHERE is_admin = 1 AND disabled = 0')
    .get().total
  if (admins > 0) return
  const first = db
    .prepare('SELECT id FROM users WHERE disabled = 0 ORDER BY created_at ASC, rowid ASC LIMIT 1')
    .get()
  if (first) db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(first.id)
}

export function promoteFirstUserIfNoAdmin(db, userId) {
  const admins = db.prepare('SELECT COUNT(*) AS total FROM users WHERE is_admin = 1').get().total
  if (admins === 0) db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId)
}

export function createDb(file = ':memory:') {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  migrate(db)
  return db
}
