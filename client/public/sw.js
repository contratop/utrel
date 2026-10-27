/* Service worker de Utrel: guarda el armazón de la app para que se abra al
   instante (y sin conexión) desde el acceso directo del iPad o del escritorio.
   La API y las imágenes subidas van siempre a la red: nada de datos viejos. */

const CACHE = 'utrel-v1'

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/brand/utrel-mark.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

function store(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return
  caches.open(CACHE).then((cache) => cache.put(request, response))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Datos y archivos subidos: siempre en vivo.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    return
  }

  // Navegación: primero la red (para no servir una versión antigua) y, si falla,
  // el armazón guardado; el resto son ficheros con hash y van de caché.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          store(request, response.clone())
          return response
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        store(request, response.clone())
        return response
      })
    })
  )
})
