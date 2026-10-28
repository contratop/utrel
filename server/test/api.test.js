import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'
import { changeForRequest } from '../src/live.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utrel-test-'))
const uploadsDir = path.join(tmpDir, 'uploads')
const db = createDb(path.join(tmpDir, 'test.db'))
const app = createApp({ db, uploadsDir })

let server
let base

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve)
  })
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function req(method, url, { body, cookie, raw, contentType, headers: extra } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (raw !== undefined) headers['Content-Type'] = contentType || 'application/octet-stream'
  if (cookie) headers.Cookie = cookie
  Object.assign(headers, extra)
  const res = await fetch(`${base}${url}`, {
    method,
    headers,
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  if (text) data = JSON.parse(text)
  const setCookie = res.headers.get('set-cookie')
  return { status: res.status, data, cookie: setCookie ? setCookie.split(';')[0] : undefined }
}

const state = {}

test('salud del servicio', async () => {
  const res = await req('GET', '/api/health')
  assert.equal(res.status, 200)
  assert.equal(res.data.ok, true)
})

test('registro de usuario devuelve sesión y cookie', async () => {
  const res = await req('POST', '/api/auth/register', {
    body: { email: 'ana@example.com', username: 'ana', password: 'secreto123', name: 'Ana' },
  })
  assert.equal(res.status, 201)
  assert.equal(res.data.user.username, 'ana')
  assert.ok(res.cookie.startsWith('utrel_session='))
  state.cookieA = res.cookie
  state.userA = res.data.user
})

test('el registro valida datos repetidos y formatos incorrectos', async () => {
  const duplicated = await req('POST', '/api/auth/register', {
    body: { email: 'ana@example.com', username: 'ana2', password: 'secreto123' },
  })
  assert.equal(duplicated.status, 409)

  const badPassword = await req('POST', '/api/auth/register', {
    body: { email: 'otro@example.com', username: 'otro', password: 'corta' },
  })
  assert.equal(badPassword.status, 400)

  const badEmail = await req('POST', '/api/auth/register', {
    body: { email: 'no-es-email', username: 'otro2', password: 'secreto123' },
  })
  assert.equal(badEmail.status, 400)
})

test('login, sesión actual y logout', async () => {
  const wrong = await req('POST', '/api/auth/login', {
    body: { identifier: 'ana', password: 'incorrecta' },
  })
  assert.equal(wrong.status, 401)

  const login = await req('POST', '/api/auth/login', {
    body: { identifier: 'ana@example.com', password: 'secreto123' },
  })
  assert.equal(login.status, 200)
  state.cookieA = login.cookie

  const me = await req('GET', '/api/auth/me', { cookie: state.cookieA })
  assert.equal(me.data.user.username, 'ana')

  const anonymous = await req('GET', '/api/auth/me')
  assert.equal(anonymous.status, 401)

  const logout = await req('POST', '/api/auth/logout', { cookie: state.cookieA })
  assert.equal(logout.status, 200)
  const afterLogout = await req('GET', '/api/auth/me', { cookie: state.cookieA })
  assert.equal(afterLogout.status, 401)

  state.cookieA = (
    await req('POST', '/api/auth/login', { body: { identifier: 'ana', password: 'secreto123' } })
  ).cookie
})

test('los tableros requieren autenticación', async () => {
  const res = await req('GET', '/api/boards')
  assert.equal(res.status, 401)
})

test('crear tablero genera listas y etiquetas por defecto', async () => {
  const res = await req('POST', '/api/boards', {
    cookie: state.cookieA,
    body: { title: 'Lanzamiento web', background: 'ocean' },
  })
  assert.equal(res.status, 201)
  assert.equal(res.data.board.title, 'Lanzamiento web')
  assert.equal(res.data.lists.length, 3)
  assert.ok(res.data.labels.length >= 5)
  assert.equal(res.data.members.length, 1)
  assert.equal(res.data.members[0].role, 'owner')
  state.boardId = res.data.board.id
  state.listId = res.data.lists[0].id
  state.list2Id = res.data.lists[1].id
})

test('crear tarjeta y editar sus campos', async () => {
  const created = await req('POST', `/api/lists/${state.listId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Diseñar portada' },
  })
  assert.equal(created.status, 201)
  state.cardId = created.data.card.id

  const dueDate = new Date(Date.now() + 2 * 86400000).toISOString()
  const updated = await req('PATCH', `/api/cards/${state.cardId}`, {
    cookie: state.cookieA,
    body: {
      description: '# Portada\n\n- [x] boceto\n- [ ] final\n\n**Listo**',
      dueDate,
      priority: 'high',
      coverColor: 'purple',
      coverPosition: 'top',
    },
  })
  assert.equal(updated.status, 200)
  assert.equal(updated.data.card.priority, 'high')
  assert.equal(updated.data.card.coverColor, 'purple')
  assert.equal(updated.data.card.coverPosition, 'top')
  assert.equal(updated.data.card.dueDate, dueDate)
  assert.ok(updated.data.card.description.includes('boceto'))

  const invalid = await req('PATCH', `/api/cards/${state.cardId}`, {
    cookie: state.cookieA,
    body: { priority: 'urgentísima' },
  })
  assert.equal(invalid.status, 400)

  const invalidPosition = await req('PATCH', `/api/cards/${state.cardId}`, {
    cookie: state.cookieA,
    body: { coverPosition: 'diagonal' },
  })
  assert.equal(invalidPosition.status, 400)
})

test('checklist con progreso en el payload del tablero', async () => {
  const checklist = await req('POST', `/api/cards/${state.cardId}/checklists`, {
    cookie: state.cookieA,
    body: { title: 'Criterios' },
  })
  assert.equal(checklist.status, 201)
  state.checklistId = checklist.data.card.checklists[0].id

  const first = await req('POST', `/api/checklists/${state.checklistId}/items`, {
    cookie: state.cookieA,
    body: { text: 'Contraste accesible' },
  })
  const item = first.data.card.checklists[0].items[0]
  state.itemId = item.id

  const second = await req('POST', `/api/checklists/${state.checklistId}/items`, {
    cookie: state.cookieA,
    body: { text: 'Responsive' },
  })
  assert.equal(second.data.card.checklists[0].items.length, 2)

  const done = await req('PATCH', `/api/checklist-items/${state.itemId}`, {
    cookie: state.cookieA,
    body: { done: true },
  })
  assert.equal(done.data.card.checklists[0].items[0].done, true)

  const board = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieA })
  const card = board.data.lists.flatMap((list) => list.cards).find((c) => c.id === state.cardId)
  assert.equal(card.checklist.total, 2)
  assert.equal(card.checklist.done, 1)
})

test('los checklists se reordenan y sus elementos se mueven entre ellos', async () => {
  const extra = await req('POST', `/api/cards/${state.cardId}/checklists`, {
    cookie: state.cookieA,
    body: { title: 'Extras' },
  })
  const extraId = extra.data.card.checklists.at(-1).id

  // El checklist nuevo pasa al principio de la tarjeta.
  const reordered = await req('PATCH', `/api/checklists/${extraId}`, {
    cookie: state.cookieA,
    body: { targetIndex: 0 },
  })
  assert.deepEqual(
    reordered.data.card.checklists.map((list) => list.title),
    ['Extras', 'Criterios']
  )

  // Un elemento del primer checklist se mueve al otro, conservando su estado.
  const moved = await req('PATCH', `/api/checklist-items/${state.itemId}`, {
    cookie: state.cookieA,
    body: { checklistId: extraId, targetIndex: 0 },
  })
  const extras = moved.data.card.checklists.find((list) => list.id === extraId)
  const criterios = moved.data.card.checklists.find((list) => list.id === state.checklistId)
  assert.deepEqual(
    extras.items.map((item) => item.text),
    ['Contraste accesible']
  )
  assert.equal(extras.items[0].done, true, 'el elemento conserva su estado al cambiar de checklist')
  assert.deepEqual(
    criterios.items.map((item) => item.text),
    ['Responsive']
  )

  // Dentro del checklist de destino también se puede reordenar.
  await req('POST', `/api/checklists/${extraId}/items`, {
    cookie: state.cookieA,
    body: { text: 'Al final' },
  })
  const reorderedItems = await req('PATCH', `/api/checklist-items/${state.itemId}`, {
    cookie: state.cookieA,
    body: { targetIndex: 1 },
  })
  assert.deepEqual(
    reorderedItems.data.card.checklists.find((list) => list.id === extraId).items.map((item) => item.text),
    ['Al final', 'Contraste accesible']
  )

  // Otra tarjeta del mismo tablero no es un destino válido.
  const otherCard = await req('POST', `/api/lists/${state.listId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Otra tarjeta' },
  })
  const foreign = await req('POST', `/api/cards/${otherCard.data.card.id}/checklists`, {
    cookie: state.cookieA,
    body: { title: 'Ajena' },
  })
  const rejected = await req('PATCH', `/api/checklist-items/${state.itemId}`, {
    cookie: state.cookieA,
    body: { checklistId: foreign.data.card.checklists[0].id, targetIndex: 0 },
  })
  assert.equal(rejected.status, 400)

  await req('DELETE', `/api/cards/${otherCard.data.card.id}`, { cookie: state.cookieA })
})

test('etiquetas del tablero y asignación a la tarjeta', async () => {
  const label = await req('POST', `/api/boards/${state.boardId}/labels`, {
    cookie: state.cookieA,
    body: { name: 'Urgente', color: 'red' },
  })
  assert.equal(label.status, 201)
  state.labelId = label.data.labels.find((l) => l.name === 'Urgente').id

  const invalidColor = await req('POST', `/api/boards/${state.boardId}/labels`, {
    cookie: state.cookieA,
    body: { name: 'Raro', color: 'turquesa' },
  })
  assert.equal(invalidColor.status, 400)

  const assigned = await req('POST', `/api/cards/${state.cardId}/labels`, {
    cookie: state.cookieA,
    body: { labelId: state.labelId },
  })
  assert.equal(assigned.status, 201)
  assert.deepEqual(
    assigned.data.card.labels.map((l) => l.color),
    ['red']
  )

  const removed = await req('DELETE', `/api/cards/${state.cardId}/labels/${state.labelId}`, {
    cookie: state.cookieA,
  })
  assert.equal(removed.data.card.labels.length, 0)
})

test('comentarios con markdown y recuento en el tablero', async () => {
  const created = await req('POST', `/api/cards/${state.cardId}/comments`, {
    cookie: state.cookieA,
    body: { body: 'Primer **avance**' },
  })
  assert.equal(created.status, 201)
  state.commentId = created.data.card.comments[0].id
  assert.equal(created.data.card.comments[0].user.username, 'ana')

  const edited = await req('PATCH', `/api/comments/${state.commentId}`, {
    cookie: state.cookieA,
    body: { body: 'Avance revisado' },
  })
  assert.equal(edited.data.card.comments[0].body, 'Avance revisado')

  const empty = await req('POST', `/api/cards/${state.cardId}/comments`, {
    cookie: state.cookieA,
    body: { body: '   ' },
  })
  assert.equal(empty.status, 400)

  const board = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieA })
  const card = board.data.lists.flatMap((list) => list.cards).find((c) => c.id === state.cardId)
  assert.equal(card.commentCount, 1)
})

