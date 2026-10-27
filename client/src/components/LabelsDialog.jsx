import { useState } from 'react'
import { api } from '../api.js'
import { LABEL_COLORS, LABEL_COLOR_NAMES } from '../lib/constants.js'

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
          <button className="btn ghost small" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="stack">
          {board.labels.map((label) => (
            <div key={label.id} className="label-row">
              <span className={`label-chip bg-${label.color}`}>{LABEL_COLOR_NAMES[label.color]}</span>
              <input
                defaultValue={label.name}
                placeholder="Nombre de la etiqueta"
                onBlur={(event) => {
                  const name = event.target.value.trim()
                  if (name !== label.name) run(() => api.patch(`/labels/${label.id}`, { name }))
                }}
              />
              <select
                value={label.color}
                onChange={(event) => run(() => api.patch(`/labels/${label.id}`, { color: event.target.value }))}
              >
                {LABEL_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {LABEL_COLOR_NAMES[color]}
                  </option>
                ))}
              </select>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => run(() => api.del(`/labels/${label.id}`))}
              >
                ✕
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
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <select value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })}>
            {LABEL_COLORS.map((color) => (
              <option key={color} value={color}>
                {LABEL_COLOR_NAMES[color]}
              </option>
            ))}
          </select>
          <button className="btn primary small" type="submit">
            Añadir
          </button>
        </form>
      </div>
    </div>
  )
}
