import { Router } from 'express'
import { fetchLinkPreview, normalizeLink, youtubeVideoId } from './linkPreview.js'
import { boardPayload, cardPayload } from './payload.js'
import {
  COVER_POSITIONS,
  HttpError,
  LABEL_COLORS,
  PRIORITIES,
  boardIdOfList,
  bool,
  imageRef,
  iso,
  logActivity,
  maxPosition,
  notFound,
  optionalDate,
  reorderCard,
  requireBoard,
  str,
  uid,
} from './util.js'

const SERVER_VERSION = '1.2.0'
const PROTOCOL_VERSION = '2025-06-18'

const CARD_PROPERTIES = {
  title: { type: 'string', description: 'Título de la tarjeta (máx. 500 caracteres)' },
  description: { type: 'string', description: 'Descripción en Markdown' },
  dueDate: {
    type: ['string', 'null'],
    description: 'Fecha de vencimiento en ISO 8601 o YYYY-MM-DD; null para quitarla',
  },
  dueComplete: { type: 'boolean', description: 'Si la fecha está marcada como completada' },
  priority: { type: 'string', enum: PRIORITIES, description: 'Prioridad de la tarjeta' },
  coverColor: {
    type: ['string', 'null'],
    enum: [...LABEL_COLORS, null],
    description: 'Color de portada; null para quitarlo',
  },
  coverImage: {
    type: ['string', 'null'],
    description: 'URL http(s) o /uploads/… de la imagen de portada; null para quitarla',
  },
  coverPosition: {
    type: 'string',
    enum: COVER_POSITIONS,
    description: 'Encuadre de la imagen de portada',
  },
  link: {
    type: ['string', 'null'],
    description: 'URL que se adjunta a la tarjeta; null para quitarla',
  },
  labelIds: {
    type: 'array',
    items: { type: 'string' },
    description: 'IDs de etiquetas del tablero',
  },
  memberIds: {
    type: 'array',
    items: { type: 'string' },
    description: 'IDs de usuarios miembros del tablero',
  },
  archived: { type: 'boolean', description: 'Archivar o restaurar la tarjeta' },
}

const TOOLS = [
  {
    name: 'list_boards',
    description: 'Lista los tableros a los que tiene acceso el dueño del token.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_board',
    description:
      'Devuelve un tablero completo: listas, tarjetas, etiquetas, miembros y elementos archivados. Usa los IDs de las listas para create_card.',
    inputSchema: {
      type: 'object',
      properties: { boardId: { type: 'string', description: 'ID del tablero' } },
      required: ['boardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_card',
    description: 'Devuelve una tarjeta con sus etiquetas, miembros, checklists y comentarios.',
    inputSchema: {
      type: 'object',
      properties: { cardId: { type: 'string', description: 'ID de la tarjeta' } },
      required: ['cardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_list',
    description: 'Crea una lista (columna) al final de un tablero.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'ID del tablero' },
        title: { type: 'string', description: 'Título de la lista' },
      },
      required: ['boardId', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_card',
    description:
      'Crea una tarjeta en una lista con todos sus campos: descripción, fecha, prioridad, portada, enlace, etiquetas, miembros y checklists.',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'ID de la lista donde crear la tarjeta' },
        ...CARD_PROPERTIES,
        checklists: {
          type: 'array',
          description: 'Checklists iniciales de la tarjeta',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  anyOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        done: { type: 'boolean' },
                      },
                      required: ['text'],
                    },
                  ],
                },
              },
            },
            required: ['title'],
          },
        },
      },
      required: ['listId', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_card',
    description:
      'Edita una tarjeta: cambia sus campos, muévela de lista, archívala o reemplaza sus etiquetas y miembros.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'ID de la tarjeta' },
        ...CARD_PROPERTIES,
        listId: { type: 'string', description: 'Lista de destino para mover la tarjeta' },
        targetIndex: {
          type: 'number',
          description: 'Posición dentro de la lista de destino (0 = primera)',
        },
      },
      required: ['cardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_card',
    description: 'Elimina definitivamente una tarjeta y todos sus datos asociados.',
    inputSchema: {
      type: 'object',
      properties: { cardId: { type: 'string', description: 'ID de la tarjeta' } },
      required: ['cardId'],
      additionalProperties: false,
    },
  },
]

