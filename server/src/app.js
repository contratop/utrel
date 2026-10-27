import path from 'node:path'
import express from 'express'
import { requireAdmin, requireAuth, sessionMiddleware } from './auth.js'
import { MUTATING_METHODS, changeForRequest, createLiveHub } from './live.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { boardRoutes } from './routes/boards.js'
import { cardRoutes } from './routes/cards.js'
import { liveRoutes } from './routes/live.js'
import { uploadRoutes } from './routes/uploads.js'
import { HttpError } from './util.js'

export function createApp({
  db,
  uploadsDir = path.resolve('data/uploads'),
  live = createLiveHub(),
}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))
  app.use(sessionMiddleware(db))
  app.locals.live = live

  // Imágenes subidas (fondos de tablero y portadas de tarjeta).
  app.use('/uploads', express.static(uploadsDir, { index: false, maxAge: '30d', immutable: true }))

  const api = express.Router()
  api.get('/health', (_req, res) => res.json({ ok: true, service: 'utrel' }))

  // Cambios en vivo: cuando una petición que modifica un tablero termina bien,
  // se avisa al resto de dispositivos que lo tienen abierto.
  api.use((req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next()
    res.on('finish', () => {
      if (res.statusCode >= 300) return
      const change = changeForRequest(db, req)
      if (!change) return
      live.publish(change.boardId, {
        kind: change.kind,
        origin: req.get('x-client-id') || null,
        actor: req.user ? req.user.id : null,
      })
    })
    next()
  })

  api.use('/auth', authRoutes(db))
  api.use('/admin', requireAuth, requireAdmin, adminRoutes(db))
  api.use('/', requireAuth, uploadRoutes(uploadsDir))
  api.use('/', requireAuth, liveRoutes(db, live))
  api.use('/', requireAuth, boardRoutes(db))
  api.use('/', requireAuth, cardRoutes(db))
  app.use('/api', api)

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')))

  // Sirve el cliente compilado cuando existe (imagen Docker o `npm run build`).
  app.use((err, _req, res, _next) => {
    const status = err instanceof HttpError ? err.status : err.status || 500
    if (status >= 500) console.error(err)
    res.status(status).json({ error: err.message || 'Error interno del servidor' })
  })

  return app
}
