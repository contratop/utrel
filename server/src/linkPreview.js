import dns from 'node:dns/promises'
import net from 'node:net'
import { badRequest } from './util.js'

/**
 * Lectura de metadatos de un enlace (título, favicon y miniatura) para la
 * sección «Enlace» de las tarjetas.
 *
 * El servidor es quien descarga la página para que el navegador no tropiece con
 * CORS ni exponga su IP a cada sitio enlazado. Como la URL la escribe el
 * usuario, se descartan destinos en redes privadas, se limita el tiempo de
 * espera, el tamaño de la respuesta y el número de redirecciones.
 */

const TIMEOUT_MS = 6000
const MAX_BYTES = 512 * 1024
const MAX_REDIRECTS = 4
const MAX_URL_LENGTH = 2000
const USER_AGENT = 'Mozilla/5.0 (compatible; UtrelLinkPreview/1.0)'
const YOUTUBE_ICON = 'https://www.youtube.com/favicon.ico'

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

/** Id del vídeo si la URL es de YouTube; null en cualquier otro caso. */
export function youtubeVideoId(value) {
  if (typeof value !== 'string') return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  const idOf = (candidate) => {
    const clean = String(candidate || '').trim()
    return /^[A-Za-z0-9_-]{11}$/.test(clean) ? clean : null
  }
  if (host === 'youtu.be') return idOf(url.pathname.slice(1).split('/')[0])
  if (!YOUTUBE_HOSTS.has(host)) return null
  if (url.pathname === '/watch') return idOf(url.searchParams.get('v'))
  const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
  return match ? idOf(match[1]) : null
}

/**
 * URL de un texto que en realidad es un enlace: acepta http(s)://… y dominios
 * sueltos con un TLD alfabético. Devuelve null si no parece un enlace.
 */
export function linkFromText(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || /\s/.test(text)) return null

  if (!/^https?:\/\//i.test(text)) {
    // Sin esquema solo se aceptan dominios con pinta de URL pegada: «www.» o
    // con ruta. Así títulos como «Node.js» no se confunden con un enlace.
    const domain = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i
    const looksLikeUrl = /^www\./i.test(text) || /\.[a-z]{2,}(?::\d+)?[/?#]/i.test(text)
    if (!domain.test(text) || !looksLikeUrl) return null
  }
  try {
    return normalizeLink(text)
  } catch {
    return null
  }
}