// --------------------------------------------------------------- validación

function idsArg(value, field) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new HttpError(400, `El campo "${field}" debe ser una lista de IDs`)
  }
  return [...new Set(value.map((entry) => entry.trim()).filter(Boolean))]
}

function checklistsArg(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new HttpError(400, 'El campo "checklists" debe ser una lista')

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new HttpError(400, 'Cada checklist debe ser un objeto con título')
    }
    const title = str(entry.title, 'título de checklist', { max: 120 }) || 'Checklist'
    if (entry.items !== undefined && !Array.isArray(entry.items)) {
      throw new HttpError(400, 'Los elementos de un checklist deben ser una lista')
    }
    const items = (entry.items || []).map((item) => {
      const textSource = typeof item === 'string' ? item : item && item.text
      const text = str(textSource, 'texto de checklist', { required: true, max: 500 })
      const done = item && typeof item === 'object' ? bool(item.done, 'done') ?? 0 : 0
      return { text, done }
    })
    return { title, items }
  })
}

function boardLabels(db, boardId, ids) {
  const rows = []
  for (const id of ids) {
    const label = db.prepare('SELECT id, name FROM labels WHERE id = ? AND board_id = ?').get(id, boardId)
    if (!label) throw new HttpError(400, `La etiqueta ${id} no pertenece al tablero`)
    rows.push(label)
  }
  return rows
}

function boardMembers(db, boardId, ids) {
  const rows = []
  for (const id of ids) {
    const member = db
      .prepare('SELECT user_id FROM board_members WHERE board_id = ? AND user_id = ?')
      .get(boardId, id)
    if (!member) throw new HttpError(400, `El usuario ${id} no pertenece al tablero`)
    rows.push(member)
  }
  return rows
}

const getCardRow = (db, id) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id)
  if (!card) notFound('Tarjeta no encontrada')
  return card
}

// ---------------------------------------------------------------- herramientas

