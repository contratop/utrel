import { Router } from 'express'
import { boardPayload, memberList } from '../payload.js'
import {
  BOARD_BACKGROUNDS,
  HttpError,
  LABEL_COLORS,
  boardIdOfLabel,
  bool,
  imageRef,
  iso,
  logActivity,
  maxPosition,
  notFound,
  reorderList,
  requireBoard,
  str,
  uid,
} from '../util.js'

const DEFAULT_LISTS = ['Por hacer', 'En curso', 'Hecho']
const DEFAULT_LABELS = [
  { name: 'Prioridad alta', color: 'red' },
  { name: 'Bloqueado', color: 'orange' },
  { name: 'En revisión', color: 'yellow' },
  { name: 'Mejora', color: 'green' },
  { name: 'Idea', color: 'blue' },
  { name: 'Investigación', color: 'purple' },
]

const MAX_LANES = 8
const lanesKey = (userId) => `board-lanes:${userId}`

/** Columnas del Kanban de tableros, guardadas por usuario. */
function readLanes(db, userId) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(lanesKey(userId))
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value)
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter(
        (lane) =>
          lane &&
          typeof lane.id === 'string' &&
          typeof lane.title === 'string' &&
          Array.isArray(lane.boardIds)
      )
      .map((lane) => ({
        id: lane.id,
        title: lane.title,
        boardIds: lane.boardIds.filter((id) => typeof id === 'string'),
      }))
  } catch {
    return null
  }
}

