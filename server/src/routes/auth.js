import { Router } from 'express'
import {
  createSession,
  destroySession,
  hashPassword,
  publicUser,
  requireAuth,
  validateCredentials,
  verifyPassword,
} from '../auth.js'
import { promoteFirstUserIfNoAdmin } from '../db.js'
import { allowRegistration } from '../settings.js'
import { HttpError, imageRef, str, uid } from '../util.js'

export function authRoutes(db) {
  const router = Router()
  const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?')
  const findByUsername = db.prepare('SELECT * FROM users WHERE username = ?')
  const findById = db.prepare('SELECT * FROM users WHERE id = ?')
  const insertUser = db.prepare(
    'INSERT INTO users (id, email, username, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const countUsers = db.prepare('SELECT COUNT(*) AS total FROM users')

  /** ¿Instancia recién desplegada, todavía sin usuarios? */
  const isEmpty = () => countUsers.get().total === 0

  /** Configuración pública que el cliente necesita antes de iniciar sesión. */
  router.get('/config', (_req, res) => {
    res.json({ allowRegistration: allowRegistration(db), needsSetup: isEmpty() })
  })

  router.post('/register', (req, res) => {
    // En una instancia sin usuarios la única cuenta posible es la del
    // administrador, y tiene que poder crearse aunque el registro público esté
    // cerrado: si no, no habría manera de entrar la primera vez.
    if (!allowRegistration(db) && !isEmpty()) {
      throw new HttpError(403, 'El registro de nuevos usuarios está deshabilitado')
    }
    const body = req.body || {}
    const { email, username, password, name } = validateCredentials({
      email: body.email,
      username: body.username,
      password: body.password,
      name: body.name,
    })
    if (findByEmail.get(email)) throw new HttpError(409, 'Ya existe una cuenta con ese email')
    if (findByUsername.get(username)) throw new HttpError(409, 'Ese nombre de usuario ya está en uso')

    const id = uid()
    insertUser.run(id, email, username, name, hashPassword(password), new Date().toISOString())
    // El primer usuario de la instancia es su administrador absoluto.
    promoteFirstUserIfNoAdmin(db, id)
    createSession(db, res, id)
    res.status(201).json({ user: publicUser(findById.get(id)) })
  })

  router.post('/login', (req, res) => {
    const body = req.body || {}
    const identifier = str(body.identifier || body.email || body.username, 'usuario', { required: true })
    const password = typeof body.password === 'string' ? body.password : ''
    const user = findByIdentifier(identifier)
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Usuario o contraseña incorrectos')
    }
    if (user.disabled) {
      throw new HttpError(403, 'Tu cuenta está deshabilitada. Habla con el administrador.')
    }
    createSession(db, res, user.id)
    res.json({ user: publicUser(user) })
  })

  router.post('/logout', (req, res) => {
    destroySession(db, req, res)
    res.json({ ok: true })
  })

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user })
  })

  router.patch('/me', requireAuth, (req, res) => {
    const body = req.body || {}
    const username = str(body.username, 'usuario')
    const name = str(body.name, 'nombre', { max: 80 })
    const currentPassword = body.currentPassword
    const newPassword = body.newPassword
    const avatar = imageRef(body.avatar, 'foto de perfil')

    if (username && username !== req.user.username) {
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
        throw new HttpError(400, 'El usuario debe tener entre 3 y 32 caracteres (letras, números, . _ -)')
      }
      if (findByUsername.get(username)) throw new HttpError(409, 'Ese nombre de usuario ya está en uso')
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id)
    }
    if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id)
    if (avatar !== undefined) {
      db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id)
    }

    if (newPassword !== undefined) {
      const stored = findById.get(req.user.id)
      if (!verifyPassword(String(currentPassword || ''), stored.password_hash)) {
        throw new HttpError(400, 'La contraseña actual no es correcta')
      }
      if (String(newPassword).length < 8) {
        throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres')
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(String(newPassword)),
        req.user.id
      )
    }

    res.json({ user: publicUser(findById.get(req.user.id)) })
  })

  /** Búsqueda de usuarios para añadirlos a un tablero. */
  router.get('/users', requireAuth, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (q.length < 2) return res.json({ users: [] })
    const like = `%${q.replace(/[%_]/g, '')}%`
    const users = db
      .prepare(
        `SELECT id, username, name, email, avatar FROM users
          WHERE id <> ? AND (username LIKE ? OR name LIKE ? OR email LIKE ?)
          ORDER BY username LIMIT 10`
      )
      .all(req.user.id, like, like, like)
    res.json({ users })
  })

  return router

  function findByIdentifier(identifier) {
    return findByEmail.get(identifier) || findByUsername.get(identifier) || null
  }
}
