import { useState } from 'react'
import Avatar from './Avatar.jsx'
import { DUE_FILTERS } from '../lib/constants.js'

function MultiPicker({ title, items, selected, onToggle, render, empty }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="picker">
      <button type="button" className="btn ghost small" onClick={() => setOpen((v) => !v)}>
        {title}
        {selected.length > 0 && <span className="count">{selected.length}</span>}
      </button>
      {open && (
        <div className="popover">
          {items.length === 0 && <p className="muted small">{empty}</p>}
          {items.map((item) => (
            <label key={item.id} className="check-row">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => onToggle(item.id)}
              />
              {render(item)}
            </label>
          ))}
          <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}

export default function FilterBar({ filters, onChange, board, resultCount, totalCount }) {
  const active =
    filters.text || filters.due !== 'any' || filters.labelIds.length > 0 || filters.memberIds.length > 0

  const patch = (changes) => onChange({ ...filters, ...changes })
  const toggle = (key) => (id) =>
    patch({
      [key]: filters[key].includes(id) ? filters[key].filter((value) => value !== id) : [...filters[key], id],
    })

  return (
    <div className="filter-bar">
      <select value={filters.due} onChange={(event) => patch({ due: event.target.value })}>
        {DUE_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <MultiPicker
        title="Etiquetas"
        items={board.labels}
        selected={filters.labelIds}
        onToggle={toggle('labelIds')}
        empty="Este tablero no tiene etiquetas"
        render={(label) => (
          <span className="picker-label">
            <span className={`label-chip bg-${label.color}`}>{label.name || 'Sin nombre'}</span>
          </span>
        )}
      />

      <MultiPicker
        title="Miembros"
        items={board.members}
        selected={filters.memberIds}
        onToggle={toggle('memberIds')}
        empty="Sin miembros"
        render={(member) => (
          <span className="picker-member">
            <Avatar user={member} size={22} /> {member.name || member.username}
          </span>
        )}
      />

      {active && (
        <>
          <span className="muted small">
            {filters.text && <span className="filter-term">«{filters.text}» · </span>}
            {resultCount} de {totalCount} tarjetas
          </span>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => onChange({ text: '', due: 'any', labelIds: [], memberIds: [] })}
          >
            Limpiar filtros
          </button>
        </>
      )}
    </div>
  )
}

/** Aplica los filtros activos a una tarjeta. */
export function matchesFilters(card, filters, now = Date.now()) {
  const text = filters.text.trim().toLowerCase()
  if (text) {
    const haystack = `${card.title} ${card.description}`.toLowerCase()
    if (!haystack.includes(text)) return false
  }
  if (filters.labelIds.length > 0) {
    const ids = card.labels.map((label) => label.id)
    if (!filters.labelIds.some((id) => ids.includes(id))) return false
  }
  if (filters.memberIds.length > 0) {
    const ids = card.members.map((member) => member.id)
    if (!filters.memberIds.some((id) => ids.includes(id))) return false
  }
  if (filters.due !== 'any') {
    if (filters.due === 'none') return !card.dueDate
    if (!card.dueDate) return false
    const remaining = new Date(card.dueDate).getTime() - now
    if (filters.due === 'complete') return card.dueComplete
    if (card.dueComplete) return false
    if (filters.due === 'overdue') return remaining < 0
    if (filters.due === 'today') {
      const due = new Date(card.dueDate)
      const today = new Date()
      return (
        due.getFullYear() === today.getFullYear() &&
        due.getMonth() === today.getMonth() &&
        due.getDate() === today.getDate()
      )
    }
    if (filters.due === 'week') return remaining >= 0 && remaining <= 7 * 86400000
  }
  return true
}
