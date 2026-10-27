/**
 * Ajustes de la instancia que gestiona el administrador desde el panel.
 * Viven en la base de datos; el valor inicial de `ALLOW_REGISTRATION` solo
 * actúa como valor por defecto mientras nadie los haya cambiado.
 */

const KEY_REGISTRATION = 'allow_registration'

function read(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : undefined
}

function write(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

export function allowRegistration(db) {
  const stored = read(db, KEY_REGISTRATION)
  if (stored !== undefined) return stored === 'true'
  return process.env.ALLOW_REGISTRATION !== 'false'
}

export function setAllowRegistration(db, value) {
  const enabled = value !== false
  write(db, KEY_REGISTRATION, enabled ? 'true' : 'false')
  return enabled
}

export function settingsPayload(db) {
  return { allowRegistration: allowRegistration(db) }
}
