import { useEffect, useMemo, useRef } from 'react'
import Avatar from './Avatar.jsx'
import FilterBar, { matchesFilters } from './FilterBar.jsx'
import Icon from './Icon.jsx'
import { PRIORITY_LABEL } from '../lib/constants.js'
import { dueStatus, dueStatusLabel, formatDueShort } from '../lib/dueDate.js'

/**
 * Buscador del tablero: un modal casi a pantalla completa donde las tarjetas
 * que coinciden con el texto y los filtros aparecen mientras se escribe.
 * Abrir un resultado lleva a la tarjeta; al cerrar se limpian los filtros.
 */
export default function SearchDialog({ board, filters, onChange, onClose, onOpenCard }) {
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { results, total } = useMemo(() => {
    const rows = board.lists.flatMap((list) =>
      list.cards.map((card) => ({ card, listTitle: list.title }))
    )
    return { results: rows.filter(({ card }) => matchesFilters(card, filters)), total: rows.length }
  }, [board, filters])

  return (
    <div className="modal-backdrop search-backdrop" onClick={onClose}>
      <div
        className="modal search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en el tablero"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="search-modal-head">
          <span className="search-modal-icon" aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            data-search-input
            className="search-input"
            placeholder="Buscar tarjetas por título o descripción…"
            value={filters.text}
            onChange={(event) => onChange({ ...filters, text: event.target.value })}
            autoFocus
          />
          <button
            className="btn ghost small"
            type="button"
            onClick={onClose}
            title="Cerrar búsqueda (Esc)"
            aria-label="Cerrar búsqueda"
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <FilterBar
          filters={filters}
          onChange={onChange}
          board={board}
          resultCount={results.length}
          totalCount={total}
        />

        {results.length === 0 ? (
          <p className="muted search-empty">Ninguna tarjeta coincide con la búsqueda.</p>
        ) : (
          <div className="search-results" data-search-results>
            {results.map(({ card, listTitle }) => {
              const status = dueStatus(card.dueDate, card.dueComplete)
              const hasChecklist = card.checklist.total > 0
              return (
                <button
                  key={card.id}
                  type="button"
                  className="search-result"
                  data-result-id={card.id}
                  onClick={() => onOpenCard(card.id)}
                >
                  {card.labels.length > 0 && (
                    <span className="label-chips">
                      {card.labels.map((label) => (
                        <span key={label.id} className={`label-chip bg-${label.color}`} title={label.name}>
                          {label.name}
                        </span>
                      ))}
                    </span>
                  )}

                  <span className="search-result-title">{card.title}</span>

                  <span className="search-result-meta">
                    <span className="search-result-list" title={`Lista: ${listTitle}`}>
                      {listTitle}
                    </span>
                    {card.dueDate && (
                      <span className={`pill due-${status}`} title={dueStatusLabel(card.dueDate, card.dueComplete)}>
                        {formatDueShort(card.dueDate)}
                      </span>
                    )}
                    {card.priority !== 'none' && (
                      <span className={`pill priority-${card.priority}`}>{PRIORITY_LABEL[card.priority]}</span>
                    )}
                    {hasChecklist && (
                      <span className="pill checklist-badge" title="Checklist">
                        <Icon name="list-checks" size={11} />
                        {card.checklist.done}/{card.checklist.total}
                      </span>
                    )}
                    {card.members.length > 0 && (
                      <span className="avatar-row search-result-members">
                        {card.members.map((member) => (
                          <Avatar key={member.id} user={member} size={20} />
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
