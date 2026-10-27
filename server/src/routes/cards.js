import { Router } from 'express'
import { cardPayload } from '../payload.js'
import {
  HttpError,
  LABEL_COLORS,
  PRIORITIES,
  boardIdOfCard,
  boardIdOfChecklist,
  boardIdOfComment,
  boardIdOfItem,
  boardIdOfList,
  bool,
  imageRef,
  iso,
  maxPosition,
  notFound,
  optionalDate,
  reorderCard,
  reorderItem,
  requireBoard,
  str,
  uid,
} from '../util.js'

export function cardRoutes(db) {
  const router = Router()

  const getCard = (id) => {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id)
    if (!card) notFound('Tarjeta no encontrada')
    return card
  }

  // ----------------------------------------------------------------- tarjetas

  router.post('/lists/:id/cards', (req, res) => {
    const boardId = boardIdOfList(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const body = req.body || {}
    const title = str(body.title, 'título', { required: true, max: 500 })
    const position = maxPosition(
      db,
      'SELECT MAX(position) AS max_position FROM cards WHERE list_id = ?',
      req.params.id
    )
    const id = uid()
    const stamp = iso()
    db.prepare(
      `INSERT INTO cards (id, board_id, list_id, title, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, boardId, req.params.id, title, position, stamp, stamp)
    res.status(201).json({ card: cardPayload(db, id), board: boardId })
  })

  router.get('/cards/:id', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    res.json({ card: cardPayload(db, req.params.id) })
  })

  router.patch('/cards/:id', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    const body = req.body || {}

    const title = str(body.title, 'título', { max: 500 })
    const description =
      body.description === undefined ? undefined : str(body.description, 'descripción', { max: 20000 })
    const dueDate = optionalDate(body.dueDate, 'fecha de vencimiento')
    const dueComplete = bool(body.dueComplete, 'dueComplete')
    const archived = bool(body.archived, 'archived')

    let priority
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) throw new HttpError(400, 'Prioridad no válida')
      priority = body.priority
    }

    let coverColor
    if (body.coverColor !== undefined) {
      if (body.coverColor !== null && !LABEL_COLORS.includes(body.coverColor)) {
        throw new HttpError(400, 'Color de portada no válido')
      }
      coverColor = body.coverColor
    }

    const coverImage = imageRef(body.coverImage, 'imagen de portada')

    db.prepare(
      `UPDATE cards SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         due_date = CASE WHEN ? = 1 THEN ? ELSE due_date END,
         due_complete = COALESCE(?, due_complete),
         priority = COALESCE(?, priority),
         cover_color = CASE WHEN ? = 1 THEN ? ELSE cover_color END,
         cover_image = CASE WHEN ? = 1 THEN ? ELSE cover_image END,
         archived = COALESCE(?, archived),
         updated_at = ?
       WHERE id = ?`
    ).run(
      title ?? null,
      description ?? null,
      dueDate === undefined ? 0 : 1,
      dueDate === undefined ? null : dueDate,
      dueComplete ?? null,
      priority ?? null,
      coverColor === undefined ? 0 : 1,
      coverColor === undefined ? null : coverColor,
      coverImage === undefined ? 0 : 1,
      coverImage === undefined ? null : coverImage,
      archived ?? null,
      iso(),
      req.params.id
    )

    if (body.listId !== undefined) {
      const targetBoardId = boardIdOfList(db, body.listId)
      if (targetBoardId !== card.board_id) {
        throw new HttpError(400, 'La lista de destino pertenece a otro tablero')
      }
      reorderCard(db, req.params.id, body.listId, body.targetIndex ?? 0)
    } else if (body.targetIndex !== undefined) {
      reorderCard(db, req.params.id, card.list_id, body.targetIndex)
    }

    res.json({ card: cardPayload(db, req.params.id) })
  })

  router.delete('/cards/:id', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  })

  // ------------------------------------------------------- etiquetas en tarjeta

  router.post('/cards/:id/labels', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    const labelId = str((req.body || {}).labelId, 'labelId', { required: true })
    const label = db.prepare('SELECT * FROM labels WHERE id = ? AND board_id = ?').get(labelId, card.board_id)
    if (!label) notFound('Etiqueta no encontrada en este tablero')
    db.prepare('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)').run(
      req.params.id,
      labelId
    )
    res.status(201).json({ card: cardPayload(db, req.params.id) })
  })

  router.delete('/cards/:id/labels/:labelId', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    db.prepare('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?').run(
      req.params.id,
      req.params.labelId
    )
    res.json({ card: cardPayload(db, req.params.id) })
  })

  // -------------------------------------------------------- miembros en tarjeta

  router.post('/cards/:id/members', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    const userId = str((req.body || {}).userId, 'userId', { required: true })
    const isMember = db
      .prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?')
      .get(card.board_id, userId)
    if (!isMember) throw new HttpError(400, 'Ese usuario no pertenece al tablero')
    db.prepare('INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)').run(
      req.params.id,
      userId
    )
    res.status(201).json({ card: cardPayload(db, req.params.id) })
  })

  router.delete('/cards/:id/members/:userId', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    db.prepare('DELETE FROM card_members WHERE card_id = ? AND user_id = ?').run(
      req.params.id,
      req.params.userId
    )
    res.json({ card: cardPayload(db, req.params.id) })
  })

  // ----------------------------------------------------------------- checklists

  router.post('/cards/:id/checklists', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    const title = str((req.body || {}).title, 'título', { max: 120 }) || 'Checklist'
    const position = maxPosition(
      db,
      'SELECT MAX(position) AS max_position FROM checklists WHERE card_id = ?',
      req.params.id
    )
    db.prepare('INSERT INTO checklists (id, card_id, title, position) VALUES (?, ?, ?, ?)').run(
      uid(),
      req.params.id,
      title,
      position
    )
    res.status(201).json({ card: cardPayload(db, req.params.id) })
  })

  router.patch('/checklists/:id', (req, res) => {
    const boardId = boardIdOfChecklist(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const title = str((req.body || {}).title, 'título', { max: 120 })
    if (title !== undefined) {
      db.prepare('UPDATE checklists SET title = ? WHERE id = ?').run(title, req.params.id)
    }
    const cardId = db.prepare('SELECT card_id FROM checklists WHERE id = ?').get(req.params.id)
    res.json({ card: cardPayload(db, cardId.card_id) })
  })

  router.delete('/checklists/:id', (req, res) => {
    const boardId = boardIdOfChecklist(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const row = db.prepare('SELECT card_id FROM checklists WHERE id = ?').get(req.params.id)
    db.prepare('DELETE FROM checklists WHERE id = ?').run(req.params.id)
    res.json({ card: cardPayload(db, row.card_id) })
  })

  router.post('/checklists/:id/items', (req, res) => {
    const boardId = boardIdOfChecklist(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const text = str((req.body || {}).text, 'texto', { required: true, max: 500 })
    const position = maxPosition(
      db,
      'SELECT MAX(position) AS max_position FROM checklist_items WHERE checklist_id = ?',
      req.params.id
    )
    db.prepare(
      'INSERT INTO checklist_items (id, checklist_id, text, position, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(uid(), req.params.id, text, position, iso())
    const row = db.prepare('SELECT card_id FROM checklists WHERE id = ?').get(req.params.id)
    res.status(201).json({ card: cardPayload(db, row.card_id) })
  })

  router.patch('/checklist-items/:id', (req, res) => {
    const boardId = boardIdOfItem(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const body = req.body || {}
    const text = str(body.text, 'texto', { max: 500 })
    const done = bool(body.done, 'done')

    db.prepare('UPDATE checklist_items SET text = COALESCE(?, text), done = COALESCE(?, done) WHERE id = ?').run(
      text ?? null,
      done ?? null,
      req.params.id
    )
    if (body.targetIndex !== undefined) reorderItem(db, req.params.id, body.targetIndex)

    const row = db
      .prepare('SELECT checklist_id FROM checklist_items WHERE id = ?')
      .get(req.params.id)
    const checklist = db.prepare('SELECT card_id FROM checklists WHERE id = ?').get(row.checklist_id)
    res.json({ card: cardPayload(db, checklist.card_id) })
  })

  router.delete('/checklist-items/:id', (req, res) => {
    const boardId = boardIdOfItem(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const row = db.prepare('SELECT checklist_id FROM checklist_items WHERE id = ?').get(req.params.id)
    const checklist = db.prepare('SELECT card_id FROM checklists WHERE id = ?').get(row.checklist_id)
    db.prepare('DELETE FROM checklist_items WHERE id = ?').run(req.params.id)
    res.json({ card: cardPayload(db, checklist.card_id) })
  })

  // ----------------------------------------------------------------- comentarios

  router.post('/cards/:id/comments', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    const bodyText = str((req.body || {}).body, 'comentario', { required: true, max: 10000 })
    const stamp = iso()
    db.prepare(
      'INSERT INTO comments (id, card_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uid(), req.params.id, req.user.id, bodyText, stamp, stamp)
    db.prepare('UPDATE cards SET updated_at = ? WHERE id = ?').run(stamp, req.params.id)
    res.status(201).json({ card: cardPayload(db, req.params.id) })
  })

  router.patch('/comments/:id', (req, res) => {
    const boardId = boardIdOfComment(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id)
    if (comment.user_id !== req.user.id) throw new HttpError(403, 'Solo el autor puede editar el comentario')
    const bodyText = str((req.body || {}).body, 'comentario', { required: true, max: 10000 })
    db.prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?').run(
      bodyText,
      iso(),
      req.params.id
    )
    res.json({ card: cardPayload(db, comment.card_id) })
  })

  router.delete('/comments/:id', (req, res) => {
    const boardId = boardIdOfComment(db, req.params.id)
    const role = requireBoard(db, req.user.id, boardId)
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id)
    if (comment.user_id !== req.user.id && role !== 'owner') {
      throw new HttpError(403, 'Solo el autor o el propietario del tablero pueden borrar el comentario')
    }
    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id)
    res.json({ card: cardPayload(db, comment.card_id) })
  })

  return router
}

export const CARD_COVER_COLORS = LABEL_COLORS
