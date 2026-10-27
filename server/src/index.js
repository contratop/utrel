import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApp } from './app.js'
import { createDb } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../data')
const dbFile = process.env.DB_FILE || path.join(dataDir, 'utrel.db')
const uploadsDir = process.env.UPLOADS_DIR || path.join(dataDir, 'uploads')
const clientDist = process.env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist')
const port = Number(process.env.PORT || 4000)

fs.mkdirSync(uploadsDir, { recursive: true })

const db = createDb(dbFile)
const app = createApp({ db, uploadsDir })

if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, { index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
} else {
  console.warn('[utrel] No se encontró el cliente compilado. Ejecuta `npm run build` o usa `npm run dev`.')
}

const server = app.listen(port, () => {
  console.log(`[utrel] API en http://localhost:${port} (base de datos: ${dbFile})`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close()
      process.exit(0)
    })
  })
}
