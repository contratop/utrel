import { Router } from 'express'
import { hashPassword, publicUser, requireAdmin } from '../auth.js'
import { setAllowRegistration, settingsPayload } from '../settings.js'
import { HttpError, bool, str, uid } from '../util.js'

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function count(db, sql, ...params) {
  return db.prepare(sql).get(...params).total
}

/** Usuario visto desde el panel: datos públicos más su estado de cuenta. */
const adminUser = (row) => ({ ...publicUser(row), disabled: !!row.disabled })

/** Resumen de la instancia para la cabecera del panel. */
function stats(db) {
  return {
    users: count(db, 'SELECT COUNT(*) AS total FROM users'),
    admins: count(db, 'SELECT COUNT(*) AS total FROM users WHERE is_admin = 1'),
    disabled: count(db, 'SELECT COUNT(*) AS total FROM users WHERE disabled = 1'),
    boards: count(db, 'SELECT COUNT(*) AS total FROM boards WHERE archived = 0'),
    lists: count(db, 'SELECT COUNT(*) AS total FROM lists WHERE archived = 0'),
    cards: count(db, 'SELECT COUNT(*) AS total FROM cards WHERE archived = 0'),
    sessions: count(
      db,
      'SELECT COUNT(*) AS total FROM sessions WHERE expires_at > ?',
      new Date().toISOString()
    ),
  }
}

/** Todos los usuarios de la instancia con su actividad, para la tabla del panel. */
function userList(db) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.name, u.email, u.avatar, u.is_admin, u.disabled, u.created_at,
              (SELECT COUNT(*) FROM boards b WHERE b.owner_id = u.id) AS owned_boards,
              (SELECT COUNT(*) FROM board_members bm WHERE bm.user_id = u.id AND bm.role <> 'owner') AS shared_boards
         FROM users u
        ORDER BY u.created_at ASC, rowid ASC`
    )
    .all()
    .map((row) => ({
      ...publicUser(row),
      disabled: !!row.disabled,
      createdAt: row.created_at,
      ownedBoards: row.owned_boards,
      sharedBoards: row.shared_boards,
    }))
}

export function adminRoutes(db) {
  const router = Router()
  const findById = db.prepare('SELECT * FROM users WHERE id = ?')
  const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?')
  const findByUsername = db.prepare('SELECT * FROM users WHERE username = ?')

  // Todo el panel está reservado al administrador absoluto.
  router.use(requireAdmin)

  /** Estado completo del panel: ajustes, cifras y usuarios. */
  router.get('/overview', (_req, res) => {
    res.json({ settings: settingsPayload(db), stats: stats(db), users: userList(db) })
  })

  /** Abrir o cerrar el registro de nuevos usuarios. */
  router.patch('/settings', (req, res) => {
    const body = req.body || {}
    if (typeof body.allowRegistration !== 'boolean') {
      throw new HttpError(400, 'El campo "allowRegistration" debe ser booleano')
    }
    setAllowRegistration(db, body.allowRegistration)
    res.json({ settings: settingsPayload(db) })
  })

  /** Alta de usuarios desde el panel, sin pasar por el registro público. */
  router.post('/users', (req, res) => {
    const body = req.body || {}
    const email = str(body.email, 'email', { required: true, max: 200 })
    const username = str(body.username, 'usuario', { required: true, max: 32 })
    const name = str(body.name, 'nombre', { max: 80 })
    const password = typeof body.password === 'string' ? body.password : ''
    const isAdmin = bool(body.isAdmin, 'administrador') === 1

    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Introduce un email válido')
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(400, 'El usuario debe tener entre 3 y 32 caracteres (letras, números, . _ -)')
    }
    if (password.length < 8) {
      throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres')
    }
    if (findByEmail.get(email)) throw new HttpError(409, 'Ya existe una cuenta con ese email')
    if (findByUsername.get(username)) throw new HttpError(409, 'Ese nombre de usuario ya está en uso')

    const id = uid()
    db.prepare(
      `INSERT INTO users (id, email, username, name, password_hash, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, email, username, name || username, hashPassword(password), isAdmin ? 1 : 0, new Date().toISOString())

    res.status(201).json({ user: adminUser(findById.get(id)) })
  })

  /** Rol, estado, datos básicos y contraseña de un usuario. */
  router.patch('/users/:id', (req, res) => {
    const target = findById.get(req.params.id)
    if (!target) throw new HttpError(404, 'Usuario no encontrado')

    const body = req.body || {}
    const self = target.id === req.user.id
    const isAdmin = bool(body.isAdmin, 'administrador')
    const disabled = bool(body.disabled, 'deshabilitado')
    const name = str(body.name, 'nombre', { max: 80 })
    const email = str(body.email, 'email', { max: 200 })
    const username = str(body.username, 'usuario', { max: 32 })
    const password = typeof body.password === 'string' ? body.password : undefined

    // Un administrador no puede quitarse a sí mismo el acceso al panel: la
    // instancia nunca se quedaría sin nadie que la gestione.
    if (self && (isAdmin === 0 || disabled === 1)) {
      throw new HttpError(400, 'No puedes quitarte tus permisos ni deshabilitar tu propia cuenta')
    }

    if (email !== undefined) {
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Introduce un email válido')
      const other = findByEmail.get(email)
      if (other && other.id !== target.id) throw new HttpError(409, 'Ya existe una cuenta con ese email')
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, target.id)
    }
    if (username !== undefined) {
      if (!USERNAME_RE.test(username)) {
        throw new HttpError(400, 'El usuario debe tener entre 3 y 32 caracteres (letras, números, . _ -)')
      }
      const other = findByUsername.get(username)
      if (other && other.id !== target.id) throw new HttpError(409, 'Ese nombre de usuario ya está en uso')
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, target.id)
    }
    if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, target.id)
    if (isAdmin !== undefined) db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin, target.id)
    if (disabled !== undefined) db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled, target.id)

    if (password !== undefined) {
      if (password.length < 8) {
        throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres')
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), target.id)
    }

    // Al deshabilitar una cuenta o cambiar su contraseña se cierran sus sesiones.
    if (disabled === 1) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
    if (password !== undefined && !self) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
    }

    res.json({ user: adminUser(findById.get(target.id)) })
  })

  /** Elimina la cuenta y todo lo que depende de ella (tableros incluidos). */
  router.delete('/users/:id', (req, res) => {
    const target = findById.get(req.params.id)
    if (!target) throw new HttpError(404, 'Usuario no encontrado')
    if (target.id === req.user.id) throw new HttpError(400, 'No puedes eliminar tu propia cuenta')

    const ownedBoards = count(db, 'SELECT COUNT(*) AS total FROM boards WHERE owner_id = ?', target.id)
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id)
    res.json({ ok: true, deleted: { id: target.id, boards: ownedBoards } })
  })

  return router
}
