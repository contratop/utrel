import { useEffect, useRef } from 'react'

/** ¿El evento lo provocó esta misma pestaña? Entonces ya está aplicado en pantalla. */
export function isOwnChange(payload, clientId) {
  return Boolean(clientId && payload && payload.origin === clientId)
}

function parse(data) {
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

/**
 * Mantiene el tablero sincronizado con el servidor: escucha el flujo de eventos
 * del tablero y avisa cuando otro dispositivo (u otra pestaña) cambió algo.
 * El navegador reconecta solo si se cae la conexión.
 */
export function useBoardLive({ boardId, clientId, onChange, onDeleted }) {
  const handlers = useRef({ onChange, onDeleted })
  handlers.current = { onChange, onDeleted }

  useEffect(() => {
    if (!boardId || typeof window === 'undefined' || typeof window.EventSource !== 'function') {
      return undefined
    }

    const source = new window.EventSource(`/api/boards/${encodeURIComponent(boardId)}/events`)
    let ready = false

    const handleChange = (event) => {
      const payload = parse(event.data)
      if (isOwnChange(payload, clientId)) return
      if (payload && payload.kind === 'deleted') handlers.current.onDeleted?.()
      else handlers.current.onChange?.()
    }

    const handleOpen = () => {
      // Al reconectar pueden haberse perdido cambios: recarga por si acaso.
      if (ready) handlers.current.onChange?.()
      ready = true
    }

    source.addEventListener('change', handleChange)
    source.addEventListener('open', handleOpen)

    return () => {
      source.removeEventListener('change', handleChange)
      source.removeEventListener('open', handleOpen)
      source.close()
    }
  }, [boardId, clientId])
}
