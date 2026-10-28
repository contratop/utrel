import { useState } from 'react'
import { api } from '../api.js'
import Icon from './Icon.jsx'
import ColorSelect from './ColorSelect.jsx'
import { LABEL_COLORS } from '../lib/constants.js'

export default function LabelsDialog({ board, onClose, onBoardChange }) {
  const [form, setForm] = useState({ name: '', color: LABEL_COLORS[0] })
  const [error, setError] = useState('')

  async function run(action) {
    try {
      const data = await action()
      if (data && data.board) onBoardChange(data)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Etiquetas del tablero</h2>
          <button className="btn ghost small" type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar">
            <Icon name="x" size={15} />
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="stack">
          {board.labels.map((label) => (
            <div key={label.id} className="label-row">
              <input
                defaultValue={label.name}
                placeholder="Nombre de la etiqueta"
                aria-label={`Nombre de la etiqueta ${label.name}`}
                onBlur={(event) => {
                  const name = event.target.value.trim()
                  if (name !== label.name) run(() => api.patch(`/labels/${label.id}`, { name }))
                }}
              />
              <ColorSelect
                label={`Color de ${label.name || 'la etiqueta'}`}
                title="Color de la etiqueta"
                value={label.color}
                onPick={(color) => {
                  if (color && color !== label.color) run(() => api.patch(`/labels/${label.id}`, { color }))
                }}
              />
              <button
                className="btn ghost small"
                type="button"
                title={`Eliminar «${label.name}»`}
                aria-label={`Eliminar la etiqueta ${label.name}`}
                onClick={() => run(() => api.del(`/labels/${label.id}`))}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          {board.labels.length === 0 && <p className="muted small">No hay etiquetas todavía.</p>}
        </div>

        <form
          className="label-row"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!form.name.trim()) return
            await run(() => api.post(`/boards/${board.board.id}/labels`, form))
            setForm({ name: '', color: LABEL_COLORS[0] })
          }}
        >
          <input
            placeholder="Nueva etiqueta"
            aria-label="Nombre de la nueva etiqueta"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <ColorSelect
            label="Color de la nueva etiqueta"
            title="Color de la nueva etiqueta"
            value={form.color}
            onPick={(color) => setForm({ ...form, color: color || LABEL_COLORS[0] })}
          />
          <button className="btn primary small" type="submit">
            Añadir
          </button>
        </form>
      </div>
    </div>
  )
}
