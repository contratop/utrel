import crypto from 'node:crypto'
import { HttpError } from './util.js'

const SESSION_COOKIE = 'utrel_session'
const SESSION_DAYS = 30
const KEY_LEN = 64

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const candidate = crypto.scryptSync(password, salt, KEY_LEN)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}

export function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

function cookieValue(token, maxAgeSeconds) {
  const secure = process.env.COOKIE_SECURE === 'true'
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function createSession(db, res, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000)
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now.toISOString(),
    expires.toISOString()
  )
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString())
  res.setHeader('Set-Cookie', cookieValue(token, SESSION_DAYS * 86400))
  return token
}

export function destroySession(db, req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.setHeader('Set-Cookie', cookieValue('', 0))
}

/** Datos públicos de un usuario (los que viajan al cliente). */
export const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  username: row.username,
  name: row.name,
  avatar: row.avatar || null,
  isAdmin: !!row.is_admin,
})

/** Middleware: adjunta req.user si hay una sesión válida. */
export function sessionMiddleware(db) {
  const find = db.prepare(
    `SELECT u.id, u.email, u.username, u.name, u.avatar, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ? AND u.disabled = 0`
  )
  return (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (token) {
      const user = find.get(token, new Date().toISOString())
      if (user) req.user = publicUser(user)
    }
    next()
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Necesitas iniciar sesión'))
  next()
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Necesitas iniciar sesión'))
  if (!req.user.isAdmin) return next(new HttpError(403, 'Solo el administrador puede acceder'))
  next()
}

export function validateCredentials({ email, username, password, name }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Introduce un email válido')
  }
  if (!username || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    throw new HttpError(400, 'El usuario debe tener entre 3 y 32 caracteres (letras, números, . _ -)')
  }
  if (!password || password.length < 8) {
    throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres')
  }
  return { email, username, name: name || username, password }
}