test('reordenar y mover tarjetas entre listas', async () => {
  const second = await req('POST', `/api/lists/${state.listId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Segunda tarjeta' },
  })
  const third = await req('POST', `/api/lists/${state.listId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Tercera tarjeta' },
  })
  const thirdId = third.data.card.id

  const moved = await req('PATCH', `/api/cards/${thirdId}`, {
    cookie: state.cookieA,
    body: { listId: state.list2Id, targetIndex: 0 },
  })
  assert.equal(moved.data.card.listId, state.list2Id)

  const reordered = await req('PATCH', `/api/cards/${state.cardId}`, {
    cookie: state.cookieA,
    body: { targetIndex: 1 },
  })
  assert.equal(reordered.status, 200)

  const board = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieA })
  const list1 = board.data.lists.find((l) => l.id === state.listId)
  const list2 = board.data.lists.find((l) => l.id === state.list2Id)
  assert.deepEqual(
    list1.cards.map((c) => c.title),
    ['Segunda tarjeta', 'Diseñar portada']
  )
  assert.deepEqual(
    list2.cards.map((c) => c.title),
    ['Tercera tarjeta']
  )
  assert.equal(second.status, 201)
})

test('color por lista con validación y borrado', async () => {
  const initial = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieA })
  assert.equal(initial.data.lists.find((l) => l.id === state.listId).color, null)

  const colored = await req('PATCH', `/api/lists/${state.list2Id}`, {
    cookie: state.cookieA,
    body: { color: 'red' },
  })
  assert.equal(colored.status, 200)
  assert.equal(colored.data.lists.find((l) => l.id === state.list2Id).color, 'red')
  // el color no altera el resto de campos ni el orden
  assert.equal(
    colored.data.lists.find((l) => l.id === state.list2Id).title,
    initial.data.lists.find((l) => l.id === state.list2Id).title
  )

  const invalid = await req('PATCH', `/api/lists/${state.list2Id}`, {
    cookie: state.cookieA,
    body: { color: 'turquesa' },
  })
  assert.equal(invalid.status, 400)

  const cleared = await req('PATCH', `/api/lists/${state.list2Id}`, {
    cookie: state.cookieA,
    body: { color: null },
  })
  assert.equal(cleared.data.lists.find((l) => l.id === state.list2Id).color, null)
})

