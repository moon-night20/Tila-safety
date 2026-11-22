import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const databasePath = resolve(process.env.TILA_DB_PATH || 'data/tila.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })

export const database = new DatabaseSync(databasePath)

database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relationship TEXT NOT NULL,
    rank INTEGER NOT NULL,
    consent_confirmed INTEGER NOT NULL CHECK (consent_confirmed = 1),
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, rank),
    UNIQUE(user_id, phone)
  );

  CREATE TABLE IF NOT EXISTS locations (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS timers (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'grace', 'expired', 'cancelled')),
    duration_seconds INTEGER NOT NULL,
    remaining_seconds INTEGER NOT NULL,
    due_at INTEGER,
    note TEXT NOT NULL,
    run_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timer_run_id TEXT UNIQUE,
    source TEXT NOT NULL CHECK (source IN ('manual', 'timer')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'partial', 'failed', 'stopped')),
    latitude REAL,
    longitude REAL,
    location_updated_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alert_deliveries (
    id INTEGER PRIMARY KEY,
    alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    contact_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    rank INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    provider_sid TEXT,
    error_code TEXT,
    UNIQUE(alert_id, phone)
  );
`)

const userColumns = database.prepare('PRAGMA table_info(users)').all()
if (userColumns.some((column) => column.name === 'email') || !userColumns.some((column) => column.name === 'username')) {
  const legacyUsers = database.prepare('SELECT * FROM users ORDER BY id').all()
  const usedUsernames = new Set()
  const migratedUsers = legacyUsers.map((user) => {
    const emailPrefix = String(user.email || '').split('@')[0].toLowerCase()
    const base = emailPrefix.replace(/[^a-z0-9_]/g, '').slice(0, 30) || `user${user.id}`
    let username = base.slice(0, 30)
    if (username.length < 3) username = `user${user.id}`
    let suffix = 0
    while (usedUsernames.has(username)) {
      suffix += 1
      const uniqueSuffix = `${user.id}${suffix === 1 ? '' : suffix}`
      username = `${base.slice(0, 30 - uniqueSuffix.length)}${uniqueSuffix}`
    }
    usedUsernames.add(username)
    return { ...user, username }
  })

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  const insertMigratedUser = database.prepare(`
    INSERT INTO users_new (id, name, username, phone, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  for (const user of migratedUsers) {
    insertMigratedUser.run(user.id, user.name, user.username, user.phone || null, user.password_salt, user.password_hash, user.created_at)
  }
  database.exec('DROP TABLE users; ALTER TABLE users_new RENAME TO users; COMMIT; PRAGMA foreign_keys = ON;')
}
database.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL')

export function getContacts(userId) {
  return database.prepare(`
    SELECT id, name, phone, relationship, rank, consent_confirmed AS consentConfirmed
    FROM contacts WHERE user_id = ? ORDER BY rank
  `).all(userId).map((contact) => ({ ...contact, consentConfirmed: Boolean(contact.consentConfirmed) }))
}

export function getTimer(userId) {
  const timer = database.prepare(`
    SELECT status, duration_seconds AS durationSeconds, remaining_seconds AS remainingSeconds,
      due_at AS dueAt, note, run_id AS runId, updated_at AS updatedAt
    FROM timers WHERE user_id = ?
  `).get(userId)

  if (!timer) return { status: 'idle', duration: 1800, remaining: 1800, note: '', runId: null }

  const remaining = timer.status === 'running'
    ? Math.max(0, Math.ceil((timer.dueAt - Date.now()) / 1000))
    : timer.remainingSeconds
  return {
    status: timer.status,
    duration: timer.durationSeconds / 60,
    remaining,
    graceRemaining: timer.status === 'grace' ? Math.max(0, Math.ceil((timer.dueAt - Date.now()) / 1000)) : 0,
    dueAt: timer.dueAt,
    note: timer.note,
    runId: timer.runId,
    updatedAt: timer.updatedAt,
  }
}

export function getCurrentLocation(userId) {
  return database.prepare(`
    SELECT latitude, longitude, updated_at AS updatedAt
    FROM locations WHERE user_id = ?
  `).get(userId) || null
}