export function boardRoutes(db) {
  const router = Router()

  router.get('/boards', (req, res) => {
    const boards = db
      .prepare(
        `SELECT b.id, b.title, b.background, b.background_image AS backgroundImage,
                b.owner_id AS ownerId, b.created_at AS createdAt, bm.role,
                (SELECT COUNT(*) FROM lists l WHERE l.board_id = b.id AND l.archived = 0) AS listCount,
                (SELECT COUNT(*) FROM cards c WHERE c.board_id = b.id AND c.archived = 0) AS cardCount,
                (SELECT COUNT(*) FROM cards c
                  WHERE c.board_id = b.id AND c.archived = 0 AND c.due_complete = 0
                    AND c.due_date IS NOT NULL AND c.due_date < ?) AS overdueCount
           FROM boards b JOIN board_members bm ON bm.board_id = b.id
          WHERE bm.user_id = ? AND b.archived = 0
          ORDER BY b.title COLLATE NOCASE ASC`
      )
      .all(new Date().toISOString(), req.user.id)

    const members = db.prepare(
      `SELECT bm.board_id AS boardId, u.id, u.username, u.name, u.avatar
         FROM board_members bm JOIN users u ON u.id = bm.user_id
        WHERE bm.board_id IN (SELECT board_id FROM board_members WHERE user_id = ?)
        ORDER BY u.username`
    ).all(req.user.id)

    res.json({
      boards: boards.map((board) => ({
        ...board,
        members: members.filter((m) => m.boardId === board.id).map(({ boardId, ...rest }) => rest),
      })),
      lanes: readLanes(db, req.user.id),
    })
  })

  // ------------------------------------------------------------------ kanban

  router.put('/boards/lanes', (req, res) => {
    const body = req.body || {}
    if (!Array.isArray(body.lanes)) throw new HttpError(400, 'Las columnas deben ser una lista')
    if (body.lanes.length < 1) throw new HttpError(400, 'Necesitas al menos una columna')
    if (body.lanes.length > MAX_LANES) {
      throw new HttpError(400, `No puedes tener más de ${MAX_LANES} columnas`)
    }

    const accessible = new Set(
      db
        .prepare('SELECT board_id FROM board_members WHERE user_id = ?')
        .all(req.user.id)
        .map((row) => row.board_id)
    )
    const ids = new Set()
    const assigned = new Set()
    const lanes = body.lanes.map((lane, index) => {
      if (!lane || typeof lane !== 'object') {
        throw new HttpError(400, `La columna ${index + 1} no es válida`)
      }
      const title = str(lane.title, 'título de columna', { required: true, max: 40 })
      let id = typeof lane.id === 'string' ? lane.id.trim().slice(0, 64) : ''
      if (!id || ids.has(id)) id = uid()
      ids.add(id)

      const boardIds = []
      for (const boardId of Array.isArray(lane.boardIds) ? lane.boardIds : []) {
        if (typeof boardId !== 'string' || !accessible.has(boardId) || assigned.has(boardId)) continue
        assigned.add(boardId)
        boardIds.push(boardId)
      }
      return { id, title, boardIds }
    })

    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(lanesKey(req.user.id), JSON.stringify(lanes))

    res.json({ lanes })
  })

  router.post('/boards', (req, res) => {
    const body = req.body || {}
    const title = str(body.title, 'título', { required: true, max: 120 })
    const background = body.background || BOARD_BACKGROUNDS[0]
    if (!BOARD_BACKGROUNDS.includes(background)) throw new HttpError(400, 'Fondo de tablero no válido')

    const id = uid()
    const stamp = iso()
    const insertList = db.prepare(
      'INSERT INTO lists (id, board_id, title, position, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    const insertLabel = db.prepare('INSERT INTO labels (id, board_id, name, color) VALUES (?, ?, ?, ?)')

    const create = db.transaction(() => {
      db.prepare(
        'INSERT INTO boards (id, title, background, owner_id, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, title, background, req.user.id, stamp)
      db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(
        id,
        req.user.id,
        'owner'
      )
      DEFAULT_LISTS.forEach((listTitle, index) =>
        insertList.run(uid(), id, listTitle, (index + 1) * 1000, stamp)
      )
      for (const label of DEFAULT_LABELS) insertLabel.run(uid(), id, label.name, label.color)
    })
    create()
    logActivity(db, {
      boardId: id,
      userId: req.user.id,
      kind: 'board',
      message: 'creó el tablero',
    })

    res.status(201).json(boardPayload(db, id))
  })

  router.get('/boards/:id', (req, res) => {
    requireBoard(db, req.user.id, req.params.id)
    res.json(boardPayload(db, req.params.id))
  })

  router.patch('/boards/:id', (req, res) => {
    const role = requireBoard(db, req.user.id, req.params.id)
    const body = req.body || {}
    const title = str(body.title, 'título', { max: 120 })
    const archived = bool(body.archived, 'archived')
    const background = body.background
    const backgroundImage = imageRef(body.backgroundImage, 'imagen de fondo')
    const before = db
      .prepare('SELECT title, background, background_image FROM boards WHERE id = ?')
      .get(req.params.id)

    if (background !== undefined && !BOARD_BACKGROUNDS.includes(background)) {
      throw new HttpError(400, 'Fondo de tablero no válido')
    }
    if (archived !== undefined && archived !== 0 && role !== 'owner') {
      throw new HttpError(403, 'Solo el propietario puede archivar el tablero')
    }
    db.prepare(
      `UPDATE boards SET
         title = COALESCE(?, title),
         background = COALESCE(?, background),
         background_image = CASE WHEN ? = 1 THEN ? ELSE background_image END,
         archived = COALESCE(?, archived)
       WHERE id = ?`
    ).run(
      title ?? null,
      background ?? null,
      backgroundImage === undefined ? 0 : 1,
      backgroundImage === undefined ? null : backgroundImage,
      archived ?? null,
      req.params.id
    )

    if (title !== undefined && title !== before.title) {
      logActivity(db, {
        boardId: req.params.id,
        userId: req.user.id,
        kind: 'board',
        message: `renombró el tablero a «${title}»`,
      })
    }
    if (background !== undefined && background !== before.background) {
      logActivity(db, {
        boardId: req.params.id,
        userId: req.user.id,
        kind: 'board',
        message: 'cambió el fondo del tablero',
      })
    }
    if (backgroundImage !== undefined && backgroundImage !== before.background_image) {
      logActivity(db, {
        boardId: req.params.id,
        userId: req.user.id,
        kind: 'board',
        message: 'cambió la imagen de fondo del tablero',
      })
    }

    res.json(boardPayload(db, req.params.id))
  })

  router.delete('/boards/:id', (req, res) => {
    requireBoard(db, req.user.id, req.params.id, ['owner'])
    db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  })

  // ------------------------------------------------------------- miembros

  router.post('/boards/:id/members', (req, res) => {
    requireBoard(db, req.user.id, req.params.id, ['owner'])
    const body = req.body || {}
    const identifier = str(body.username || body.email || body.identifier, 'usuario', {
      required: true,
      max: 120,
    })
    const user = db
      .prepare('SELECT id, username FROM users WHERE username = ? OR email = ?')
      .get(identifier, identifier)
    if (!user) throw new HttpError(404, `No existe ningún usuario con "${identifier}"`)

    const exists = db
      .prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?')
      .get(req.params.id, user.id)
    if (exists) throw new HttpError(409, `@${user.username} ya forma parte del tablero`)

    db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(
      req.params.id,
      user.id,
      'member'
    )
    logActivity(db, {
      boardId: req.params.id,
      userId: req.user.id,
      kind: 'board',
      message: `añadió a @${user.username} al tablero`,
    })
    res.status(201).json({ members: memberList(db, req.params.id) })
  })

  router.delete('/boards/:id/members/:userId', (req, res) => {
    requireBoard(db, req.user.id, req.params.id, ['owner'])
    const target = db
      .prepare('SELECT user_id, role FROM board_members WHERE board_id = ? AND user_id = ?')
      .get(req.params.id, req.params.userId)
    if (!target) notFound('Ese usuario no pertenece al tablero')
    if (target.role === 'owner') throw new HttpError(400, 'No puedes quitar al propietario del tablero')

    db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(
      req.params.id,
      req.params.userId
    )
    db.prepare(
      'DELETE FROM card_members WHERE user_id = ? AND card_id IN (SELECT id FROM cards WHERE board_id = ?)'
    ).run(req.params.userId, req.params.id)
    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.userId)
    logActivity(db, {
      boardId: req.params.id,
      userId: req.user.id,
      kind: 'board',
      message: `quitó a @${targetUser ? targetUser.username : 'un miembro'} del tablero`,
    })
    res.json({ members: memberList(db, req.params.id) })
  })

  // ------------------------------------------------------------- etiquetas

  router.post('/boards/:id/labels', (req, res) => {
    requireBoard(db, req.user.id, req.params.id)
    const body = req.body || {}
    const name = str(body.name, 'nombre', { max: 60 }) || ''
    const color = body.color || LABEL_COLORS[0]
    if (!LABEL_COLORS.includes(color)) throw new HttpError(400, 'Color de etiqueta no válido')
    db.prepare('INSERT INTO labels (id, board_id, name, color) VALUES (?, ?, ?, ?)').run(
      uid(),
      req.params.id,
      name,
      color
    )
    logActivity(db, {
      boardId: req.params.id,
      userId: req.user.id,
      kind: 'board',
      message: `creó la etiqueta «${name || color}»`,
    })
    res.status(201).json(boardPayload(db, req.params.id))
  })

  router.patch('/labels/:id', (req, res) => {
    const boardId = boardIdOfLabel(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const body = req.body || {}
    const name = str(body.name, 'nombre', { max: 60 })
    const color = body.color
    if (color !== undefined && !LABEL_COLORS.includes(color)) {
      throw new HttpError(400, 'Color de etiqueta no válido')
    }
    const before = db.prepare('SELECT name, color FROM labels WHERE id = ?').get(req.params.id)
    db.prepare('UPDATE labels SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?').run(
      name ?? null,
      color ?? null,
      req.params.id
    )
    if ((name !== undefined && name !== before.name) || (color !== undefined && color !== before.color)) {
      logActivity(db, {
        boardId,
        userId: req.user.id,
        kind: 'board',
        message: `editó la etiqueta «${(name ?? before.name) || (color ?? before.color)}»`,
      })
    }
    res.json(boardPayload(db, boardId))
  })

  router.delete('/labels/:id', (req, res) => {
    const boardId = boardIdOfLabel(db, req.params.id)
    requireBoard(db, req.user.id, boardId)
    const label = db.prepare('SELECT name, color FROM labels WHERE id = ?').get(req.params.id)
    db.prepare('DELETE FROM labels WHERE id = ?').run(req.params.id)
    logActivity(db, {
      boardId,
      userId: req.user.id,
      kind: 'board',
      message: `eliminó la etiqueta «${label.name || label.color}»`,
    })
    res.json(boardPayload(db, boardId))
  })

  // ----------------------------------------------------------------- listas

  router.post('/boards/:id/lists', (req, res) => {
    requireBoard(db, req.user.id, req.params.id)
    const title = str((req.body || {}).title, 'título', { required: true, max: 120 })
    const position = maxPosition(
      db,
      'SELECT MAX(position) AS max_position FROM lists WHERE board_id = ?',
      req.params.id
    )
    db.prepare('INSERT INTO lists (id, board_id, title, position, created_at) VALUES (?, ?, ?, ?, ?)').run(
      uid(),
      req.params.id,
      title,
      position,
      iso()
    )
    logActivity(db, {
      boardId: req.params.id,
      userId: req.user.id,
      kind: 'board',
      message: `creó la lista «${title}»`,
    })
    res.status(201).json(boardPayload(db, req.params.id))
  })

  router.patch('/lists/:id', (req, res) => {
    const list = db
      .prepare('SELECT board_id, title, archived FROM lists WHERE id = ?')
      .get(req.params.id)
    if (!list) notFound('Lista no encontrada')
    requireBoard(db, req.user.id, list.board_id)
    const body = req.body || {}
    const title = str(body.title, 'título', { max: 120 })
    const archived = bool(body.archived, 'archived')

    let color
    if (body.color !== undefined) {
      if (body.color !== null && !LABEL_COLORS.includes(body.color)) {
        throw new HttpError(400, 'Color de lista no válido')
      }
      color = body.color
    }

    let cardLimit
    if (body.cardLimit !== undefined) {
      if (body.cardLimit === null) {
        cardLimit = null
      } else if (!Number.isInteger(body.cardLimit) || body.cardLimit < 1 || body.cardLimit > 999) {
        throw new HttpError(400, 'El límite de tarjetas debe ser un número entero entre 1 y 999')
      } else {
        cardLimit = body.cardLimit
      }
    }

    db.prepare(
      `UPDATE lists SET
         title = COALESCE(?, title),
         color = CASE WHEN ? = 1 THEN ? ELSE color END,
         card_limit = CASE WHEN ? = 1 THEN ? ELSE card_limit END,
         archived = COALESCE(?, archived)
       WHERE id = ?`
    ).run(
      title ?? null,
      color === undefined ? 0 : 1,
      color === undefined ? null : color,
      cardLimit === undefined ? 0 : 1,
      cardLimit === undefined ? null : cardLimit,
      archived ?? null,
      req.params.id
    )
    if (body.targetIndex !== undefined) reorderList(db, req.params.id, body.targetIndex)

    if (title !== undefined && title !== list.title) {
      logActivity(db, {
        boardId: list.board_id,
        userId: req.user.id,
        kind: 'board',
        message: `renombró la lista «${list.title}» a «${title}»`,
      })
    }
    if (archived !== undefined && archived !== list.archived) {
      logActivity(db, {
        boardId: list.board_id,
        userId: req.user.id,
        kind: 'board',
        message: `${archived ? 'archivó' : 'restauró'} la lista «${title || list.title}»`,
      })
    }

    res.json(boardPayload(db, list.board_id))
  })

  router.delete('/lists/:id', (req, res) => {
    const row = db
      .prepare(
        `SELECT l.board_id, l.title, (SELECT COUNT(*) FROM cards c WHERE c.list_id = l.id) AS cards
           FROM lists l WHERE l.id = ?`
      )
      .get(req.params.id)
    if (!row) notFound('Lista no encontrada')
    requireBoard(db, req.user.id, row.board_id)
    db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id)
    logActivity(db, {
      boardId: row.board_id,
      userId: req.user.id,
      kind: 'board',
      message: row.cards > 0
        ? `eliminó la lista «${row.title}» y sus ${row.cards} tarjeta${row.cards === 1 ? '' : 's'}`
        : `eliminó la lista «${row.title}»`,
    })
    res.json(boardPayload(db, row.board_id))
  })

  return router
}
