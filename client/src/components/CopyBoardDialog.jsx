import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon.jsx'

/**
 * Pregunta qué contenido acompañará a la copia del tablero. Las etiquetas y
 * columnas se copian siempre; las tarjetas son opcionales.
 */
export default function CopyBoardDialog({ board, onCancel, onCopy }) {
  const [includeCards, setIncludeCards] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()
  const choiceRef = useRef(null)

  const cardCount = board.lists.reduce((total, list) => total + list.cards.length, 0)

  useEffect(() => {
    choiceRef.current?.focus()
    const onKey = (event) => {
      if (event.key !== 'Escape' || busy) return
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onCancel])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onCopy(includeCards)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <form
        className="modal narrow copy-board-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="copy-board-head">
          <span className="copy-board-icon" aria-hidden="true">
            <Icon name="copy" size={20} />
          </span>
          <div>
            <h2 id={titleId}>Copiar tablero</h2>
            <p className="muted small">
              Se creará un tablero nuevo a partir de «{board.board.title}».
            </p>
          </div>
        </div>

        <ul className="copy-board-includes muted small">
          <li>
            <Icon name="check" size={13} />
            Se copiarán las etiquetas y las columnas.
          </li>
          <li>
            <Icon name="check" size={13} />
            Se conservará el fondo del tablero.
          </li>
        </ul>

        <label className="copy-board-choice">
          <input
            ref={choiceRef}
            type="checkbox"
            checked={includeCards}
            disabled={busy}
            onChange={(event) => setIncludeCards(event.target.checked)}
          />
          <span>
            <strong>Copiar también las tarjetas</strong>
            <span className="muted small">
              {cardCount === 0
                ? 'Este tablero no tiene tarjetas.'
                : `Se copiarán ${cardCount} tarjeta${cardCount === 1 ? '' : 's'} con sus etiquetas, enlaces y checklists.`}
            </span>
          </span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="row confirm-actions">
          <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            <Icon name="copy" size={14} />
            {busy ? 'Copiando…' : 'Copiar tablero'}
          </button>
        </div>
      </form>
    </div>
  )
}
