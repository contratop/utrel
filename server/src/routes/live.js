import { Router } from 'express'
import { requireBoard } from '../util.js'

/**
 * Flujo de eventos de un tablero (`text/event-stream`): los clientes lo abren
 * con EventSource y reciben un aviso cada vez que alguien cambia el tablero.
 */
export function liveRoutes(db, hub) {
  const router = Router()

  router.get('/boards/:id/events', (req, res) => {
    const boardId = req.params.id
    requireBoard(db, req.user.id, boardId)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Evita que nginx y similares acumulen el flujo en un búfer.
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders?.()

    hub.subscribe(boardId, res)
    res.write(`event: hello\ndata: ${JSON.stringify({ boardId, user: req.user.username })}\n\n`)
    res.write(': conectado\n\n')

    req.on('close', () => hub.unsubscribe(boardId, res))
  })

  return router
}