const HANDLERS = {
  list_boards(db, userId) {
    const boards = db
      .prepare(
        `SELECT b.id, b.title, b.background, bm.role,
                (SELECT COUNT(*) FROM lists l WHERE l.board_id = b.id AND l.archived = 0) AS listCount,
                (SELECT COUNT(*) FROM cards c WHERE c.board_id = b.id AND c.archived = 0) AS cardCount
           FROM boards b JOIN board_members bm ON bm.board_id = b.id
          WHERE bm.user_id = ? AND b.archived = 0
          ORDER BY b.title COLLATE NOCASE ASC`
      )
      .all(userId)
    return { boards }
  },

  get_board(db, userId, args) {
    const boardId = str(args.boardId, 'boardId', { required: true })
    requireBoard(db, userId, boardId)
    return boardPayload(db, boardId)
  },

  get_card(db, userId, args) {
    const card = getCardRow(db, str(args.cardId, 'cardId', { required: true }))
    requireBoard(db, userId, card.board_id)
    return { card: cardPayload(db, card.id) }
  },

  create_list(db, userId, args) {
    const boardId = str(args.boardId, 'boardId', { required: true })
    requireBoard(db, userId, boardId)
    const title = str(args.title, 'título', { required: true, max: 120 })
    const id = uid()
    const position = maxPosition(
      db,
      'SELECT MAX(position) AS max_position FROM lists WHERE board_id = ?',
      boardId
    )
    db.prepare(
      'INSERT INTO lists (id, board_id, title, position, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, boardId, title, position, iso())
    logActivity(db, {
      boardId,
      userId,
      kind: 'board',
      message: `creó la lista «${title}» desde la API`,
    })
    return { list: { id, boardId, title, position } }
  },

  async create_card(db, userId, args, previewLink) {
    const listId = str(args.listId, 'listId', { required: true })
    const boardId = boardIdOfList(db, listId)
    requireBoard(db, userId, boardId)

    const title = str(args.title, 'título', { required: true, max: 500 })
    const description = str(args.description, 'descripción', { max: 20000 }) ?? ''
    const dueDate = optionalDate(args.dueDate, 'dueDate') ?? null
    const dueComplete = bool(args.dueComplete, 'dueComplete') ?? 0
    const priority = args.priority ?? 'none'
    if (!PRIORITIES.includes(priority)) throw new HttpError(400, 'Prioridad no válida')
    const coverColor = args.coverColor ?? null
    if (coverColor !== null && !LABEL_COLORS.includes(coverColor)) {
      throw new HttpError(400, 'Color de portada no válido')
    }
    const coverPosition = args.coverPosition ?? 'center'
    if (!COVER_POSITIONS.includes(coverPosition)) {
      throw new HttpError(400, 'Posición de la imagen no válida')
    }
    let coverImage = imageRef(args.coverImage, 'coverImage')
    const link = args.link ? normalizeLink(args.link) : null
    const preview = link ? await previewLink(link) : null
    if (coverImage === undefined) coverImage = preview && preview.image ? preview.image : null

    const labelIds = idsArg(args.labelIds, 'labelIds') || []
    const memberIds = idsArg(args.memberIds, 'memberIds') || []
    const labels = boardLabels(db, boardId, labelIds)
    const members = boardMembers(db, boardId, memberIds)
    const checklists = checklistsArg(args.checklists)

    const id = uid()
    const stamp = iso()
    const position = maxPosition(
      db,
      'SELECT MAX(position) AS max_position FROM cards WHERE list_id = ?',
      listId
    )

    const insert = db.transaction(() => {
      db.prepare(
        `INSERT INTO cards (
           id, board_id, list_id, title, description, due_date, due_complete, priority,
           cover_color, cover_image, cover_position,
           link, link_title, link_image, link_icon, link_site,
           position, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        boardId,
        listId,
        title,
        description,
        dueDate,
        dueComplete,
        priority,
        coverColor,
        coverImage,
        coverPosition,
        link,
        preview ? preview.title : null,
        preview ? preview.image : null,
        preview ? preview.icon : null,
        preview ? preview.site : null,
        position,
        stamp,
        stamp
      )

      const addLabel = db.prepare(
        'INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)'
      )
      for (const label of labels) addLabel.run(id, label.id)

      const addMember = db.prepare(
        'INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)'
      )
      for (const member of members) addMember.run(id, member.user_id)

      const addChecklist = db.prepare(
        'INSERT INTO checklists (id, card_id, title, position) VALUES (?, ?, ?, ?)'
      )
      const addItem = db.prepare(
        'INSERT INTO checklist_items (id, checklist_id, text, done, position, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      checklists.forEach((checklist, checklistIndex) => {
        const checklistId = uid()
        addChecklist.run(checklistId, id, checklist.title, (checklistIndex + 1) * 1000)
        checklist.items.forEach((item, itemIndex) => {
          addItem.run(uid(), checklistId, item.text, item.done, (itemIndex + 1) * 1000, stamp)
        })
      })
    })
    insert()

    logActivity(db, {
      boardId,
      cardId: id,
      userId,
      kind: 'card',
      message: 'creó la tarjeta desde la API',
    })
    const list = db.prepare('SELECT title FROM lists WHERE id = ?').get(listId)
    logActivity(db, {
      boardId,
      userId,
      kind: 'board',
      message: `creó la tarjeta «${title}»${list ? ` en «${list.title}»` : ''} desde la API`,
    })

    return { card: cardPayload(db, id) }
  },

  async update_card(db, userId, args, previewLink) {
    const cardId = str(args.cardId, 'cardId', { required: true })
    const card = getCardRow(db, cardId)
    requireBoard(db, userId, card.board_id)

    const hasField = Object.keys(args).some((key) => key !== 'cardId')
    if (!hasField) throw new HttpError(400, 'Indica al menos un campo para actualizar')

    let title = str(args.title, 'título', { max: 500 })
    const description =
      args.description === undefined
        ? undefined
        : str(args.description, 'descripción', { max: 20000 })
    const dueDate = optionalDate(args.dueDate, 'dueDate')
    const dueComplete = bool(args.dueComplete, 'dueComplete')
    const archived = bool(args.archived, 'archived')

    let priority
    if (args.priority !== undefined) {
      if (!PRIORITIES.includes(args.priority)) throw new HttpError(400, 'Prioridad no válida')
      priority = args.priority
    }

    let coverColor
    if (args.coverColor !== undefined) {
      if (args.coverColor !== null && !LABEL_COLORS.includes(args.coverColor)) {
        throw new HttpError(400, 'Color de portada no válido')
      }
      coverColor = args.coverColor
    }

    let coverPosition
    if (args.coverPosition !== undefined) {
      if (!COVER_POSITIONS.includes(args.coverPosition)) {
        throw new HttpError(400, 'Posición de la imagen no válida')
      }
      coverPosition = args.coverPosition
    }

    const coverImage = imageRef(args.coverImage, 'coverImage')
    let link
    if (args.link !== undefined) {
      link = args.link === null || args.link === '' ? null : normalizeLink(args.link)
    }
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
            title: link && preview ? preview.title : null,
            image: link && preview ? preview.image : null,
            icon: link && preview ? preview.icon : null,
            site: link && preview ? preview.site : null,
          }

    const labelIds = idsArg(args.labelIds, 'labelIds')
    const memberIds = idsArg(args.memberIds, 'memberIds')
    const labels = labelIds === undefined ? undefined : boardLabels(db, card.board_id, labelIds)
    const members = memberIds === undefined ? undefined : boardMembers(db, card.board_id, memberIds)

    if (args.listId !== undefined) {
      const targetBoardId = boardIdOfList(db, args.listId)
      if (targetBoardId !== card.board_id) {
        throw new HttpError(400, 'La lista de destino pertenece a otro tablero')
      }
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
      cardId
    )

    if (args.listId !== undefined) {
      reorderCard(db, cardId, args.listId, args.targetIndex ?? 0)
    } else if (args.targetIndex !== undefined) {
      reorderCard(db, cardId, card.list_id, args.targetIndex)
    }

    if (labels !== undefined) {
      const replaceLabels = db.transaction(() => {
        db.prepare('DELETE FROM card_labels WHERE card_id = ?').run(cardId)
        const add = db.prepare('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)')
        for (const label of labels) add.run(cardId, label.id)
      })
      replaceLabels()
    }
    if (members !== undefined) {
      const replaceMembers = db.transaction(() => {
        db.prepare('DELETE FROM card_members WHERE card_id = ?').run(cardId)
        const add = db.prepare('INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)')
        for (const member of members) add.run(cardId, member.user_id)
      })
      replaceMembers()
    }

    const logCard = (message) =>
      logActivity(db, {
        boardId: card.board_id,
        cardId,
        userId,
        kind: 'card',
        message,
      })
    if (title !== undefined && title !== card.title) logCard(`cambió el título a «${title}»`)
    if (archived !== undefined && archived !== card.archived) {
      logCard(`${archived ? 'archivó' : 'restauró'} la tarjeta desde la API`)
      logActivity(db, {
        boardId: card.board_id,
        userId,
        kind: 'board',
        message: `${archived ? 'archivó' : 'restauró'} la tarjeta «${card.title}» desde la API`,
      })
    }
    if (args.listId !== undefined && args.listId !== card.list_id) {
      const list = db.prepare('SELECT title FROM lists WHERE id = ?').get(args.listId)
      logCard(`movió la tarjeta a «${list ? list.title : 'otra lista'}» desde la API`)
      logActivity(db, {
        boardId: card.board_id,
        userId,
        kind: 'board',
        message: `movió la tarjeta «${card.title}» a «${list ? list.title : 'otra lista'}» desde la API`,
      })
    }
    if (
      description !== undefined ||
      dueDate !== undefined ||
      dueComplete !== undefined ||
      priority !== undefined ||
      coverColor !== undefined ||
      coverImage !== undefined ||
      coverPosition !== undefined ||
      link !== undefined ||
      labels !== undefined ||
      members !== undefined
    ) {
      logCard('actualizó la tarjeta desde la API')
    }

    return { card: cardPayload(db, cardId) }
  },

  delete_card(db, userId, args) {
    const card = getCardRow(db, str(args.cardId, 'cardId', { required: true }))
    requireBoard(db, userId, card.board_id)
    logActivity(db, {
      boardId: card.board_id,
      userId,
      kind: 'board',
      message: `eliminó la tarjeta «${card.title}» desde la API`,
    })
    db.prepare('DELETE FROM cards WHERE id = ?').run(card.id)
    return { ok: true, id: card.id }
  },
}

// ------------------------------------------------------------------ JSON-RPC

const rpcError = (id, code, message) => ({
  jsonrpc: '2.0',
  id: id === undefined ? null : id,
  error: { code, message },
})

const toolResult = (id, result) => ({
  jsonrpc: '2.0',
  id,
  result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
})

export function mcpRoutes(db, { previewLink = fetchLinkPreview } = {}) {
  const router = Router()

  // Información del servicio: útil para comprobar la conexión desde n8n o curl.
  router.get('/', (_req, res) => {
    res.json({
      name: 'utrel',
      transport: 'streamable-http',
      endpoint: '/api/mcp',
      protocolVersion: PROTOCOL_VERSION,
      tools: TOOLS.map((tool) => tool.name),
    })
  })

  router.post('/', async (req, res) => {
    const message = req.body
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return res.status(400).json(rpcError(null, -32600, 'Solicitud JSON-RPC inválida'))
    }

    // Las notificaciones (sin id) se aceptan sin respuesta, como exige MCP.
    if (message.id === undefined || message.id === null) return res.status(202).end()
    const { id, method } = message
    const params = message.params && typeof message.params === 'object' ? message.params : {}

    if (typeof method !== 'string') {
      return res.json(rpcError(id, -32600, 'El método JSON-RPC debe ser texto'))
    }

    try {
      if (method === 'initialize') {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion:
              typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'utrel', version: SERVER_VERSION },
          },
        })
      }
      if (method === 'ping' || method === 'notifications/initialized') {
        return res.json({ jsonrpc: '2.0', id, result: {} })
      }
      if (method === 'tools/list') {
        return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
      }
      if (method === 'tools/call') {
        const name = str(params.name, 'name', { required: true })
        const handler = HANDLERS[name]
        if (!handler) throw new HttpError(400, `Herramienta desconocida: ${name}`)
        const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
        try {
          const result = await handler(db, req.user.id, args, previewLink)
          return res.json(toolResult(id, result))
        } catch (err) {
          if (!(err instanceof HttpError)) console.error(err)
          const text = err instanceof HttpError ? err.message : 'Error al ejecutar la herramienta'
          return res.json({
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text }], isError: true },
          })
        }
      }
      return res.json(rpcError(id, -32601, `Método no encontrado: ${method}`))
    } catch (err) {
      if (err instanceof HttpError) return res.json(rpcError(id, -32602, err.message))
      console.error(err)
      return res.json(rpcError(id, -32603, 'Error interno del servidor'))
    }
  })

  return router
}