test('límite de tarjetas por lista con validación', async () => {
  const limited = await req('PATCH', `/api/lists/${state.list2Id}`, {
    cookie: state.cookieA,
    body: { cardLimit: 5 },
  })
  assert.equal(limited.status, 200)
  assert.equal(limited.data.lists.find((l) => l.id === state.list2Id).cardLimit, 5)

  for (const bad of [0, -3, 3.5, '5', 1000]) {
    const res = await req('PATCH', `/api/lists/${state.list2Id}`, {
      cookie: state.cookieA,
      body: { cardLimit: bad },
    })
    assert.equal(res.status, 400, `debería rechazar ${JSON.stringify(bad)}`)
  }

  const cleared = await req('PATCH', `/api/lists/${state.list2Id}`, {
    cookie: state.cookieA,
    body: { cardLimit: null },
  })
  assert.equal(cleared.data.lists.find((l) => l.id === state.list2Id).cardLimit, null)
})

test('archivar y restaurar listas y tarjetas', async () => {
  const archived = await req('PATCH', `/api/cards/${state.cardId}`, {
    cookie: state.cookieA,
    body: { archived: true },
  })
  assert.equal(archived.status, 200)

  const board = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieA })
  assert.ok(board.data.archivedCards.some((c) => c.id === state.cardId))
  assert.ok(!board.data.lists.flatMap((l) => l.cards).some((c) => c.id === state.cardId))

  await req('PATCH', `/api/cards/${state.cardId}`, { cookie: state.cookieA, body: { archived: false } })
  const restored = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieA })
  assert.ok(restored.data.lists.flatMap((l) => l.cards).some((c) => c.id === state.cardId))
})

test('permisos: otro usuario no ve el tablero y puede ser invitado', async () => {
  const register = await req('POST', '/api/auth/register', {
    body: { email: 'bruno@example.com', username: 'bruno', password: 'secreto123' },
  })
  state.cookieB = register.cookie
  state.userB = register.data.user

  const forbidden = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieB })
  assert.equal(forbidden.status, 404)

  const notOwner = await req('DELETE', `/api/boards/${state.boardId}`, { cookie: state.cookieB })
  assert.equal(notOwner.status, 404)

  const invited = await req('POST', `/api/boards/${state.boardId}/members`, {
    cookie: state.cookieA,
    body: { username: 'bruno' },
  })
  assert.equal(invited.status, 201)
  assert.equal(invited.data.members.length, 2)

  const duplicate = await req('POST', `/api/boards/${state.boardId}/members`, {
    cookie: state.cookieA,
    body: { username: 'bruno' },
  })
  assert.equal(duplicate.status, 409)

  const visible = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieB })
  assert.equal(visible.status, 200)

  const listsForB = await req('GET', '/api/boards', { cookie: state.cookieB })
  assert.equal(listsForB.data.boards.length, 1)
  assert.equal(listsForB.data.boards[0].role, 'member')
})

test('permisos dentro del tablero: comentarios y asignados', async () => {
  const comment = await req('POST', `/api/cards/${state.cardId}/comments`, {
    cookie: state.cookieB,
    body: { body: 'Reviso esto' },
  })
  assert.equal(comment.status, 201)
  const commentId = comment.data.card.comments[0].id

  // un miembro normal no puede borrar comentarios de otros
  const memberDeletesOther = await req('DELETE', `/api/comments/${state.commentId}`, {
    cookie: state.cookieB,
  })
  assert.equal(memberDeletesOther.status, 403)

  // el propietario del tablero sí puede moderar
  const ownerDeletesOther = await req('DELETE', `/api/comments/${commentId}`, { cookie: state.cookieA })
  assert.equal(ownerDeletesOther.status, 200)

  const assignSelf = await req('POST', `/api/cards/${state.cardId}/members`, {
    cookie: state.cookieB,
    body: { userId: state.userB.id },
  })
  assert.equal(assignSelf.status, 201)
  assert.deepEqual(
    assignSelf.data.card.members.map((m) => m.username),
    ['bruno']
  )

  const outsider = await req('POST', `/api/cards/${state.cardId}/members`, {
    cookie: state.cookieA,
    body: { userId: 'usuario-inexistente' },
  })
  assert.equal(outsider.status, 400)

  const notOwnerCannotRemove = await req('DELETE', `/api/boards/${state.boardId}/members/${state.userA.id}`, {
    cookie: state.cookieA,
  })
  assert.equal(notOwnerCannotRemove.status, 400)
})

test('las columnas del Kanban de tableros se guardan por usuario', async () => {
  const initial = await req('GET', '/api/boards', { cookie: state.cookieA })
  assert.equal(initial.data.lanes, null)

  const saved = await req('PUT', '/api/boards/lanes', {
    cookie: state.cookieA,
    body: {
      lanes: [
        { id: 'focus', title: 'Foco', boardIds: [state.boardId] },
        { id: 'later', title: 'Más adelante', boardIds: [] },
      ],
    },
  })
  assert.equal(saved.status, 200)
  assert.deepEqual(
    saved.data.lanes.map((lane) => lane.title),
    ['Foco', 'Más adelante']
  )
  assert.deepEqual(saved.data.lanes[0].boardIds, [state.boardId])

  const loaded = await req('GET', '/api/boards', { cookie: state.cookieA })
  assert.deepEqual(
    loaded.data.lanes.map((lane) => lane.title),
    ['Foco', 'Más adelante']
  )

  // Cada usuario tiene sus propias columnas.
  const other = await req('GET', '/api/boards', { cookie: state.cookieB })
  assert.equal(other.data.lanes, null)

  const empty = await req('PUT', '/api/boards/lanes', {
    cookie: state.cookieA,
    body: { lanes: [] },
  })
  assert.equal(empty.status, 400)

  const invalidTitle = await req('PUT', '/api/boards/lanes', {
    cookie: state.cookieA,
    body: { lanes: [{ id: 'x', title: '  ', boardIds: [] }] },
  })
  assert.equal(invalidTitle.status, 400)

  // Un tablero ajeno no se puede colocar en las columnas.
  const filtered = await req('PUT', '/api/boards/lanes', {
    cookie: state.cookieB,
    body: { lanes: [{ id: 'mine', title: 'Mías', boardIds: [state.boardId] }] },
  })
  assert.equal(filtered.status, 200)
  assert.deepEqual(filtered.data.lanes[0].boardIds, [state.boardId])

  const outsider = await req('PUT', '/api/boards/lanes', {
    cookie: state.cookieB,
    body: { lanes: [{ id: 'mine', title: 'Mías', boardIds: ['00000000-0000-0000-0000-000000000000'] }] },
  })
  assert.deepEqual(outsider.data.lanes[0].boardIds, [])
})

