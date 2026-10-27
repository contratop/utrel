import {
  boardIdOfCard,
  boardIdOfChecklist,
  boardIdOfComment,
  boardIdOfItem,
  boardIdOfLabel,
  boardIdOfList,
} from './util.js'

/**
 * Canales de eventos por tablero para que varios dispositivos vean los cambios
 * casi en vivo. Se usa Server-Sent Events: sin dependencias, con reconexión
 * automática en el navegador y con el mismo login por cookie que la API.
 */

export const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/** Recursos que cuelgan de un tablero: la primera parte de la ruta y su id. */
const RESOLVERS = {
  lists: boardIdOfList,
  cards: boardIdOfCard,
  checklists: boardIdOfChecklist,
  'checklist-items': boardIdOfItem,
  comments: boardIdOfComment,
  labels: boardIdOfLabel,
}

const boardExists = (db, id) => !!db.prepare('SELECT 1 FROM boards WHERE id = ?').get(id)

/**
 * Traduce una petición ya servida a un cambio de tablero.
 * Devuelve `{ boardId, kind }` o `null` si la ruta no afecta a ningún tablero.
 */
export function changeForRequest(db, req) {
  const [resource, id] = String(req.path || '')
    .split('/')
    .filter(Boolean)
  if (!resource || !id) return null

  try {
    if (resource === 'boards') {
      // El tablero borrado ya no existe cuando termina la respuesta.
      if (req.method === 'DELETE') return { boardId: id, kind: 'deleted' }
      return boardExists(db, id) ? { boardId: id, kind: 'change' } : null
    }
    const resolve = RESOLVERS[resource]
    if (!resolve) return null
    const boardId = resolve(db, id)
    return boardId ? { boardId, kind: 'change' } : null
  } catch {
    // El recurso desapareció: no hay nada que anunciar.
    return null
  }
}

export function createLiveHub({ heartbeatMs = 25000 } = {}) {
  /** boardId -> Set<res> con las conexiones abiertas de ese tablero. */
  const channels = new Map()

  function drop(boardId, res) {
    const subscribers = channels.get(boardId)
    if (!subscribers) return
    subscribers.delete(res)
    if (subscribers.size === 0) channels.delete(boardId)
  }

  function subscribe(boardId, res) {
    if (!channels.has(boardId)) channels.set(boardId, new Set())
    channels.get(boardId).add(res)
  }

  /** Avisa a todos los que tengan ese tablero abierto. Devuelve cuántos recibieron el aviso. */
  function publish(boardId, event = {}) {
    const subscribers = channels.get(boardId)
    if (!subscribers || subscribers.size === 0) return 0
    const frame = `event: change\ndata: ${JSON.stringify({
      boardId,
      at: new Date().toISOString(),
      ...event,
    })}\n\n`

    let delivered = 0
    for (const res of [...subscribers]) {
      try {
        res.write(frame)
        delivered += 1
      } catch {
        drop(boardId, res)
      }
    }
    return delivered
  }

  // Latido para que proxies y navegadores no cierren la conexión inactiva.
  const heartbeat = setInterval(() => {
    for (const [boardId, subscribers] of channels) {
      for (const res of subscribers) {
        try {
          res.write(': keep-alive\n\n')
        } catch {
          drop(boardId, res)
        }
      }
    }
  }, heartbeatMs)
  heartbeat.unref?.()

  return {
    publish,
    subscribe,
    unsubscribe: drop,
    subscriberCount: (boardId) => (channels.get(boardId)?.size || 0),
    close() {
      clearInterval(heartbeat)
      for (const [boardId, subscribers] of channels) {
        for (const res of subscribers) {
          try {
            res.end()
          } catch {
            /* ya cerrada */
          }
          drop(boardId, res)
        }
      }
      channels.clear()
    },
  }
}
