import crypto from 'node:crypto'

export const uid = () => crypto.randomUUID()
export const iso = () => new Date().toISOString()

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const badRequest = (msg) => {
  throw new HttpError(400, msg)
}
export const notFound = (msg = 'Recurso no encontrado') => {
  throw new HttpError(404, msg)
}
export const forbidden = (msg = 'Sin permiso') => {
  throw new HttpError(403, msg)
}

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent']
export const LABEL_COLORS = [
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'gray',
]
export const BOARD_BACKGROUNDS = ['aurora', 'ocean', 'sunset', 'forest', 'berry', 'graphite']

export function str(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined || value === null) {
    if (required) badRequest(`El campo "${field}" es obligatorio`)
    return undefined
  }
  if (typeof value !== 'string') badRequest(`El campo "${field}" debe ser texto`)
  const trimmed = value.trim()
  if (required && !trimmed) badRequest(`El campo "${field}" no puede estar vacío`)
  if (trimmed.length > max) badRequest(`El campo "${field}" no puede superar ${max} caracteres`)
  return trimmed
}

export function bool(value, field) {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') badRequest(`El campo "${field}" debe ser booleano`)
  return value ? 1 : 0
}

const UPLOADED_IMAGE = /^\/uploads\/[A-Za-z0-9-]+\.(png|jpe?g|webp|gif|avif)$/
const REMOTE_IMAGE = /^https?:\/\/[^\s"'<>]+$/i

/** Imagen de fondo: null para quitarla, o una URL subida / remota http(s). */
export function imageRef(value, field) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') badRequest(`El campo "${field}" debe ser una URL de imagen`)
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > 2000) badRequest(`El campo "${field}" no puede superar 2000 caracteres`)
  if (UPLOADED_IMAGE.test(trimmed) || REMOTE_IMAGE.test(trimmed)) return trimmed
  badRequest(`El campo "${field}" debe ser una imagen subida o una URL http(s)`)
}

/** Fecha ISO o null. Acepta cadenas ISO y fechas "YYYY-MM-DD". */
export function optionalDate(value, field) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string') badRequest(`El campo "${field}" debe ser una fecha`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) badRequest(`El campo "${field}" no es una fecha válida`)
  return date.toISOString()
}

// ---------------------------------------------------------------- permisos

export function boardRole(db, userId, boardId) {
  const row = db
    .prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(boardId, userId)
  return row ? row.role : null
}

/** Verifica acceso al tablero. Devuelve el rol o lanza 404/403. */
export function requireBoard(db, userId, boardId, roles = ['owner', 'member']) {
  const role = boardRole(db, userId, boardId)
  if (!role) notFound('Tablero no encontrado')
  if (!roles.includes(role)) forbidden('No tienes permiso para esta acción en el tablero')
  return role
}

export function boardIdOfList(db, listId) {
  const row = db.prepare('SELECT board_id FROM lists WHERE id = ?').get(listId)
  if (!row) notFound('Lista no encontrada')
  return row.board_id
}

export function boardIdOfCard(db, cardId) {
  const row = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId)
  if (!row) notFound('Tarjeta no encontrada')
  return row.board_id
}

export function boardIdOfChecklist(db, checklistId) {
  const row = db
    .prepare(
      'SELECT c.board_id AS board_id FROM checklists cl JOIN cards c ON c.id = cl.card_id WHERE cl.id = ?'
    )
    .get(checklistId)
  if (!row) notFound('Checklist no encontrado')
  return row.board_id
}

export function boardIdOfItem(db, itemId) {
  const row = db
    .prepare(
      `SELECT c.board_id AS board_id FROM checklist_items ci
       JOIN checklists cl ON cl.id = ci.checklist_id
       JOIN cards c ON c.id = cl.card_id
      WHERE ci.id = ?`
    )
    .get(itemId)
  if (!row) notFound('Elemento no encontrado')
  return row.board_id
}

export function boardIdOfComment(db, commentId) {
  const row = db
    .prepare('SELECT c.board_id AS board_id FROM comments co JOIN cards c ON c.id = co.card_id WHERE co.id = ?')
    .get(commentId)
  if (!row) notFound('Comentario no encontrado')
  return row.board_id
}

export function boardIdOfLabel(db, labelId) {
  const row = db.prepare('SELECT board_id FROM labels WHERE id = ?').get(labelId)
  if (!row) notFound('Etiqueta no encontrada')
  return row.board_id
}

// ---------------------------------------------------------------- posiciones

export function maxPosition(db, sql, ...params) {
  const row = db.prepare(sql).get(...params)
  const max = row && row.max_position ? row.max_position : 0
  return max + 1000
}

/** Reordena una tarjeta dentro de una lista (o la mueve a otra). */
export function reorderCard(db, cardId, targetListId, targetIndex) {
  const siblings = db
    .prepare('SELECT id FROM cards WHERE list_id = ? AND archived = 0 AND id <> ? ORDER BY position ASC, rowid ASC')
    .all(targetListId, cardId)
  const index = Math.max(0, Math.min(Number(targetIndex) || 0, siblings.length))
  const ordered = [...siblings.slice(0, index).map((r) => r.id), cardId, ...siblings.slice(index).map((r) => r.id)]
  const update = db.prepare('UPDATE cards SET list_id = ?, position = ?, updated_at = ? WHERE id = ?')
  const stamp = iso()
  const run = db.transaction(() => {
    ordered.forEach((id, i) => update.run(targetListId, (i + 1) * 1000, stamp, id))
  })
  run()
}

/** Reordena una lista dentro de un tablero. */
export function reorderList(db, listId, targetIndex) {
  const row = db.prepare('SELECT board_id FROM lists WHERE id = ?').get(listId)
  if (!row) notFound('Lista no encontrada')
  const siblings = db
    .prepare('SELECT id FROM lists WHERE board_id = ? AND archived = 0 AND id <> ? ORDER BY position ASC, rowid ASC')
    .all(row.board_id, listId)
  const index = Math.max(0, Math.min(Number(targetIndex) || 0, siblings.length))
  const ordered = [...siblings.slice(0, index).map((r) => r.id), listId, ...siblings.slice(index).map((r) => r.id)]
  const update = db.prepare('UPDATE lists SET position = ? WHERE id = ?')
  const run = db.transaction(() => {
    ordered.forEach((id, i) => update.run((i + 1) * 1000, id))
  })
  run()
}

/** Reordena un elemento de checklist dentro de su checklist. */
export function reorderItem(db, itemId, targetIndex) {
  const row = db.prepare('SELECT checklist_id FROM checklist_items WHERE id = ?').get(itemId)
  if (!row) notFound('Elemento no encontrado')
  const siblings = db
    .prepare('SELECT id FROM checklist_items WHERE checklist_id = ? AND id <> ? ORDER BY position ASC, rowid ASC')
    .all(row.checklist_id, itemId)
  const index = Math.max(0, Math.min(Number(targetIndex) || 0, siblings.length))
  const ordered = [...siblings.slice(0, index).map((r) => r.id), itemId, ...siblings.slice(index).map((r) => r.id)]
  const update = db.prepare('UPDATE checklist_items SET position = ? WHERE id = ?')
  const run = db.transaction(() => {
    ordered.forEach((id, i) => update.run((i + 1) * 1000, id))
  })
  run()
}