/** Valida y normaliza la URL que llega del cliente (añade https:// si falta). */
export function normalizeLink(value) {
  if (typeof value !== 'string') badRequest('El campo "enlace" debe ser texto')
  let raw = value.trim()
  if (!raw) badRequest('El campo "enlace" no puede estar vacío')
  if (raw.length > MAX_URL_LENGTH) {
    badRequest(`El campo "enlace" no puede superar ${MAX_URL_LENGTH} caracteres`)
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`

  let url
  try {
    url = new URL(raw)
  } catch {
    badRequest('El enlace no es una URL válida')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    badRequest('El enlace debe empezar por http:// o https://')
  }
  if (!url.hostname) badRequest('El enlace no es una URL válida')
  if (url.username || url.password) badRequest('El enlace no puede incluir credenciales')
  url.hash = ''
  return url.toString()
}

// ---------------------------------------------------------------- red privada

function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isBlockedIp(mapped[1])
    return false
  }
  return true
}

/** Lanza si el host apunta a localhost, una red privada o no se resuelve. */
async function assertPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('El enlace apunta a una red privada')
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('El enlace apunta a una red privada')
    return
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error('El enlace apunta a una red privada')
  }
}

// ------------------------------------------------------------------ descarga

async function readLimited(response) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      try {
        await reader.cancel()
      } catch {
        /* la respuesta ya no importa */
      }
      break
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** GET con redirecciones controladas: cada salto vuelve a comprobar el host. */
async function fetchText(rawUrl, accept) {
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = new URL(current)
    await assertPublicHost(target.hostname)

    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Redirección sin destino')
      const next = new URL(location, current)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new Error('Redirección no permitida')
      }
      current = next.toString()
      continue
    }
    if (!response.ok) throw new Error(`El enlace respondió con ${response.status}`)
    return { text: await readLimited(response), url: current }
  }
  throw new Error('Demasiadas redirecciones')
}

async function fetchJson(rawUrl) {
  const { text, url } = await fetchText(rawUrl, 'application/json')
  return { data: JSON.parse(text), url }
}

// -------------------------------------------------------------- HTML a datos

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
}

function decodeEntities(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
    if (code[0] === '#') {
      const point =
        code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      if (!Number.isFinite(point) || point > 0x10ffff) return all
      try {
        return String.fromCodePoint(point)
      } catch {
        return all
      }
    }
    return ENTITIES[code.toLowerCase()] ?? all
  })
}

function attributes(tag) {
  const result = {}
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let match
  while ((match = pattern.exec(tag))) {
    result[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? '')
  }
  return result
}

function absoluteHttpUrl(value, base) {
  if (!value) return null
  try {
    const url = new URL(value, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

function metaValue(meta, keys) {
  for (const key of keys) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Extrae título, miniatura, favicon y nombre del sitio del HTML descargado. */
function parseHtml(html, pageUrl) {
  const meta = {}
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = attributes(tag)
    const key = (attrs.property || attrs.name || '').toLowerCase()
    if (key && attrs.content) meta[key] = attrs.content
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = metaValue(meta, ['og:title', 'twitter:title']) ||
    (titleTag ? decodeEntities(titleTag[1]).replace(/\s+/g, ' ').trim() : '')

  const image = absoluteHttpUrl(
    metaValue(meta, ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src']),
    pageUrl
  )

  const icons = []
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attrs = attributes(tag)
    if (attrs.href && (attrs.rel || '').toLowerCase().includes('icon')) icons.push(attrs.href)
  }
  const origin = new URL(pageUrl).origin
  let icon = null
  for (const href of icons) {
    icon = absoluteHttpUrl(href, pageUrl)
    if (icon) break
  }
  if (!icon) icon = `${origin}/favicon.ico`

  const site = metaValue(meta, ['og:site_name', 'application-name']) ||
    new URL(pageUrl).hostname.replace(/^www\./, '')

  return { title: title.slice(0, 300), image, icon, site: site.slice(0, 120) }
}

// ---------------------------------------------------------------- YouTube

async function youtubePreview(url, videoId) {
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  try {
    const { data } = await fetchJson(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
    )
    const title = typeof data.title === 'string' ? data.title : ''
    const image = absoluteHttpUrl(data.thumbnail_url, url) || thumbnail
    return { title: title.slice(0, 300), image, icon: YOUTUBE_ICON, site: 'YouTube' }
  } catch {
    // Un fallo de oEmbed no debe romper el guardado: queda la miniatura del
    // vídeo y el título de la tarjeta se mantiene.
    return { title: '', image: thumbnail, icon: YOUTUBE_ICON, site: 'YouTube' }
  }
}

// ------------------------------------------------------------------ público

/**
 * Devuelve los metadatos del enlace o, si no se puede leer la página, un
 * objeto sin título ni imágenes para que la URL se guarde igualmente.
 */
export async function fetchLinkPreview(url) {
  const hostname = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  })()

  try {
    const videoId = youtubeVideoId(url)
    if (videoId) return await youtubePreview(url, videoId)
    const { text, url: finalUrl } = await fetchText(url, 'text/html,application/xhtml+xml')
    const preview = parseHtml(text, finalUrl)
    return {
      title: preview.title,
      image: preview.image,
      icon: preview.icon,
      site: preview.site,
    }
  } catch {
    return { title: '', image: null, icon: null, site: hostname }
  }
}
