/**
 * Lógica de vencimientos (due date) compartida por tablero, calendario y detalle.
 *
 * Reglas de color:
 *   - vencida (ya pasó)          -> morado  ('overdue')
 *   - queda 1 día o menos        -> rojo    ('urgent')
 *   - quedan 3 días o menos      -> naranja ('soon')
 *   - más de 3 días / sin fecha  -> neutro  ('later' / 'none')
 *   - marcada como completada    -> verde   ('complete')
 */

export const DAY_MS = 86400000

export const DUE_STATUSES = ['none', 'complete', 'overdue', 'urgent', 'soon', 'later']

export const DUE_STATUS_LABEL = {
  none: 'Sin fecha de vencimiento',
  complete: 'Vencimiento completado',
  overdue: 'Vencida',
  urgent: 'Vence en menos de 1 día',
  soon: 'Vence en menos de 3 días',
  later: 'Programada',
}

/** Convierte ISO / 'YYYY-MM-DD' en Date. Las fechas sin hora se llevan al final del día local. */
export function parseDue(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, 23, 59, 59, 999)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function dueStatus(dueDate, dueComplete = false, now = Date.now()) {
  const due = parseDue(dueDate)
  if (!due) return 'none'
  if (dueComplete) return 'complete'
  const remaining = due.getTime() - now
  if (remaining < 0) return 'overdue'
  if (remaining <= DAY_MS) return 'urgent'
  if (remaining <= 3 * DAY_MS) return 'soon'
  return 'later'
}

export function dueStatusLabel(dueDate, dueComplete = false, now = Date.now()) {
  return DUE_STATUS_LABEL[dueStatus(dueDate, dueComplete, now)]
}

/** Días (con fracción) que quedan hasta el vencimiento; negativo si ya pasó. */
export function daysRemaining(dueDate, now = Date.now()) {
  const due = parseDue(dueDate)
  if (!due) return null
  return (due.getTime() - now) / DAY_MS
}

export function formatDue(value) {
  const due = parseDue(value)
  if (!due) return ''
  return due.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDueShort(value) {
  const due = parseDue(value)
  if (!due) return ''
  const sameYear = due.getFullYear() === new Date().getFullYear()
  return due.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** ISO -> valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(value) {
  const due = parseDue(value)
  if (!due) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(
    due.getMinutes()
  )}`
}

/** Valor de <input type="datetime-local"> -> ISO en UTC. */
export function fromLocalInput(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const isSameDay = (a, b) => {
  const dateA = parseDue(a)
  const dateB = b instanceof Date ? b : parseDue(b)
  if (!dateA || !dateB) return false
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}
