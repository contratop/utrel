import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { PRIORITY_LABEL } from '../lib/constants.js'
import { cardCover } from '../lib/backgrounds.js'
import { isYoutubeLink } from '../lib/links.js'
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
  const checklistPercent = hasChecklist
    ? Math.round((card.checklist.done / card.checklist.total) * 100)
    : 0
  const youtubeLink = isYoutubeLink(card.link?.url)
  const cover = cardCover(card)

  return (
    <article
      className={`card-item${dragging ? ' dragging' : ''}${cover?.kind === 'image' ? ' has-image' : ''}`}
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
      {cover?.kind === 'image' && <div className="card-cover image" style={cover.style} />}
      {cover?.kind === 'color' && <div className={`card-cover bg-${cover.color}`} />}

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
              className={`due-toggle card-due-toggle due-${status}`}
              onClick={(event) => {
                event.stopPropagation()
                onToggleDue?.()
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {card.dueComplete && <Icon name="check" size={12} strokeWidth={3} />}
            </button>
          )}

          <p className="card-title">{card.title}</p>
        </div>

        <div className="card-badges">
          {card.link?.url && (
            <span
              className={`icon-badge${youtubeLink ? ' youtube-badge' : ' link-badge'}`}
              title={youtubeLink ? 'Enlace de YouTube' : card.link.url}
            >
              <Icon name={youtubeLink ? 'youtube' : 'link'} size={13} />
            </span>
          )}
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
              <Icon name="align-left" size={12} />
            </span>
          )}
          {hasChecklist && (
            <span
              className={`pill checklist-badge${checklistDone ? ' checklist-done' : ''}`}
              title={`Checklist: ${card.checklist.done} de ${card.checklist.total}`}
            >
              <Icon name="list-checks" size={12} />
              <span>{card.checklist.done}/{card.checklist.total}</span>
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="icon-badge" title={`${card.commentCount} comentario(s)`}>
              <Icon name="message" size={12} />
              <span>{card.commentCount}</span>
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

        {hasChecklist && (
          <div
            className={`card-progress${checklistDone ? ' complete' : ''}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={card.checklist.total}
            aria-valuenow={card.checklist.done}
            aria-valuetext={`${checklistPercent}% completado`}
            aria-label={`Progreso del checklist: ${card.checklist.done} de ${card.checklist.total}`}
            title={`Checklist: ${card.checklist.done} de ${card.checklist.total}`}
          >
            <div className="card-progress-track">
              <div className="card-progress-fill" style={{ width: `${checklistPercent}%` }} />
            </div>
            <span className="card-progress-percent" aria-hidden="true">{checklistPercent}%</span>
          </div>
        )}
      </div>
    </article>
  )
}