test('el historial guarda miembros de tarjeta y cambios del tablero, con tope de 15', async () => {
  const board = await req('POST', '/api/boards', {
    cookie: state.cookieA,
    body: { title: 'Historial' },
  })
  const boardId = board.data.board.id
  const listId = board.data.lists[0].id
  const card = await req('POST', `/api/lists/${listId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Con historial' },
  })
  const cardId = card.data.card.id

  await req('POST', `/api/cards/${cardId}/members`, {
    cookie: state.cookieA,
    body: { userId: state.userA.id },
  })
  const afterRemove = await req('DELETE', `/api/cards/${cardId}/members/${state.userA.id}`, {
    cookie: state.cookieA,
  })
  const cardActivity = afterRemove.data.card.activity
  assert.equal(cardActivity.length, 3)
  assert.match(cardActivity[0].message, /quitó a @ana/)
  assert.match(cardActivity[1].message, /asignó a @ana/)
  assert.match(cardActivity[2].message, /creó la tarjeta/)
  assert.equal(cardActivity[0].user.username, 'ana')

  await req('PATCH', `/api/boards/${boardId}`, {
    cookie: state.cookieA,
    body: { title: 'Historial renombrado', background: 'forest' },
  })
  const boardWithHistory = await req('GET', `/api/boards/${boardId}`, { cookie: state.cookieA })
  const messages = boardWithHistory.data.activity.map((entry) => entry.message)
  assert.ok(messages.some((message) => /creó el tablero/.test(message)))
  assert.ok(messages.some((message) => /renombró el tablero/.test(message)))
  assert.ok(messages.some((message) => /cambió el fondo/.test(message)))
  assert.ok(!messages.some((message) => /@ana/.test(message)), 'las tarjetas no ensucian el historial del tablero')

  for (let index = 0; index < 20; index += 1) {
    await req('PATCH', `/api/boards/${boardId}`, {
      cookie: state.cookieA,
      body: { title: `Historial ${index}` },
    })
  }
  const limited = await req('GET', `/api/boards/${boardId}`, { cookie: state.cookieA })
  assert.equal(limited.data.activity.length, 15, 'solo se conservan las 15 últimas del tablero')

  const cardAgain = await req('GET', `/api/cards/${cardId}`, { cookie: state.cookieA })
  assert.equal(cardAgain.data.card.activity.length, 3, 'el tope del tablero no toca el de la tarjeta')

  await req('DELETE', `/api/boards/${boardId}`, { cookie: state.cookieA })
})

test('la actividad registra modificaciones de la tarjeta y borrados del tablero', async () => {
  const board = await req('POST', '/api/boards', {
    cookie: state.cookieA,
    body: { title: 'Actividad completa' },
  })
  const boardId = board.data.board.id
  const listId = board.data.lists[0].id
  const card = await req('POST', `/api/lists/${listId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Con cambios' },
  })
  const cardId = card.data.card.id

  const withLabel = await req('POST', `/api/boards/${boardId}/labels`, {
    cookie: state.cookieA,
    body: { name: 'Bug', color: 'red' },
  })
  const labelId = withLabel.data.labels.find((label) => label.name === 'Bug').id
  await req('POST', `/api/cards/${cardId}/labels`, {
    cookie: state.cookieA,
    body: { labelId },
  })

  const withChecklist = await req('POST', `/api/cards/${cardId}/checklists`, {
    cookie: state.cookieA,
    body: { title: 'Criterios' },
  })
  const checklistId = withChecklist.data.card.checklists[0].id
  const withItem = await req('POST', `/api/checklists/${checklistId}/items`, {
    cookie: state.cookieA,
    body: { text: 'Probar el flujo' },
  })
  const itemId = withItem.data.card.checklists[0].items[0].id
  await req('PATCH', `/api/checklist-items/${itemId}`, {
    cookie: state.cookieA,
    body: { done: true },
  })
  await req('POST', `/api/cards/${cardId}/comments`, {
    cookie: state.cookieA,
    body: { body: 'Queda listo' },
  })
  await req('DELETE', `/api/checklists/${checklistId}`, { cookie: state.cookieA })

  const detail = await req('GET', `/api/cards/${cardId}`, { cookie: state.cookieA })
  const cardMessages = detail.data.card.activity.map((entry) => entry.message)
  assert.ok(cardMessages.some((message) => /etiqueta «Bug»/.test(message)))
  assert.ok(cardMessages.some((message) => /checklist «Criterios»/.test(message)))
  assert.ok(cardMessages.some((message) => /añadió un elemento/.test(message)))
  assert.ok(cardMessages.some((message) => /completó un elemento/.test(message)))
  assert.ok(cardMessages.some((message) => /comentó en la tarjeta/.test(message)))
  assert.ok(cardMessages.some((message) => /eliminó el checklist/.test(message)))

  await req('DELETE', `/api/cards/${cardId}`, { cookie: state.cookieA })
  const afterDelete = await req('GET', `/api/boards/${boardId}`, { cookie: state.cookieA })
  const boardMessages = afterDelete.data.activity.map((entry) => entry.message)
  assert.ok(boardMessages.some((message) => /eliminó la tarjeta «Con cambios»/.test(message)))

  const extraList = await req('POST', `/api/boards/${boardId}/lists`, {
    cookie: state.cookieA,
    body: { title: 'Temporal' },
  })
  const extraListId = extraList.data.lists.find((list) => list.title === 'Temporal').id
  await req('POST', `/api/lists/${extraListId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Se va con la lista' },
  })
  await req('DELETE', `/api/lists/${extraListId}`, { cookie: state.cookieA })
  const afterListDelete = await req('GET', `/api/boards/${boardId}`, { cookie: state.cookieA })
  const listMessages = afterListDelete.data.activity.map((entry) => entry.message)
  assert.ok(listMessages.some((message) => /creó la lista «Temporal»/.test(message)))
  assert.ok(
    listMessages.some((message) => /eliminó la lista «Temporal» y sus 1 tarjeta/.test(message))
  )

  await req('DELETE', `/api/boards/${boardId}`, { cookie: state.cookieA })
})

test('el propietario puede quitar miembros y borrar el tablero', async () => {
  const removed = await req('DELETE', `/api/boards/${state.boardId}/members/${state.userB.id}`, {
    cookie: state.cookieA,
  })
  assert.equal(removed.status, 200)
  assert.equal(removed.data.members.length, 1)

  const gone = await req('GET', `/api/boards/${state.boardId}`, { cookie: state.cookieB })
  assert.equal(gone.status, 404)

  const deleted = await req('DELETE', `/api/boards/${state.boardId}`, { cookie: state.cookieA })
  assert.equal(deleted.status, 200)
  const boards = await req('GET', '/api/boards', { cookie: state.cookieA })
  assert.equal(boards.data.boards.length, 0)
})

test('subida de imágenes: autenticación, formato y servido estático', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )

  const anonymous = await req('POST', '/api/uploads', { raw: png, contentType: 'image/png' })
  assert.equal(anonymous.status, 401)

  const uploaded = await req('POST', '/api/uploads', {
    cookie: state.cookieA,
    raw: png,
    contentType: 'image/png',
  })
  assert.equal(uploaded.status, 201)
  assert.match(uploaded.data.url, /^\/uploads\/[a-f0-9-]+\.png$/)
  assert.equal(uploaded.data.size, png.length)
  assert.ok(fs.existsSync(path.join(uploadsDir, path.basename(uploaded.data.url))))
  state.imageUrl = uploaded.data.url

  // se sirve como imagen estática con el mismo contenido
  const served = await fetch(`${base}${uploaded.data.url}`)
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png)

  const fakeImage = await req('POST', '/api/uploads', {
    cookie: state.cookieA,
    raw: Buffer.from('<svg onload="alert(1)"></svg>'),
    contentType: 'image/png',
  })
  assert.equal(fakeImage.status, 400)

  const unsupported = await req('POST', '/api/uploads', {
    cookie: state.cookieA,
    raw: Buffer.from('<svg/>'),
    contentType: 'image/svg+xml',
  })
  assert.equal(unsupported.status, 415)
})

test('fondo personalizado de tablero y portada con imagen de tarjeta', async () => {
  const board = await req('POST', '/api/boards', {
    cookie: state.cookieA,
    body: { title: 'Con imagen', background: 'forest' },
  })
  const boardId = board.data.board.id
  assert.equal(board.data.board.backgroundImage, null)

  const withImage = await req('PATCH', `/api/boards/${boardId}`, {
    cookie: state.cookieA,
    body: { backgroundImage: state.imageUrl },
  })
  assert.equal(withImage.status, 200)
  assert.equal(withImage.data.board.backgroundImage, state.imageUrl)
  assert.equal(withImage.data.board.background, 'forest')

  const list = await req('GET', '/api/boards', { cookie: state.cookieA })
  const tile = list.data.boards.find((b) => b.id === boardId)
  assert.equal(tile.backgroundImage, state.imageUrl)

  const remote = await req('PATCH', `/api/boards/${boardId}`, {
    cookie: state.cookieA,
    body: { backgroundImage: 'https://example.com/fondo.jpg' },
  })
  assert.equal(remote.data.board.backgroundImage, 'https://example.com/fondo.jpg')

  const cleared = await req('PATCH', `/api/boards/${boardId}`, {
    cookie: state.cookieA,
    body: { backgroundImage: null },
  })
  assert.equal(cleared.data.board.backgroundImage, null)

  const invalid = await req('PATCH', `/api/boards/${boardId}`, {
    cookie: state.cookieA,
    body: { backgroundImage: 'javascript:alert(1)' },
  })
  assert.equal(invalid.status, 400)

  const card = await req('POST', `/api/lists/${board.data.lists[0].id}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Con portada' },
  })
  const cardId = card.data.card.id

  const withCover = await req('PATCH', `/api/cards/${cardId}`, {
    cookie: state.cookieA,
    body: { coverImage: state.imageUrl },
  })
  assert.equal(withCover.data.card.coverImage, state.imageUrl)

  const boardPayload = await req('GET', `/api/boards/${boardId}`, { cookie: state.cookieA })
  const summarized = boardPayload.data.lists.flatMap((l) => l.cards).find((c) => c.id === cardId)
  assert.equal(summarized.coverImage, state.imageUrl)

  const noCover = await req('PATCH', `/api/cards/${cardId}`, {
    cookie: state.cookieA,
    body: { coverImage: null },
  })
  assert.equal(noCover.data.card.coverImage, null)

  const badCover = await req('PATCH', `/api/cards/${cardId}`, {
    cookie: state.cookieA,
    body: { coverImage: 'data:image/png;base64,AAAA' },
  })
  assert.equal(badCover.status, 400)
})

