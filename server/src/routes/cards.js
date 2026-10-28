import { Router } from 'express'
import { fetchLinkPreview, linkFromText, normalizeLink, youtubeVideoId } from '../linkPreview.js'
import { boardPayload, cardPayload } from '../payload.js'
import {
  COVER_POSITIONS,
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
  logActivity,
  maxPosition,
  moveItem,
  notFound,
  optionalDate,
  reorderCard,
  reorderChecklist,
  reorderItem,
  requireBoard,
  str,
  uid,
} from '../util.js'

export function cardRoutes(db, { previewLink = fetchLinkPreview } = {}) {
  const router = Router()

  const getCard = (id) => {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id)
    if (!card) notFound('Tarjeta no encontrada')
    return card
  }

  // ----------------------------------------------------------------- tarjetas

  router.post('/lists/:id/cards', async (req, res) => {
    const boardId = boardIdOfList(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const body = req.body || {}

    // Si el título es un enlace, la tarjeta nace con sus metadatos: nombre de
    // la página o vídeo, enlace y miniatura como banner.
    const rawTitle = typeof body.title === 'string' ? body.title.trim() : ''
    const link = linkFromText(rawTitle)
    const preview = link ? await previewLink(link) : null
    const title = link
      ? preview && preview.title
        ? preview.title.replace(/\s+/g, ' ').trim().slice(0, 100)
        : rawTitle.slice(0, 500)
      : str(body.title, 'título', { required: true, max: 500 })
    const position = maxPosition(
      db,
      'SELECT MAX(position) AS max_position FROM cards WHERE list_id = ?',
      req.params.id
    )
    const id = uid()
    const stamp = iso()
    db.prepare(
      `INSERT INTO cards (
         id, board_id, list_id, title, cover_image,
         link, link_title, link_image, link_icon, link_site,
         position, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      boardId,
      req.params.id,
      title,
      link && preview && preview.image ? preview.image : null,
      link,
      link && preview && preview.title ? preview.title : null,
      link && preview && preview.image ? preview.image : null,
      link && preview && preview.icon ? preview.icon : null,
      link && preview && preview.site ? preview.site : null,
      position,
      stamp,
      stamp
    )
    logActivity(db, {
      boardId,
      cardId: id,
      userId: req.user.id,
      kind: 'card',
      message: 'creó la tarjeta',
    })
    const list = db.prepare('SELECT title FROM lists WHERE id = ?').get(req.params.id)
    logActivity(db, {
      boardId,
      userId: req.user.id,
      kind: 'board',
      message: `creó la tarjeta «${title}»${list ? ` en «${list.title}»` : ''}`,
    })
    res.status(201).json({ card: cardPayload(db, id), board: boardId })
  })

  router.get('/cards/:id', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    res.json({ card: cardPayload(db, req.params.id) })
  })

  router.patch('/cards/:id', async (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    const body = req.body || {}

    let title = str(body.title, 'título', { max: 500 })
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

    let coverPosition
    if (body.coverPosition !== undefined) {
      if (!COVER_POSITIONS.includes(body.coverPosition)) {
        throw new HttpError(400, 'Posición de la imagen no válida')
      }
      coverPosition = body.coverPosition
    }

    const coverImage = imageRef(body.coverImage, 'imagen de portada')

    let link
    if (body.link !== undefined) {
      link = body.link === null || body.link === '' ? null : normalizeLink(body.link)
    }

    // La vista previa se descarga antes de guardar: si el enlace es de YouTube,
    // el título del vídeo pasa a ser el de la tarjeta.
    let preview = null
    if (link) {
      preview = await previewLink(link)
      if (youtubeVideoId(link) && preview && preview.title) {
        title = preview.title.replace(/\s+/g, ' ').trim().slice(0, 100)
      }
    }
    const linkMeta =
      link === undefined
        ? undefined
        : {
            title: link && preview && preview.title ? preview.title : null,
            image: link && preview && preview.image ? preview.image : null,
            icon: link && preview && preview.icon ? preview.icon : null,
            site: link && preview && preview.site ? preview.site : null,
          }

    db.prepare(
      `UPDATE cards SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         due_date = CASE WHEN ? = 1 THEN ? ELSE due_date END,
         due_complete = COALESCE(?, due_complete),
         priority = COALESCE(?, priority),
         cover_color = CASE WHEN ? = 1 THEN ? ELSE cover_color END,
         cover_image = CASE WHEN ? = 1 THEN ? ELSE cover_image END,
         cover_position = COALESCE(?, cover_position),
         link = CASE WHEN ? = 1 THEN ? ELSE link END,
         link_title = CASE WHEN ? = 1 THEN ? ELSE link_title END,
         link_image = CASE WHEN ? = 1 THEN ? ELSE link_image END,
         link_icon = CASE WHEN ? = 1 THEN ? ELSE link_icon END,
         link_site = CASE WHEN ? = 1 THEN ? ELSE link_site END,
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
      coverPosition ?? null,
      link === undefined ? 0 : 1,
      link === undefined ? null : link,
      linkMeta === undefined ? 0 : 1,
      linkMeta ? linkMeta.title : null,
      linkMeta === undefined ? 0 : 1,
      linkMeta ? linkMeta.image : null,
      linkMeta === undefined ? 0 : 1,
      linkMeta ? linkMeta.icon : null,
      linkMeta === undefined ? 0 : 1,
      linkMeta ? linkMeta.site : null,
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

    const logCard = (message) =>
      logActivity(db, {
        boardId: card.board_id,
        cardId: card.id,
        userId: req.user.id,
        kind: 'card',
        message,
      })
    const logBoard = (message) =>
      logActivity(db, {
        boardId: card.board_id,
        userId: req.user.id,
        kind: 'board',
        message,
      })

    if (title !== undefined && title !== card.title) {
      logCard(`cambió el título a «${title}»`)
    }
    if (description !== undefined && description !== card.description) {
      logCard('actualizó la descripción')
    }
    if (dueDate !== undefined && dueDate !== card.due_date) {
      logCard(dueDate === null ? 'quitó la fecha de vencimiento' : 'cambió la fecha de vencimiento')
    }
    if (dueComplete !== undefined && dueComplete !== card.due_complete) {
      logCard(dueComplete ? 'marcó la fecha como completada' : 'desmarcó la fecha completada')
    }
    if (priority !== undefined && priority !== card.priority) {
      logCard('cambió la prioridad')
    }
    if (
      (coverColor !== undefined && coverColor !== card.cover_color) ||
      (coverImage !== undefined && coverImage !== card.cover_image) ||
      (coverPosition !== undefined && coverPosition !== (card.cover_position || 'center'))
    ) {
      logCard('cambió la portada')
    }
    if (link !== undefined && link !== card.link) {
      logCard(link ? 'añadió un enlace a la tarjeta' : 'quitó el enlace de la tarjeta')
    }
    if (archived !== undefined && archived !== card.archived) {
      logCard(archived ? 'archivó la tarjeta' : 'restauró la tarjeta')
      logBoard(`${archived ? 'archivó' : 'restauró'} la tarjeta «${card.title}»`)
    }
    if (body.listId !== undefined && body.listId !== card.list_id) {
      const list = db.prepare('SELECT title FROM lists WHERE id = ?').get(body.listId)
      logCard(`movió la tarjeta a «${list ? list.title : 'otra lista'}»`)
      logBoard(`movió la tarjeta «${card.title}» a «${list ? list.title : 'otra lista'}»`)
    }

    res.json({ card: cardPayload(db, req.params.id) })
  })

  // Archiva de una vez todas las tarjetas de una lista.
  router.post('/lists/:id/cards/archive', (req, res) => {
    const boardId = boardIdOfList(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const list = db.prepare('SELECT title FROM lists WHERE id = ?').get(req.params.id)
    const cards = db
      .prepare('SELECT id FROM cards WHERE list_id = ? AND archived = 0')
      .all(req.params.id)

    if (cards.length > 0) {
      const stamp = iso()
      const update = db.prepare('UPDATE cards SET archived = 1, updated_at = ? WHERE id = ?')
      db.transaction(() => cards.forEach((card) => update.run(stamp, card.id)))()
      logActivity(db, {
        boardId,
        userId: req.user.id,
        kind: 'board',
        message: `archivó ${cards.length === 1 ? 'la única tarjeta' : `las ${cards.length} tarjetas`} de la lista «${list.title}»`,
      })
    }

    res.json(boardPayload(db, boardId))
  })

  router.delete('/cards/:id', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    logActivity(db, {
      boardId: card.board_id,
      userId: req.user.id,
      kind: 'board',
      message: `eliminó la tarjeta «${card.title}»`,
    })
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
    const added = db
      .prepare('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)')
      .run(req.params.id, labelId)
    if (added.changes > 0) {
      logActivity(db, {
        boardId: card.board_id,
        cardId: card.id,
        userId: req.user.id,
        kind: 'card',
        message: `añadió la etiqueta «${label.name || label.color}»`,
      })
    }
    res.status(201).json({ card: cardPayload(db, req.params.id) })
  })

  router.delete('/cards/:id/labels/:labelId', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    const label = db
      .prepare('SELECT name, color FROM labels WHERE id = ? AND board_id = ?')
      .get(req.params.labelId, card.board_id)
    const removed = db
      .prepare('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?')
      .run(req.params.id, req.params.labelId)
    if (removed.changes > 0 && label) {
      logActivity(db, {
        boardId: card.board_id,
        cardId: card.id,
        userId: req.user.id,
        kind: 'card',
        message: `quitó la etiqueta «${label.name || label.color}»`,
      })
    }
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
    const assigned = db
      .prepare('INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)')
      .run(req.params.id, userId)
    if (assigned.changes > 0) {
      const target = db.prepare('SELECT username FROM users WHERE id = ?').get(userId)
      logActivity(db, {
        boardId: card.board_id,
        cardId: card.id,
        userId: req.user.id,
        kind: 'card_member',
        message: `asignó a @${target.username} a la tarjeta`,
      })
    }
    res.status(201).json({ card: cardPayload(db, req.params.id) })
  })

  router.delete('/cards/:id/members/:userId', (req, res) => {
    const card = getCard(req.params.id)
    requireBoard(db, req.user.id, card.board_id)
    const removed = db
      .prepare('DELETE FROM card_members WHERE card_id = ? AND user_id = ?')
      .run(req.params.id, req.params.userId)
    if (removed.changes > 0) {
      const target = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.userId)
      logActivity(db, {
        boardId: card.board_id,
        cardId: card.id,
        userId: req.user.id,
        kind: 'card_member',
        message: `quitó a @${target.username} de la tarjeta`,
      })
    }
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
    logActivity(db, {
      boardId: card.board_id,
      cardId: card.id,
      userId: req.user.id,
      kind: 'card',
      message: `añadió el checklist «${title}»`,
    })
    res.status(201).json({ card: cardPayload(db, req.params.id) })
  })

  router.patch('/checklists/:id', (req, res) => {
    const boardId = boardIdOfChecklist(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const body = req.body || {}
    const title = str(body.title, 'título', { max: 120 })
    const row = db
      .prepare('SELECT card_id, title FROM checklists WHERE id = ?')
      .get(req.params.id)
    if (title !== undefined) {
      db.prepare('UPDATE checklists SET title = ? WHERE id = ?').run(title, req.params.id)
      if (title !== row.title) {
        logActivity(db, {
          boardId,
          cardId: row.card_id,
          userId: req.user.id,
          kind: 'card',
          message: `renombró el checklist «${row.title}» a «${title}»`,
        })
      }
    }
    if (body.targetIndex !== undefined) reorderChecklist(db, req.params.id, body.targetIndex)
    res.json({ card: cardPayload(db, row.card_id) })
  })

  router.delete('/checklists/:id', (req, res) => {
    const boardId = boardIdOfChecklist(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const row = db.prepare('SELECT card_id, title FROM checklists WHERE id = ?').get(req.params.id)
    db.prepare('DELETE FROM checklists WHERE id = ?').run(req.params.id)
    logActivity(db, {
      boardId,
      cardId: row.card_id,
      userId: req.user.id,
      kind: 'card',
      message: `eliminó el checklist «${row.title}»`,
    })
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
    const row = db
      .prepare('SELECT card_id, title FROM checklists WHERE id = ?')
      .get(req.params.id)
    logActivity(db, {
      boardId,
      cardId: row.card_id,
      userId: req.user.id,
      kind: 'card',
      message: `añadió un elemento al checklist «${row.title}»`,
    })
    res.status(201).json({ card: cardPayload(db, row.card_id) })
  })

  router.patch('/checklist-items/:id', (req, res) => {
    const boardId = boardIdOfItem(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const body = req.body || {}
    const text = str(body.text, 'texto', { max: 500 })
    const done = bool(body.done, 'done')

    const row = db
      .prepare('SELECT checklist_id, text, done FROM checklist_items WHERE id = ?')
      .get(req.params.id)
    if (!row) notFound('Elemento no encontrado')
    const checklist = db
      .prepare('SELECT card_id, title FROM checklists WHERE id = ?')
      .get(row.checklist_id)

    // Solo se admiten movimientos dentro de la misma tarjeta: el detalle se
    // recarga como un todo y mezclar tarjetas dejaría la vista a medias.
    let targetChecklistId
    if (body.checklistId !== undefined) {
      if (typeof body.checklistId !== 'string') {
        throw new HttpError(400, 'El campo "checklistId" debe ser texto')
      }
      const target = db.prepare('SELECT card_id FROM checklists WHERE id = ?').get(body.checklistId)
      if (!target) notFound('Checklist de destino no encontrado')
      if (target.card_id !== checklist.card_id) {
        throw new HttpError(400, 'Solo puedes mover elementos entre checklists de la misma tarjeta')
      }
      targetChecklistId = body.checklistId
    }

    db.prepare('UPDATE checklist_items SET text = COALESCE(?, text), done = COALESCE(?, done) WHERE id = ?').run(
      text ?? null,
      done ?? null,
      req.params.id
    )
    if (targetChecklistId !== undefined) moveItem(db, req.params.id, targetChecklistId, body.targetIndex)
    else if (body.targetIndex !== undefined) reorderItem(db, req.params.id, body.targetIndex)

    const logCard = (message) =>
      logActivity(db, {
        boardId,
        cardId: checklist.card_id,
        userId: req.user.id,
        kind: 'card',
        message,
      })
    if (targetChecklistId !== undefined && targetChecklistId !== row.checklist_id) {
      const target = db.prepare('SELECT title FROM checklists WHERE id = ?').get(targetChecklistId)
      logCard(`movió un elemento a «${target ? target.title : 'otro checklist'}»`)
    } else if (text !== undefined && text !== row.text) {
      logCard(`editó un elemento del checklist «${checklist.title}»`)
    }
    if (done !== undefined && done !== row.done) {
      logCard(
        `${done ? 'completó' : 'desmarcó'} un elemento del checklist «${checklist.title}»`
      )
    }

    res.json({ card: cardPayload(db, checklist.card_id) })
  })

  router.delete('/checklist-items/:id', (req, res) => {
    const boardId = boardIdOfItem(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const row = db
      .prepare('SELECT checklist_id, text FROM checklist_items WHERE id = ?')
      .get(req.params.id)
    const checklist = db
      .prepare('SELECT card_id, title FROM checklists WHERE id = ?')
      .get(row.checklist_id)
    db.prepare('DELETE FROM checklist_items WHERE id = ?').run(req.params.id)
    logActivity(db, {
      boardId,
      cardId: checklist.card_id,
      userId: req.user.id,
      kind: 'card',
      message: `eliminó un elemento del checklist «${checklist.title}»`,
    })
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
    logActivity(db, {
      boardId: card.board_id,
      cardId: card.id,
      userId: req.user.id,
      kind: 'card',
      message: 'comentó en la tarjeta',
    })
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
    logActivity(db, {
      boardId,
      cardId: comment.card_id,
      userId: req.user.id,
      kind: 'card',
      message: 'editó un comentario',
    })
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
    logActivity(db, {
      boardId,
      cardId: comment.card_id,
      userId: req.user.id,
      kind: 'card',
      message: 'eliminó un comentario',
    })
    res.json({ card: cardPayload(db, comment.card_id) })
  })

  return router
}

export const CARD_COVER_COLORS = LABEL_COLORS
