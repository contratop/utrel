import { useEffect } from 'react'
import Icon from './Icon.jsx'
import ActivityFeed from './ActivityFeed.jsx'

export default function BoardActivityDialog({ activity, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>Actividad del tablero</h2>
          <div className="modal-head-actions">
            <button
              className="btn ghost small"
              type="button"
              onClick={onClose}
              title="Cerrar (Esc)"
              aria-label="Cerrar"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>
        <p className="muted small">
          Últimas 15 actualizaciones del tablero, sus listas y sus tarjetas.
        </p>
        <ActivityFeed entries={activity} empty="Todavía no hay actualizaciones en este tablero." />
      </div>
    </div>
  )
}