test('foto de perfil visible en miembros y comentarios', async () => {
  const updated = await req('PATCH', '/api/auth/me', {
    cookie: state.cookieA,
    body: { avatar: state.imageUrl },
  })
  assert.equal(updated.status, 200)
  assert.equal(updated.data.user.avatar, state.imageUrl)

  const me = await req('GET', '/api/auth/me', { cookie: state.cookieA })
  assert.equal(me.data.user.avatar, state.imageUrl)

  const remote = await req('PATCH', '/api/auth/me', {
    cookie: state.cookieA,
    body: { avatar: 'https://example.com/ana.png' },
  })
  assert.equal(remote.data.user.avatar, 'https://example.com/ana.png')

  const invalid = await req('PATCH', '/api/auth/me', {
    cookie: state.cookieA,
    body: { avatar: 'javascript:alert(1)' },
  })
  assert.equal(invalid.status, 400)

  await req('PATCH', '/api/auth/me', { cookie: state.cookieA, body: { avatar: state.imageUrl } })

  const board = await req('POST', '/api/boards', {
    cookie: state.cookieA,
    body: { title: 'Con avatares' },
  })
  assert.equal(board.data.members[0].avatar, state.imageUrl)

  const card = await req('POST', `/api/lists/${board.data.lists[0].id}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Con comentario' },
  })
  const comment = await req('POST', `/api/cards/${card.data.card.id}/comments`, {
    cookie: state.cookieA,
    body: { body: 'Hola desde el perfil' },
  })
  assert.equal(comment.data.card.comments[0].user.avatar, state.imageUrl)

  const boards = await req('GET', '/api/boards', { cookie: state.cookieA })
  const tile = boards.data.boards.find((b) => b.id === board.data.board.id)
  assert.equal(tile.members[0].avatar, state.imageUrl)

  const cleared = await req('PATCH', '/api/auth/me', { cookie: state.cookieA, body: { avatar: null } })
  assert.equal(cleared.data.user.avatar, null)
})

test('validaciones de entrada', async () => {
  const noTitle = await req('POST', '/api/boards', { cookie: state.cookieA, body: { title: '   ' } })
  assert.equal(noTitle.status, 400)

  const board = await req('POST', '/api/boards', { cookie: state.cookieA, body: { title: 'Otro' } })
  const badBackground = await req('PATCH', `/api/boards/${board.data.board.id}`, {
    cookie: state.cookieA,
    body: { background: 'arcoiris' },
  })
  assert.equal(badBackground.status, 400)

  const badCard = await req('POST', `/api/lists/${board.data.lists[0].id}/cards`, {
    cookie: state.cookieA,
    body: {},
  })
  assert.equal(badCard.status, 400)

  const card = await req('POST', `/api/lists/${board.data.lists[0].id}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Para validar' },
  })
  const badDue = await req('PATCH', `/api/cards/${card.data.card.id}`, {
    cookie: state.cookieA,
    body: { dueDate: 'mañana' },
  })
  assert.equal(badDue.status, 400)

  const missing = await req('GET', '/api/boards/00000000-0000-0000-0000-000000000000', {
    cookie: state.cookieA,
  })
  assert.equal(missing.status, 404)

  const unknownRoute = await req('GET', '/api/no-existe', { cookie: state.cookieA })
  assert.equal(unknownRoute.status, 404)
})

