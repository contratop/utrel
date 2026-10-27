import fs from 'node:fs'
import path from 'node:path'
import express, { Router } from 'express'
import { HttpError, uid } from '../util.js'

/** Formatos aceptados para fondos de tablero y portadas de tarjeta. */
const IMAGE_TYPES = {
  'image/png': { ext: 'png', matches: (buf) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', matches: (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  'image/gif': { ext: 'gif', matches: (buf) => buf.subarray(0, 4).toString('ascii') === 'GIF8' },
  'image/webp': {
    ext: 'webp',
    matches: (buf) => buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'image/avif': {
    ext: 'avif',
    matches: (buf) => buf.subarray(4, 8).toString('ascii') === 'ftyp' && buf.subarray(8, 12).toString('ascii') === 'avif',
  },
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export function uploadRoutes(uploadsDir) {
  const router = Router()

  router.post(
    '/uploads',
    express.raw({ type: Object.keys(IMAGE_TYPES), limit: MAX_IMAGE_BYTES }),
    (req, res) => {
      const mime = String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase()
      const type = IMAGE_TYPES[mime]
      if (!type) {
        throw new HttpError(415, 'Formato no soportado. Usa PNG, JPEG, WebP, GIF o AVIF.')
      }
      const body = req.body
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new HttpError(400, 'La imagen está vacía o supera los 8 MB')
      }
      if (!type.matches(body)) {
        throw new HttpError(400, 'El archivo no parece una imagen válida')
      }

      fs.mkdirSync(uploadsDir, { recursive: true })
      const name = `${uid()}.${type.ext}`
      fs.writeFileSync(path.join(uploadsDir, name), body)
      res.status(201).json({ url: `/uploads/${name}`, size: body.length })
    }
  )

  return router
}
