import Avatar from './Avatar.jsx'
import { PRIORITY_LABEL } from '../lib/constants.js'
import { coverImageStyle } from '../lib/backgrounds.js'
import { dueStatus, dueStatusLabel, formatDue } from '../lib/dueDate.js'

export default function CardItem({
  card,
  onOpen,
  onToggleDue,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onContextMenu,
  dragging,
}) {
  const status = dueStatus(card.dueDate, card.dueComplete)
  const hasChecklist = card.checklist.total > 0
  const checklistDone = hasChecklist && card.checklist.done === card.checklist.total
  const coverStyle = coverImageStyle(card)

  return (
    <article
      className={`card-item${dragging ? ' dragging' : ''}${coverStyle ? ' has-image' : ''}`}
      data-card-id={card.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onContextMenu={onContextMenu}
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen()
      }}
    >
      {coverStyle && <div className="card-cover image" style={coverStyle} />}
      {!coverStyle && card.coverColor && <div className={`card-cover bg-${card.coverColor}`} />}

      <div className="card-body">
        {card.labels.length > 0 && (
          <div className="label-chips">
            {card.labels.map((label) => (
              <span key={label.id} className={`label-chip bg-${label.color}`} title={label.name}>
                {label.name}
              </span>
            ))}
          </div>
        )}

        <div className="card-title-row">
          {/* Solo en las tarjetas con fecha: se marca como completada sin abrirla. */}
          {card.dueDate && (
            <button
              type="button"
              role="checkbox"
              aria-checked={!!card.dueComplete}
              aria-label={card.dueComplete ? 'Marcar como pendiente' : 'Marcar como completada'}
              title={card.dueComplete ? 'Marcar como pendiente' : 'Marcar como completada'}
              className={`card-due-toggle due-${status}`}
              onClick={(event) => {
                event.stopPropagation()
                onToggleDue?.()
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {card.dueComplete && <span aria-hidden="true">✓</span>}
            </button>
          )}

          <p className="card-title">{card.title}</p>
        </div>

        <div className="card-badges">
          {card.priority !== 'none' && (
            <span
              className={`pill priority-${card.priority}`}
              title={`Prioridad: ${PRIORITY_LABEL[card.priority]}`}
            >
              {PRIORITY_LABEL[card.priority]}
            </span>
          )}
          {card.dueDate && (
            <span className={`pill due-${status}`} title={dueStatusLabel(card.dueDate, card.dueComplete)}>
              {formatDue(card.dueDate)}
            </span>
          )}
          {card.description && (
            <span className="icon-badge" title="Tiene descripción">
              ≡
            </span>
          )}
          {hasChecklist && (
            <span className={`pill checklist${checklistDone ? ' checklist-done' : ''}`} title="Checklist">
              ☑ {card.checklist.done}/{card.checklist.total}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="icon-badge" title={`${card.commentCount} comentario(s)`}>
              💬 {card.commentCount}
            </span>
          )}
          {card.members.length > 0 && (
            <span className="avatar-row card-members">
              {card.members.map((member) => (
                <Avatar key={member.id} user={member} size={22} />
              ))}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