// ------------------------------------------------------------ administración

test('el primer usuario de la instancia es administrador', async () => {
  const ana = await req('GET', '/api/auth/me', { cookie: state.cookieA })
  assert.equal(ana.data.user.isAdmin, true)

  const bruno = await req('GET', '/api/auth/me', { cookie: state.cookieB })
  assert.equal(bruno.data.user.isAdmin, false)
})

test('el panel está reservado al administrador', async () => {
  const anonymous = await req('GET', '/api/admin/overview')
  assert.equal(anonymous.status, 401)

  const member = await req('GET', '/api/admin/overview', { cookie: state.cookieB })
  assert.equal(member.status, 403)

  const denied = await req('POST', '/api/admin/users', {
    cookie: state.cookieB,
    body: { username: 'intruso', email: 'intruso@example.com', password: 'secreto123' },
  })
  assert.equal(denied.status, 403)

  const admin = await req('GET', '/api/admin/overview', { cookie: state.cookieA })
  assert.equal(admin.status, 200)
  assert.equal(admin.data.settings.allowRegistration, true)
  assert.equal(admin.data.stats.users, 2)
  assert.equal(admin.data.stats.admins, 1)
  assert.equal(admin.data.stats.disabled, 0)
  assert.ok(typeof admin.data.stats.boards === 'number')

  const ana = admin.data.users.find((u) => u.username === 'ana')
  assert.equal(ana.isAdmin, true)
  assert.equal(ana.disabled, false)
  assert.equal(ana.email, 'ana@example.com')
  assert.ok(typeof ana.createdAt === 'string')
  assert.ok(typeof ana.ownedBoards === 'number')
})

test('alta de usuarios desde el panel con validaciones', async () => {
  const weak = await req('POST', '/api/admin/users', {
    cookie: state.cookieA,
    body: { username: 'carla', email: 'carla@example.com', password: 'corta' },
  })
  assert.equal(weak.status, 400)

  const badUsername = await req('POST', '/api/admin/users', {
    cookie: state.cookieA,
    body: { username: 'a', email: 'carla@example.com', password: 'secreto123' },
  })
  assert.equal(badUsername.status, 400)

  const created = await req('POST', '/api/admin/users', {
    cookie: state.cookieA,
    body: { username: 'carla', name: 'Carla', email: 'carla@example.com', password: 'secreto123' },
  })
  assert.equal(created.status, 201)
  assert.equal(created.data.user.username, 'carla')
  assert.equal(created.data.user.isAdmin, false)
  assert.equal(created.data.user.avatar, null)
  state.userC = created.data.user

  // La cuenta creada puede iniciar sesión y no entra al panel.
  const login = await req('POST', '/api/auth/login', {
    body: { identifier: 'carla', password: 'secreto123' },
  })
  assert.equal(login.status, 200)
  state.cookieC = login.cookie
  assert.equal((await req('GET', '/api/admin/overview', { cookie: state.cookieC })).status, 403)

  const repeated = await req('POST', '/api/admin/users', {
    cookie: state.cookieA,
    body: { username: 'otra', email: 'carla@example.com', password: 'secreto123' },
  })
  assert.equal(repeated.status, 409)
})

test('el administrador abre y cierra el registro público', async () => {
  const closed = await req('PATCH', '/api/admin/settings', {
    cookie: state.cookieA,
    body: { allowRegistration: false },
  })
  assert.equal(closed.status, 200)
  assert.equal(closed.data.settings.allowRegistration, false)

  const config = await req('GET', '/api/auth/config')
  assert.equal(config.data.allowRegistration, false)
  assert.equal(config.data.needsSetup, false, 'la instancia ya tiene usuarios')

  const blocked = await req('POST', '/api/auth/register', {
    body: { username: 'dani', email: 'dani@example.com', password: 'secreto123' },
  })
  assert.equal(blocked.status, 403)

  // El panel sigue pudiendo crear cuentas aunque el registro esté cerrado.
  const created = await req('POST', '/api/admin/users', {
    cookie: state.cookieA,
    body: { username: 'dani', email: 'dani@example.com', password: 'secreto123' },
  })
  assert.equal(created.status, 201)
  state.userD = created.data.user

  const invalid = await req('PATCH', '/api/admin/settings', {
    cookie: state.cookieA,
    body: { allowRegistration: 'sí' },
  })
  assert.equal(invalid.status, 400)
  assert.equal((await req('GET', '/api/auth/config')).data.allowRegistration, false)

  const reopened = await req('PATCH', '/api/admin/settings', {
    cookie: state.cookieA,
    body: { allowRegistration: true },
  })
  assert.equal(reopened.data.settings.allowRegistration, true)
  assert.equal((await req('GET', '/api/auth/config')).data.allowRegistration, true)
})

