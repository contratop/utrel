import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { formatDateTime } from '../lib/dueDate.js'

/**
 * Últimas actualizaciones de un tablero o de una tarjeta. El servidor ya
 * limita la lista a 15 entradas.
 */
export default function ActivityFeed({ entries, empty = 'Todavía no hay actividad.' }) {
  if (!entries || entries.length === 0) return <p className="muted small">{empty}</p>

  return (
    <ul className="activity-list">
      {entries.map((entry) => (
        <li key={entry.id} className="activity-item">
          {entry.user ? (
            <Avatar user={entry.user} size={26} />
          ) : (
            <span className="activity-actor-icon" aria-hidden="true">
              <Icon name="history" size={13} />
            </span>
          )}
          <div className="activity-body">
            <p>
              <strong>{entry.user ? entry.user.name || entry.user.username : 'Alguien'}</strong>{' '}
              {entry.message}
            </p>
            <span className="muted small">{formatDateTime(entry.createdAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
