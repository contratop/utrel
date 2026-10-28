/** Utilidades para detectar enlaces de YouTube y mostrar su información. */

/**
 * Id del vídeo si la URL es de YouTube (watch, youtu.be, shorts, embed o live);
 * null en cualquier otro caso. La URL puede llegar sin protocolo.
 */
export function youtubeVideoId(value) {
  if (typeof value !== 'string') return null
  let url
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`)
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
  if (
    host !== 'youtube.com' &&
    host !== 'www.youtube.com' &&
    host !== 'm.youtube.com' &&
    host !== 'music.youtube.com' &&
    host !== 'youtube-nocookie.com' &&
    host !== 'www.youtube-nocookie.com'
  ) {
    return null
  }
  if (url.pathname === '/watch') return idOf(url.searchParams.get('v'))
  const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
  return match ? idOf(match[1]) : null
}

export const isYoutubeLink = (value) => youtubeVideoId(value) !== null

/** Dominio visible de un enlace, sin el prefijo www. */
export function linkHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