test('deshabilitar una cuenta corta sus sesiones y su login', async () => {
  const login = await req('POST', '/api/auth/login', {
    body: { identifier: 'carla', password: 'secreto123' },
  })
  const cookie = login.cookie

  const off = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { disabled: true },
  })
  assert.equal(off.status, 200)
  assert.equal(off.data.user.disabled, true)

  assert.equal((await req('GET', '/api/auth/me', { cookie })).status, 401)
  assert.equal(
    (
      await req('POST', '/api/auth/login', {
        body: { identifier: 'carla', password: 'secreto123' },
      })
    ).status,
    403
  )

  const on = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { disabled: false },
  })
  assert.equal(on.data.user.disabled, false)
  assert.equal(
    (
      await req('POST', '/api/auth/login', {
        body: { identifier: 'carla', password: 'secreto123' },
      })
    ).status,
    200
  )

  const invalid = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { disabled: 'no' },
  })
  assert.equal(invalid.status, 400)
})

test('roles, contraseña y datos de un usuario desde el panel', async () => {
  const promoted = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { isAdmin: true },
  })
  assert.equal(promoted.data.user.isAdmin, true)

  // La sesión anterior de Carla se cortó al deshabilitar su cuenta.
  const carla = await req('POST', '/api/auth/login', {
    body: { identifier: 'carla', password: 'secreto123' },
  })
  state.cookieC = carla.cookie
  assert.equal(
    (await req('GET', '/api/admin/overview', { cookie: state.cookieC })).status,
    200,
    'el nuevo administrador entra al panel'
  )

  // Un administrador no puede quitarse a sí mismo el acceso.
  const selfDemote = await req('PATCH', `/api/admin/users/${state.userA.id}`, {
    cookie: state.cookieA,
    body: { isAdmin: false },
  })
  assert.equal(selfDemote.status, 400)
  const selfDisable = await req('PATCH', `/api/admin/users/${state.userA.id}`, {
    cookie: state.cookieA,
    body: { disabled: true },
  })
  assert.equal(selfDisable.status, 400)
  const selfDelete = await req('DELETE', `/api/admin/users/${state.userA.id}`, {
    cookie: state.cookieA,
  })
  assert.equal(selfDelete.status, 400)

  // Otro administrador sí puede quitarle el rol.
  const demoted = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { isAdmin: false },
  })
  assert.equal(demoted.data.user.isAdmin, false)

  const renamed = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { name: 'Carla Ríos', username: 'carla2', email: 'carla2@example.com' },
  })
  assert.equal(renamed.data.user.name, 'Carla Ríos')
  assert.equal(renamed.data.user.username, 'carla2')
  assert.equal(renamed.data.user.email, 'carla2@example.com')

  const taken = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { username: 'bruno' },
  })
  assert.equal(taken.status, 409)

  const reset = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { password: 'otraclave123' },
  })
  assert.equal(reset.status, 200)
  assert.equal(
    (
      await req('POST', '/api/auth/login', {
        body: { identifier: 'carla2', password: 'secreto123' },
      })
    ).status,
    401
  )
  assert.equal(
    (
      await req('POST', '/api/auth/login', {
        body: { identifier: 'carla2', password: 'otraclave123' },
      })
    ).status,
    200
  )

  const shortReset = await req('PATCH', `/api/admin/users/${state.userC.id}`, {
    cookie: state.cookieA,
    body: { password: 'corta' },
  })
  assert.equal(shortReset.status, 400)

  const missing = await req('PATCH', '/api/admin/users/00000000-0000-0000-0000-000000000000', {
    cookie: state.cookieA,
    body: { disabled: true },
  })
  assert.equal(missing.status, 404)
})

test('eliminar un usuario borra sus tableros y sus sesiones', async () => {
  const login = await req('POST', '/api/auth/login', {
    body: { identifier: 'dani', password: 'secreto123' },
  })
  const cookies = login.cookie

  const board = await req('POST', '/api/boards', {
    cookie: cookies,
    body: { title: 'Tablero de Dani' },
  })
  assert.equal(board.status, 201)

  const removed = await req('DELETE', `/api/admin/users/${state.userD.id}`, { cookie: state.cookieA })
  assert.equal(removed.status, 200)
  assert.equal(removed.data.deleted.boards, 1)

  assert.equal((await req('GET', '/api/auth/me', { cookie: cookies })).status, 401)
  assert.equal(
    (
      await req('POST', '/api/auth/login', {
        body: { identifier: 'dani', password: 'secreto123' },
      })
    ).status,
    401
  )

  const overview = await req('GET', '/api/admin/overview', { cookie: state.cookieA })
  assert.ok(!overview.data.users.some((u) => u.username === 'dani'))
  assert.equal(overview.data.stats.users, 3)

  const gone = await req('DELETE', `/api/admin/users/${state.userD.id}`, { cookie: state.cookieA })
  assert.equal(gone.status, 404)
})

// ------------------------------------------------------------------ en vivo

