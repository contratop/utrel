import { notFound } from './util.js'

const placeholders = (n) => new Array(n).fill('?').join(',')

function groupByCard(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = row.card_id
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  }
  return map
}

function labelsByCard(db, cardIds) {
  if (!cardIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT cl.card_id AS card_id, l.id AS id, l.name AS name, l.color AS color
         FROM card_labels cl JOIN labels l ON l.id = cl.label_id
        WHERE cl.card_id IN (${placeholders(cardIds.length)})
        ORDER BY l.color, l.name`
    )
    .all(...cardIds)
  return groupByCard(rows)
}

function membersByCard(db, cardIds) {
  if (!cardIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT cm.card_id AS card_id, u.id AS id, u.username AS username, u.name AS name,
              u.avatar AS avatar
         FROM card_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.card_id IN (${placeholders(cardIds.length)})
        ORDER BY u.username`
    )
    .all(...cardIds)
  return groupByCard(rows)
}

function checklistStatsByCard(db, cardIds) {
  if (!cardIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT cl.card_id AS card_id,
              COUNT(DISTINCT cl.id) AS checklists,
              COUNT(ci.id) AS total,
              COALESCE(SUM(ci.done), 0) AS done
         FROM checklists cl LEFT JOIN checklist_items ci ON ci.checklist_id = cl.id
        WHERE cl.card_id IN (${placeholders(cardIds.length)})
        GROUP BY cl.card_id`
    )
    .all(...cardIds)
  const map = new Map()
  for (const row of rows) {
    map.set(row.card_id, {
      checklists: row.checklists,
      total: row.total,
      done: row.done,
    })
  }
  return map
}

function commentCountByCard(db, cardIds) {
  if (!cardIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT card_id, COUNT(*) AS count FROM comments
        WHERE card_id IN (${placeholders(cardIds.length)}) GROUP BY card_id`
    )
    .all(...cardIds)
  return new Map(rows.map((r) => [r.card_id, r.count]))
}

function shapeCard(card, { labels, members, checklist, commentCount }) {
  return {
    id: card.id,
    boardId: card.board_id,
    listId: card.list_id,
    title: card.title,
    description: card.description,
    dueDate: card.due_date,
    dueComplete: !!card.due_complete,
    priority: card.priority,
    coverColor: card.cover_color,
    coverImage: card.cover_image,
    position: card.position,
    archived: !!card.archived,
    createdAt: card.created_at,
    updatedAt: card.updated_at,
    labels: labels || [],
    members: members || [],
    checklist: checklist || { checklists: 0, total: 0, done: 0 },
    commentCount: commentCount || 0,
  }
}

/** Resumen de tarjetas ya agrupadas por lista (o por lo que indique keyOf). */
export function summarizeCards(db, cards) {
  const ids = cards.map((c) => c.id)
  const labels = labelsByCard(db, ids)
  const members = membersByCard(db, ids)
  const checklists = checklistStatsByCard(db, ids)
  const comments = commentCountByCard(db, ids)
  return cards.map((card) =>
    shapeCard(card, {
      labels: labels.get(card.id),
      members: members.get(card.id),
      checklist: checklists.get(card.id),
      commentCount: comments.get(card.id),
    })
  )
}

export function memberList(db, boardId) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.name, u.email, u.avatar, bm.role
         FROM board_members bm JOIN users u ON u.id = bm.user_id
        WHERE bm.board_id = ?
        ORDER BY CASE bm.role WHEN 'owner' THEN 0 ELSE 1 END, u.username`
    )
    .all(boardId)
}

/** Payload completo del tablero: listas, tarjetas, etiquetas, miembros y archivados. */
export function boardPayload(db, boardId) {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId)
  if (!board) notFound('Tablero no encontrado')

  const lists = db
    .prepare('SELECT * FROM lists WHERE board_id = ? AND archived = 0 ORDER BY position ASC, rowid ASC')
    .all(boardId)
  const cards = db
    .prepare('SELECT * FROM cards WHERE board_id = ? AND archived = 0 ORDER BY position ASC, rowid ASC')
    .all(boardId)
  const summarized = summarizeCards(db, cards)

  return {
    board: {
      id: board.id,
      title: board.title,
      background: board.background,
      backgroundImage: board.background_image,
      ownerId: board.owner_id,
      createdAt: board.created_at,
    },
    members: memberList(db, boardId),
    labels: db
      .prepare('SELECT id, name, color FROM labels WHERE board_id = ? ORDER BY color ASC, name ASC')
      .all(boardId),
    lists: lists.map((list) => ({
      id: list.id,
      boardId: list.board_id,
      title: list.title,
      color: list.color,
      cardLimit: list.card_limit ?? null,
      position: list.position,
      cards: summarized.filter((card) => card.listId === list.id),
    })),
    archivedCards: db
      .prepare(
        `SELECT c.id, c.title, c.list_id AS listId, l.title AS listTitle FROM cards c
           LEFT JOIN lists l ON l.id = c.list_id
          WHERE c.board_id = ? AND c.archived = 1 ORDER BY c.updated_at DESC`
      )
      .all(boardId),
    archivedLists: db
      .prepare('SELECT id, title FROM lists WHERE board_id = ? AND archived = 1 ORDER BY title')
      .all(boardId),
  }
}

/** Detalle completo de una tarjeta. */
export function cardPayload(db, cardId) {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId)
  if (!card) notFound('Tarjeta no encontrada')
  const [summary] = summarizeCards(db, [card])

  const checklists = db
    .prepare('SELECT * FROM checklists WHERE card_id = ? ORDER BY position ASC, rowid ASC')
    .all(cardId)
  const items = checklists.length
    ? db
        .prepare(
          `SELECT * FROM checklist_items WHERE checklist_id IN (${placeholders(checklists.length)})
            ORDER BY position ASC, rowid ASC`
        )
        .all(...checklists.map((c) => c.id))
    : []

  const comments = db
    .prepare(
      `SELECT co.id, co.body, co.created_at, co.updated_at,
              u.id AS user_id, u.username, u.name, u.avatar
         FROM comments co JOIN users u ON u.id = co.user_id
        WHERE co.card_id = ? ORDER BY co.created_at DESC`
    )
    .all(cardId)

  const list = db.prepare('SELECT id, title FROM lists WHERE id = ?').get(card.list_id)

  return {
    ...summary,
    listTitle: list ? list.title : '',
    checklists: checklists.map((checklist) => ({
      id: checklist.id,
      title: checklist.title,
      position: checklist.position,
      items: items
        .filter((item) => item.checklist_id === checklist.id)
        .map((item) => ({
          id: item.id,
          text: item.text,
          done: !!item.done,
          position: item.position,
        })),
    })),
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        id: comment.user_id,
        username: comment.username,
        name: comment.name,
        avatar: comment.avatar || null,
      },
    })),
  }
}
