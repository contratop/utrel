import { useEffect, useId, useRef } from 'react'
import Icon from './Icon.jsx'

/**
 * Confirmación dentro de la app, con el mismo aspecto que el resto de modales.
 * Sustituye a `window.confirm`, que además de romper la estética bloquea la
 * pestaña y no se puede cerrar con Escape de forma controlada.
 */
export default function ConfirmDialog({
  title = 'Confirmar acción',
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  danger = true,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    confirmRef.current?.focus()
    // En captura para que Escape no cierre también lo que hay debajo (la
    // tarjeta abierta, por ejemplo).
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div className="modal-backdrop confirm-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="confirm-icon" aria-hidden="true">
          <Icon name={danger ? 'trash' : 'alert'} size={20} />
        </span>
        <div className="confirm-body">
          <h2 id={titleId}>{title}</h2>
          {message && <p className="muted">{message}</p>}
        </div>
        <div className="row confirm-actions">
          <button className="btn ghost" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={`btn ${danger ? 'danger' : 'primary'}`}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
