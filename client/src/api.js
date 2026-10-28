import { clientId } from './lib/clientId.js'

const BASE = '/api'

async function request(method, path, body) {
  const options = { method, credentials: 'same-origin', headers: { 'X-Client-Id': clientId() } }
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, options)
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const error = new Error((data && data.error) || `Error ${res.status}`)
    error.status = res.status
    throw error
  }
  return data
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']

/** Sube una imagen a /uploads y devuelve { url, size }. */
async function postImage(file) {
  // application/json lo consumiría el parser JSON del servidor antes que el de
  // binarios: la imagen conserva su tipo para que el servidor verifique la firma.
  const contentType = file.type === 'application/json' ? 'application/octet-stream' : file.type
  const res = await fetch(`${BASE}/uploads`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': contentType, 'X-Client-Id': clientId() },
    body: file,
  })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`)
  return data
}

/** Sube una imagen y devuelve su URL pública (/uploads/…). */
export async function uploadImage(file) {
  if (!file) throw new Error('Selecciona una imagen')
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error('Formato no soportado. Usa PNG, JPEG, WebP, GIF o AVIF.')
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('La imagen no puede superar los 8 MB')
  return postImage(file)
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path),
  upload: uploadImage,
}