test('las rutas de un tablero se traducen al tablero que cambian', async () => {
  const board = await req('POST', '/api/boards', {
    cookie: state.cookieA,
    body: { title: 'Rutas en vivo' },
  })
  const boardId = board.data.board.id
  const listId = board.data.lists[0].id
  const card = await req('POST', `/api/lists/${listId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Con checklist y comentario' },
  })
  const cardId = card.data.card.id
  const checklist = await req('POST', `/api/cards/${cardId}/checklists`, {
    cookie: state.cookieA,
    body: { title: 'Pasos' },
  })
  const checklistId = checklist.data.card.checklists[0].id
  const item = await req('POST', `/api/checklists/${checklistId}/items`, {
    cookie: state.cookieA,
    body: { text: 'Primero' },
  })
  const itemId = item.data.card.checklists[0].items[0].id
  const comment = await req('POST', `/api/cards/${cardId}/comments`, {
    cookie: state.cookieA,
    body: { body: 'Hola' },
  })
  const commentId = comment.data.card.comments[0].id
  const labelId = board.data.labels[0].id

  const cases = [
    ['PATCH', `/boards/${boardId}`],
    ['PATCH', `/lists/${listId}`],
    ['PATCH', `/cards/${cardId}`],
    ['PATCH', `/checklists/${checklistId}`],
    ['PATCH', `/checklist-items/${itemId}`],
    ['PATCH', `/comments/${commentId}`],
    ['PATCH', `/labels/${labelId}`],
  ]
  for (const [method, path] of cases) {
    assert.deepEqual(
      changeForRequest(db, { method, path }),
      { boardId, kind: 'change' },
      `${method} ${path} debería apuntar al tablero`
    )
  }

  assert.deepEqual(changeForRequest(db, { method: 'DELETE', path: `/boards/${boardId}` }), {
    boardId,
    kind: 'deleted',
  })
  assert.equal(changeForRequest(db, { method: 'POST', path: '/auth/login' }), null)
  assert.equal(changeForRequest(db, { method: 'POST', path: '/uploadsfake' }), null)
  assert.equal(
    changeForRequest(db, { method: 'PATCH', path: '/cards/00000000-0000-0000-0000-000000000000' }),
    null,
    'una tarjeta inexistente no anuncia nada'
  )

  await req('DELETE', `/api/boards/${boardId}`, { cookie: state.cookieA })
})

/** Lee el flujo SSE hasta encontrar el patrón. */
async function readStream(reader, pattern, timeout = 5000) {
  let text = ''
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const { value, done } = await reader.read()
    if (done) break
    text += Buffer.from(value).toString('utf8')
    if (pattern.test(text)) return text
  }
  throw new Error(`No llegó «${pattern}» por el flujo. Recibido: ${JSON.stringify(text)}`)
}

test('el flujo de eventos avisa al resto de dispositivos', async () => {
  const board = await req('POST', '/api/boards', {
    cookie: state.cookieA,
    body: { title: 'Colaborativo' },
  })
  const boardId = board.data.board.id
  const listId = board.data.lists[0].id

  const anonymous = await fetch(`${base}/api/boards/${boardId}/events`)
  assert.equal(anonymous.status, 401)
  await anonymous.body?.cancel()

  const outsider = await fetch(`${base}/api/boards/${boardId}/events`, {
    headers: { Cookie: state.cookieB },
  })
  assert.equal(outsider.status, 404, 'un usuario ajeno no recibe el flujo')
  await outsider.body?.cancel()

  const controller = new AbortController()
  const stream = await fetch(`${base}/api/boards/${boardId}/events`, {
    headers: { Cookie: state.cookieA },
    signal: controller.signal,
  })
  assert.equal(stream.status, 200)
  assert.match(stream.headers.get('content-type'), /text\/event-stream/)
  assert.equal(app.locals.live.subscriberCount(boardId), 1)

  const reader = stream.body.getReader()
  const hello = await readStream(reader, /event: hello/)
  assert.match(hello, /"boardId"/)

  // Un cambio hecho desde otro dispositivo del mismo usuario.
  const card = await req('POST', `/api/lists/${listId}/cards`, {
    cookie: state.cookieA,
    body: { title: 'Aviso en vivo' },
    headers: { 'X-Client-Id': 'otro-dispositivo' },
  })
  assert.equal(card.status, 201)

  const change = await readStream(reader, /event: change/)
  assert.match(change, new RegExp(`"boardId":"${boardId}"`))
  assert.match(change, /"kind":"change"/)
  assert.match(change, /"origin":"otro-dispositivo"/)
  assert.match(change, /"actor":/)

  // Un cambio que falla no anuncia nada.
  const failed = await req('PATCH', `/api/cards/${card.data.card.id}`, {
    cookie: state.cookieA,
    body: { priority: 'inexistente' },
  })
  assert.equal(failed.status, 400)

  // Al eliminar el tablero se avisa del borrado para que los demás salgan.
  await req('DELETE', `/api/boards/${boardId}`, { cookie: state.cookieA })
  const deleted = await readStream(reader, /"kind":"deleted"/)
  assert.match(deleted, new RegExp(`"boardId":"${boardId}"`))

  controller.abort()
  await reader.cancel().catch(() => {})
  const deadline = Date.now() + 2000
  while (app.locals.live.subscriberCount(boardId) > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(app.locals.live.subscriberCount(boardId), 0, 'la conexión se libera al cerrarse')
})

test('una instancia sin usuarios se ofrece para crear al administrador', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utrel-setup-'))
  const freshDb = createDb(path.join(dir, 'test.db'))
  const freshApp = createApp({ db: freshDb, uploadsDir: path.join(dir, 'uploads') })
  const freshServer = await new Promise((resolve) => {
    const listening = freshApp.listen(0, () => resolve(listening))
  })
  const freshBase = `http://127.0.0.1:${freshServer.address().port}`
  const previous = process.env.ALLOW_REGISTRATION

  const call = async (method, url, body) => {
    const res = await fetch(`${freshBase}${url}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, data: text ? JSON.parse(text) : null }
  }

  try {
    // Con el registro público cerrado, la instancia recién desplegada tiene que
    // poder crear igualmente su primera cuenta: es la del administrador.
    process.env.ALLOW_REGISTRATION = 'false'

    const config = await call('GET', '/api/auth/config')
    assert.equal(config.data.allowRegistration, false)
    assert.equal(config.data.needsSetup, true, 'la instancia está vacía')

    const first = await call('POST', '/api/auth/register', {
      username: 'jefa',
      email: 'jefa@example.com',
      password: 'secreto123',
    })
    assert.equal(first.status, 201)
    assert.equal(first.data.user.isAdmin, true, 'la primera cuenta es la del administrador')

    assert.equal((await call('GET', '/api/auth/config')).data.needsSetup, false)

    // Ya con usuarios, el registro cerrado vuelve a mandar.
    const blocked = await call('POST', '/api/auth/register', {
      username: 'otro',
      email: 'otro@example.com',
      password: 'secreto123',
    })
    assert.equal(blocked.status, 403)
  } finally {
    if (previous === undefined) delete process.env.ALLOW_REGISTRATION
    else process.env.ALLOW_REGISTRATION = previous
    await new Promise((resolve) => freshServer.close(resolve))
    freshDb.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
