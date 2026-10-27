import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const here = path.dirname(fileURLToPath(import.meta.url))
const assetsDir = path.resolve(here, '../dist/assets')

function findBundle() {
  if (!fs.existsSync(assetsDir)) return null
  const file = fs
    .readdirSync(assetsDir)
    .find((name) => name.startsWith('index-') && name.endsWith('.js'))
  return file ? path.join(assetsDir, file) : null
}

const bundle = findBundle()
const skip = bundle ? false : 'ejecuta `npm run build` en client/ antes de esta prueba'

/** Monta el bundle compilado en un DOM jsdom con la API simulada. */
async function mount(routes, path = '/', prepare) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `http://localhost:5173${path}`,
    pretendToBeVisual: true,
  })
  const { window } = dom
  prepare?.(window)

  globalThis.window = window
  globalThis.document = window.document
  try {
    globalThis.navigator = window.navigator
  } catch {
    Object.defineProperty(globalThis, 'navigator', {
      value: window.navigator,
      configurable: true,
      writable: true,
    })
  }
  for (const key of Object.getOwnPropertyNames(window)) {
    if (!(key in globalThis)) {
      try {
        globalThis[key] = window[key]
      } catch {
        /* propiedades no asignables */
      }
    }
  }

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET'
    const pathname = String(url).replace(/^https?:\/\/[^/]+/, '')
    calls.push(`${method} ${pathname}`)
    const hit = routes[`${method} ${pathname}`]
    const status = hit ? hit.status : 404
    const body = hit ? (typeof hit.body === 'function' ? hit.body() : hit.body) : { error: 'Ruta simulada no encontrada' }
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    }
  }

  await import(`${pathToFileURL(bundle).href}?t=${Date.now()}${Math.random()}`)

  return {
    calls,
    window,
    async waitFor(pattern, timeout = 3000) {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        const html = window.document.getElementById('root').innerHTML
        if (pattern.test(html)) {
          // Deja que React ejecute los efectos pasivos pendientes antes de que la
          // prueba termine, para que sus peticiones se registren aquí y no en la siguiente.
          await new Promise((resolve) => setTimeout(resolve, 0))
          return html
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      throw new Error(
        `No apareció ${pattern} en el DOM. Contenido actual: ${window.document
          .getElementById('root')
          .innerHTML.slice(0, 400)}`
      )
    },
  }
}

test('sin sesión, el bundle monta la pantalla de acceso', { skip }, async () => {
  const app = await mount({
    'GET /api/auth/me': { status: 401, body: { error: 'Necesitas iniciar sesión' } },
  })

  const html = await app.waitFor(/Iniciar sesión/)
  assert.match(html, /Utrel/)
  assert.match(html, /Ultra-light Kanban/, 'el acceso muestra el lema de la marca')
  assert.match(html, /src="\/brand\/utrel-mark\.svg"/, 'el acceso muestra el isotipo de la marca')
  assert.match(html, /Crear cuenta/)
  assert.match(html, /Contraseña/)
})

test('una instancia sin usuarios abre la bienvenida y crea el administrador', { skip }, async () => {
  const app = await mount({
    'GET /api/auth/me': { status: 401, body: { error: 'Necesitas iniciar sesión' } },
    'GET /api/auth/config': { status: 200, body: { allowRegistration: true, needsSetup: true } },
    'POST /api/auth/register': {
      status: 201,
      body: { user: { id: 'u1', username: 'jefa', name: 'jefa', email: 'jefa@utrel.test', isAdmin: true } },
    },
    'GET /api/boards': { status: 200, body: { boards: [] } },
  })

  const html = await app.waitFor(/Bienvenido a Utrel/)
  assert.match(html, /todavía no tiene usuarios/, 'la bienvenida explica que la instancia está vacía')
  assert.doesNotMatch(html, /Iniciar sesión/, 'sin usuarios no hay acceso')
  assert.doesNotMatch(html, /Crear cuenta\b/, 'sin usuarios no hay registro')

  // La bienvenida crea directamente la cuenta del administrador.
  const fields = [...app.window.document.querySelectorAll('.auth-card .field input')]
  assert.equal(fields.length, 3, 'pide usuario, email y contraseña')
  setInputValue(app.window, fields[0], 'jefa')
  setInputValue(app.window, fields[1], 'jefa@utrel.test')
  setInputValue(app.window, fields[2], 'contrasena123')
  await new Promise((resolve) => setTimeout(resolve, 20))

  app.window.document
    .querySelector('.auth-card form')
    .dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }))

  await waitForCall(app, 'POST /api/auth/register')
  const boards = await app.waitFor(/Mis tableros/)
  assert.match(boards, /Panel de administración/, 'entra como administrador')
})

test('con sesión, el bundle lista los tableros del usuario', { skip }, async () => {
  const app = await mount({
    'GET /api/auth/me': {
      status: 200,
      body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
    },
    'GET /api/boards': {
      status: 200,
      body: {
        boards: [
          {
            id: 'b1',
            title: 'Proyectos',
            background: 'berry',
            ownerId: 'u1',
            role: 'owner',
            listCount: 3,
            cardCount: 5,
            overdueCount: 2,
            members: [{ id: 'u1', username: 'ana', name: 'Ana' }],
          },
        ],
      },
    },
  })

  const html = await app.waitFor(/Proyectos/)
  assert.match(html, /Mis tableros/)
  assert.match(html, /3 listas · 5 tarjetas/)
  assert.match(html, /2 vencidas/)
  assert.match(html, /src="\/brand\/utrel-mark\.svg"/, 'la barra superior usa el isotipo de la marca')
  assert.deepEqual(app.calls, ['GET /api/auth/me', 'GET /api/boards'])
})

const BOARD = {
  board: {
    id: 'b1',
    title: 'Proyectos',
    background: 'ocean',
    backgroundImage: null,
    ownerId: 'u1',
    createdAt: new Date().toISOString(),
  },
  members: [{ id: 'u1', username: 'ana', name: 'Ana', role: 'owner' }],
  labels: [],
  lists: [
    {
      id: 'l1',
      title: 'Por hacer',
      cardLimit: 10,
      position: 1000,
      cards: [
        {
          id: 'c1',
          listId: 'l1',
          title: 'Diseñar portada',
          description: 'Boceto inicial',
          dueDate: null,
          dueComplete: false,
          priority: 'high',
          coverColor: 'purple',
          coverImage: null,
          labels: [],
          members: [],
          checklist: { checklists: 0, total: 0, done: 0 },
          commentCount: 0,
        },
      ],
    },
    { id: 'l2', title: 'En curso', position: 2000, color: 'red', cards: [] },
  ],
  archivedCards: [],
  archivedLists: [],
}

function clickByText(win, text) {
  const button = [...win.document.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === text
  )
  assert.ok(button, `No se encontró el botón «${text}»`)
  button.click()
}

test('el tablero monta listas, tarjetas y el diálogo de fondo', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
    },
    '/b/b1'
  )

  const html = await app.waitFor(/Diseñar portada/)
  assert.match(html, /Por hacer/)
  assert.match(html, /En curso/)
  assert.match(html, /data-list-cards="l1"/)
  assert.match(html, /list-accent bg-red/)
  assert.match(html, /1\/10/)

  clickByText(app.window, 'Menú ▾')
  await app.waitFor(/Fondo del tablero/)
  clickByText(app.window, 'Fondo del tablero…')

  const dialog = await app.waitFor(/Imagen propia/)
  assert.match(dialog, /Degradados/)
  assert.match(dialog, /Subir imagen/)
  assert.match(dialog, /bg-ocean/)
})

/** Tablero con las tarjetas de la primera lista sustituidas. */
function boardWithCards(cards) {
  return { ...BOARD, lists: [{ ...BOARD.lists[0], cards }, BOARD.lists[1]] }
}

function dueIn(days) {
  return new Date(Date.now() + days * 86400000).toISOString()
}

test('la fecha de vencimiento se marca como completada desde la tarjeta', { skip }, async () => {
  const base = BOARD.lists[0].cards[0]
  const board = boardWithCards([
    { ...base, dueDate: dueIn(10) },
    { ...base, id: 'c2', title: 'Sin fecha' },
  ])

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: () => board },
      'PATCH /api/cards/c1': { status: 200, body: { card: {} } },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)

  const toggle = app.window.document.querySelector('[data-card-id="c1"] .card-due-toggle')
  assert.ok(toggle, 'la tarjeta con fecha lleva el círculo de completar')
  assert.equal(toggle.getAttribute('role'), 'checkbox')
  assert.equal(toggle.getAttribute('aria-checked'), 'false')
  assert.equal(toggle.getAttribute('aria-label'), 'Marcar como completada')
  assert.match(toggle.className, /due-later/, 'el círculo lleva el color del estado del vencimiento')
  assert.ok(
    !app.window.document.querySelector('[data-card-id="c2"] .card-due-toggle'),
    'la tarjeta sin fecha no lleva círculo'
  )

  toggle.click()
  await waitForCall(app, 'PATCH /api/cards/c1')
  assert.ok(
    !app.calls.some((call) => call.startsWith('GET /api/cards/')),
    'marcarla no abre el detalle de la tarjeta'
  )

  // En táctil, mantener el dedo sobre el círculo no arrastra la tarjeta (si no,
  // en el iPad una pulsación lenta no llegaría a marcar la fecha).
  // Se suelta siempre antes de comprobar, para no dejar el arrastre abierto.
  const longPress = async (target) => {
    target.dispatchEvent(touchEvent(app.window, 'touchstart', 100, 200))
    await new Promise((resolve) => setTimeout(resolve, 300))
    const ghost = app.window.document.querySelectorAll('.touch-ghost').length
    app.window.document.body.dispatchEvent(touchEvent(app.window, 'touchmove', 120, 320))
    app.window.document.body.dispatchEvent(touchEvent(app.window, 'touchend', 120, 320))
    await new Promise((resolve) => setTimeout(resolve, 50))
    return ghost
  }

  const circle = app.window.document.querySelector('[data-card-id="c1"] .card-due-toggle')
  assert.equal(await longPress(circle), 0, 'el círculo no arranca el arrastre')
  assert.equal(
    await longPress(app.window.document.querySelector('[data-card-id="c1"]')),
    1,
    'desde el cuerpo de la tarjeta el arrastre táctil sigue funcionando'
  )
  assert.equal(app.window.document.querySelectorAll('.touch-ghost').length, 0)
})

test('el círculo aparece marcado si la fecha ya está completada', { skip }, async () => {
  const board = boardWithCards([
    { ...BOARD.lists[0].cards[0], dueDate: dueIn(-1), dueComplete: true },
  ])

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: board },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)

  const toggle = app.window.document.querySelector('.card-due-toggle')
  assert.equal(toggle.getAttribute('aria-checked'), 'true')
  assert.equal(toggle.getAttribute('aria-label'), 'Marcar como pendiente')
  assert.match(toggle.className, /due-complete/, 'completada manda sobre vencida')
})

test('las listas se contraen desde el menú y se expanden con un clic', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)

  const menuButton = app.window.document.querySelector('[data-list-id="l1"] .list-head .menu-wrap button')
  assert.ok(menuButton, 'No se encontró el menú de la lista')
  menuButton.click()
  await app.waitFor(/Contraer lista/)

  const collapseButton = [...app.window.document.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === 'Contraer lista'
  )
  assert.ok(collapseButton, 'No se encontró «Contraer lista»')
  collapseButton.click()

  await app.waitFor(/list-collapsed-title/)
  assert.ok(app.window.document.querySelector('[data-list-id="l1"]').classList.contains('collapsed'))
  assert.equal(
    app.window.document.querySelector('[data-list-id="l1"]').getAttribute('data-collapsed'),
    'true'
  )
  assert.ok(
    app.window.document.querySelector('[data-list-id="l1"] .list-collapsed'),
    'Falta la columna contraída'
  )
  assert.match(app.window.localStorage.getItem('utrel:collapsed:u1:b1'), /l1/)

  app.window.document.querySelector('[data-list-id="l1"] .list-collapsed').click()
  await app.waitFor(/Diseñar portada/)
  assert.ok(!app.window.document.querySelector('[data-list-id="l1"]').classList.contains('collapsed'))
})

function setInputValue(win, input, value) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new win.Event('input', { bubbles: true }))
}

test('se puede fijar el límite de tarjetas y el contador se colorea', { skip }, async () => {
  const limitedBoard = {
    ...BOARD,
    lists: BOARD.lists.map((list) =>
      list.id === 'l1' ? { ...list, cardLimit: 1 } : list
    ),
  }

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'PATCH /api/lists/l1': { status: 200, body: limitedBoard },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)

  app.window.document.querySelector('[data-list-id="l1"] .list-head .menu-wrap button').click()
  await app.waitFor(/Límite de tarjetas/)

  const input = app.window.document.querySelector('.popover input[type="number"]')
  assert.ok(input, 'Falta el campo del límite')
  setInputValue(app.window, input, '1')
  await new Promise((resolve) => setTimeout(resolve, 20))
  input.closest('form').dispatchEvent(
    new app.window.Event('submit', { bubbles: true, cancelable: true })
  )

  await waitForCall(app, 'PATCH /api/lists/l1')

  const pill = await app.waitFor(/limit-full/)
  assert.match(pill, /1\/1/)
  assert.ok(
    app.window.document.querySelector('[data-list-id="l1"] .list-head .pill').classList.contains('limit-full')
  )
})

function touchEvent(win, type, x, y) {
  const event = new win.Event(type, { bubbles: true, cancelable: true })
  const touch = { clientX: x, clientY: y, identifier: 0 }
  event.touches = [touch]
  event.changedTouches = [touch]
  event.targetTouches = [touch]
  return event
}

async function waitForCall(app, call, timeout = 2000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (app.calls.includes(call)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`No se llamó a «${call}». Llamadas: ${app.calls.join(', ')}`)
}

async function waitForCallCount(app, call, count, timeout = 2000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (app.calls.filter((item) => item === call).length >= count) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`No se llamó ${count} veces a «${call}». Llamadas: ${app.calls.join(', ')}`)
}

test('el arrastre táctil mueve la tarjeta tras una pulsación larga', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'PATCH /api/cards/c1': {
        status: 200,
        body: { card: { ...BOARD.lists[0].cards[0], listId: 'l1' } },
      },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  const card = app.window.document.querySelector('[data-card-id="c1"]')
  assert.ok(card, 'No se encontró la tarjeta')

  // pulsación larga: se activa el arrastre y aparece la tarjeta flotante
  card.dispatchEvent(touchEvent(app.window, 'touchstart', 100, 200))
  assert.equal(app.window.document.querySelectorAll('.touch-ghost').length, 0)
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(app.window.document.querySelectorAll('.touch-ghost').length, 1)

  app.window.document.body.dispatchEvent(touchEvent(app.window, 'touchmove', 120, 320))
  app.window.document.body.dispatchEvent(touchEvent(app.window, 'touchend', 120, 320))

  await waitForCall(app, 'PATCH /api/cards/c1')
  assert.equal(app.window.document.querySelectorAll('.touch-ghost').length, 0)
})

test('el perfil permite cambiar la foto y se refleja en la barra', { skip }, async () => {
  const app = await mount({
    'GET /api/auth/me': {
      status: 200,
      body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
    },
    'GET /api/boards': { status: 200, body: { boards: [] } },
    'PATCH /api/auth/me': {
      status: 200,
      body: {
        user: {
          id: 'u1',
          username: 'ana',
          name: 'Ana',
          email: 'ana@example.com',
          avatar: 'https://example.com/ana.jpg',
        },
      },
    },
  })

  await app.waitFor(/Mis tableros/)
  app.window.document.querySelector('.profile-trigger').click()
  await app.waitFor(/Foto de perfil/)

  const input = app.window.document.querySelector('.profile-modal input[placeholder^="https"]')
  assert.ok(input, 'Falta el campo de URL de la foto')
  setInputValue(app.window, input, 'https://example.com/ana.jpg')
  await new Promise((resolve) => setTimeout(resolve, 20))
  input.closest('form').dispatchEvent(
    new app.window.Event('submit', { bubbles: true, cancelable: true })
  )

  await waitForCall(app, 'PATCH /api/auth/me')
  const image = await app.waitFor(/<img[^>]+src="https:\/\/example\.com\/ana\.jpg"/)
  assert.match(image, /profile-preview/)
  assert.match(image, /profile-trigger/)
})

/** Clic derecho sobre un elemento, como lo haría el ratón. */
function rightClick(win, element, { x = 140, y = 120 } = {}) {
  const event = new win.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  })
  element.dispatchEvent(event)
  return event
}

/** Pulsa un elemento del menú contextual (el icono va dentro del botón). */
function clickMenuItem(win, text) {
  const item = [...win.document.querySelectorAll('.context-menu-item')].find((element) =>
    element.textContent.includes(text)
  )
  assert.ok(item, `No se encontró el elemento «${text}» del menú contextual`)
  item.click()
  return item
}

/** EventSource falso: permite empujar eventos en vivo desde la prueba. */
class FakeEventSource {
  constructor(url) {
    this.url = url
    this.listeners = new Map()
    this.closed = false
    FakeEventSource.instances.push(this)
  }

  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name).push(handler)
  }

  removeEventListener(name, handler) {
    const handlers = this.listeners.get(name) || []
    this.listeners.set(
      name,
      handlers.filter((candidate) => candidate !== handler)
    )
  }

  close() {
    this.closed = true
  }

  emit(name, payload) {
    for (const handler of this.listeners.get(name) || []) handler({ data: JSON.stringify(payload) })
  }
}

FakeEventSource.instances = []

test('los cambios de otro dispositivo se aplican en vivo', { skip }, async () => {
  FakeEventSource.instances = []
  const extraCard = {
    id: 'c2',
    listId: 'l1',
    title: 'Llegada desde el iPad',
    description: '',
    dueDate: null,
    dueComplete: false,
    priority: 'none',
    coverColor: null,
    coverImage: null,
    labels: [],
    members: [],
    checklist: { checklists: 0, total: 0, done: 0 },
    commentCount: 0,
  }
  let board = BOARD

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: () => board },
      'GET /api/boards': { status: 200, body: { boards: [] } },
    },
    '/b/b1',
    (window) => {
      window.EventSource = FakeEventSource
      window.sessionStorage.setItem('utrel:client-id', 'esta-pestana')
    }
  )

  await app.waitFor(/Diseñar portada/)
  const source = FakeEventSource.instances[0]
  assert.ok(source, 'el tablero abre un flujo de eventos')
  assert.equal(source.url, '/api/boards/b1/events')

  const loads = () => app.calls.filter((call) => call === 'GET /api/boards/b1').length
  const initialLoads = loads()

  // Un aviso del mismo cambio que acabamos de hacer no recarga nada.
  source.emit('change', { boardId: 'b1', kind: 'change', origin: 'esta-pestana' })
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.equal(loads(), initialLoads, 'los cambios propios no se aplican dos veces')

  // Un cambio de otro dispositivo sí recarga el tablero.
  board = { ...BOARD, lists: [{ ...BOARD.lists[0], cards: [...BOARD.lists[0].cards, extraCard] }, BOARD.lists[1]] }
  source.emit('change', { boardId: 'b1', kind: 'change', origin: 'otro-ipad' })
  await app.waitFor(/Llegada desde el iPad/)
  assert.equal(loads(), initialLoads + 1, 'un solo refresco por aviso')

  // Si el tablero se elimina mientras lo tenemos abierto, volvemos a la lista.
  source.emit('change', { boardId: 'b1', kind: 'deleted', origin: 'otro-ipad' })
  await app.waitFor(/Mis tableros/)
})

test('la búsqueda se abre con «Buscar», filtra y se cierra con Esc', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  assert.ok(!app.window.document.querySelector('.board-search'), 'la barra no se ve hasta pulsar Buscar')
  assert.ok(!app.window.document.querySelector('.filter-bar'), 'los filtros tampoco se ven sin búsqueda')

  clickByText(app.window, '🔍 Buscar')
  const bar = await app.waitFor(/board-search/)
  assert.match(bar, /Buscar tarjetas por título o descripción/)
  assert.match(bar, /Vencimiento|Cualquier fecha/, 'los filtros viajan dentro del panel')
  assert.match(bar, /Etiquetas/)
  assert.match(bar, /Miembros/)
  assert.ok(
    app.window.document.querySelector('.board-search .filter-bar'),
    'la barra de filtros aparece al buscar'
  )

  const input = app.window.document.querySelector('.board-search input.search-input')
  assert.ok(input, 'falta el campo de búsqueda')
  assert.equal(app.window.document.activeElement, input, 'la barra abre con el foco puesto')

  // Filtra las tarjetas del tablero (usa los mismos filtros que el resto de la vista).
  setInputValue(app.window, input, 'Diseñar')
  await app.waitFor(/1 de 1 tarjetas/)
  assert.ok(app.window.document.querySelector('[data-card-id="c1"]'), 'la tarjeta coincide y sigue visible')

  setInputValue(app.window, input, 'no existe')
  await app.waitFor(/0 de 1 tarjetas/)
  assert.ok(!app.window.document.querySelector('[data-card-id="c1"]'), 'la tarjeta filtrada desaparece')

  // Los filtros de la barra también cuentan (la tarjeta no tiene fecha: «Vencidas» la descarta).
  const due = app.window.document.querySelector('.board-search .filter-bar select')
  setSelectValue(app.window, due, 'overdue')
  await app.waitFor(/0 de 1 tarjetas/)

  setInputValue(app.window, input, '')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(!app.window.document.querySelector('[data-card-id="c1"]'), 'el filtro de fecha sigue activo')

  // Esc cierra el panel y limpia todos los filtros, para no dejar la vista filtrada sin avisar.
  app.window.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }))
  await app.waitFor(/Diseñar portada/)
  assert.ok(!app.window.document.querySelector('.board-search'), 'el panel se cierra')
  assert.ok(!app.window.document.querySelector('.filter-bar'), 'y con él desaparecen los filtros')

  // Al volver a abrirlo, se empieza de cero.
  clickByText(app.window, '🔍 Buscar')
  await app.waitFor(/board-search/)
  assert.ok(app.window.document.querySelector('[data-card-id="c1"]'), 'sin filtros la tarjeta vuelve a verse')
})

function setSelectValue(win, select, value) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value').set
  setter.call(select, value)
  select.dispatchEvent(new win.Event('change', { bubbles: true }))
}

test('el clic derecho abre el menú propio de la tarjeta', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'PATCH /api/cards/c1': { status: 200, body: { card: { ...BOARD.lists[0].cards[0], archived: true } } },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  assert.ok(!app.window.document.querySelector('.context-menu'), 'sin clic derecho no hay menú')

  const card = app.window.document.querySelector('[data-card-id="c1"]')
  const event = rightClick(app.window, card)
  assert.ok(event.defaultPrevented, 'se bloquea el menú del navegador')

  const menu = await app.waitFor(/context-menu/)
  assert.match(menu, /Abrir tarjeta/)
  assert.match(menu, /Archivar tarjeta/)
  assert.match(menu, /Eliminar tarjeta/)
  assert.match(menu, /left:/, 'el menú se coloca donde se pulsó')
  assert.equal(app.window.document.querySelectorAll('.context-menu').length, 1)

  // Elegir una acción la ejecuta y cierra el menú.
  clickMenuItem(app.window, 'Archivar tarjeta')
  await waitForCall(app, 'PATCH /api/cards/c1')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(!app.window.document.querySelector('.context-menu'), 'el menú se cierra al elegir')

  // Escape vuelve a cerrarlo.
  rightClick(app.window, card)
  await app.waitFor(/context-menu/)
  app.window.document
    .querySelector('.context-menu')
    .dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(!app.window.document.querySelector('.context-menu'), 'Escape cierra el menú')

  // Un clic fuera también.
  rightClick(app.window, card)
  await app.waitFor(/context-menu/)
  app.window.document.querySelector('.board-title').dispatchEvent(
    new app.window.MouseEvent('mousedown', { bubbles: true, cancelable: true })
  )
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(!app.window.document.querySelector('.context-menu'), 'un clic fuera cierra el menú')
})

test('las listas y el tablero tienen su propio menú contextual', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)

  // Lista: las acciones rápidas más el acceso a color y límite.
  const list = app.window.document.querySelector('[data-list-id="l1"]')
  assert.ok(rightClick(app.window, list).defaultPrevented)
  const listMenu = await app.waitFor(/Renombrar lista/)
  assert.match(listMenu, /Añadir tarjeta/)
  assert.match(listMenu, /Contraer lista/)
  assert.match(listMenu, /Color y límite/)
  assert.match(listMenu, /Eliminar lista/)

  clickMenuItem(app.window, 'Renombrar lista')
  await app.waitFor(/list-title|value="Por hacer"/)
  assert.ok(
    app.window.document.querySelector('[data-list-id="l1"] .list-head input'),
    'la lista queda en modo renombrar'
  )
  app.window.document
    .querySelector('[data-list-id="l1"] .list-head input')
    .dispatchEvent(new app.window.FocusEvent('blur', { bubbles: true }))

  // Tablero: buscador, fondo, miembros y archivado.
  const header = app.window.document.querySelector('.board-header')
  assert.ok(rightClick(app.window, header).defaultPrevented)
  const boardMenu = await app.waitFor(/Buscar en el tablero/)
  assert.match(boardMenu, /Fondo del tablero/)
  assert.match(boardMenu, /Miembros/)
  assert.match(boardMenu, /Archivar tablero/)

  clickMenuItem(app.window, 'Buscar en el tablero')
  await app.waitFor(/board-search/)
  assert.ok(app.window.document.querySelector('.board-search input.search-input'))
})

test('las tarjetas de tablero también responden al clic derecho', { skip }, async () => {
  const boards = {
    boards: [
      {
        id: 'b1',
        title: 'Proyectos',
        background: 'berry',
        ownerId: 'u1',
        role: 'owner',
        listCount: 3,
        cardCount: 5,
        overdueCount: 0,
        members: [{ id: 'u1', username: 'ana', name: 'Ana' }],
      },
      {
        id: 'b2',
        title: 'Compartido',
        background: 'ocean',
        ownerId: 'u2',
        role: 'member',
        listCount: 1,
        cardCount: 2,
        overdueCount: 0,
        members: [{ id: 'u2', username: 'bruno', name: 'Bruno' }],
      },
    ],
  }

  const app = await mount({
    'GET /api/auth/me': {
      status: 200,
      body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
    },
    'GET /api/boards': { status: 200, body: boards },
    'PATCH /api/boards/b1': { status: 200, body: boards },
  })

  await app.waitFor(/Proyectos/)
  const tile = app.window.document.querySelectorAll('.board-tile')[0]
  assert.ok(rightClick(app.window, tile).defaultPrevented)
  const menu = await app.waitFor(/Abrir tablero/)
  assert.match(menu, /Archivar tablero/)
  assert.match(menu, /Eliminar tablero/)

  clickMenuItem(app.window, 'Archivar tablero')
  await waitForCall(app, 'PATCH /api/boards/b1')
  await waitForCallCount(app, 'GET /api/boards', 2)
  assert.equal(
    app.calls.filter((call) => call === 'GET /api/boards').length,
    2,
    'la lista se recarga una vez tras la acción'
  )

  // En un tablero ajeno no se puede eliminar.
  const shared = app.window.document.querySelectorAll('.board-tile')[1]
  rightClick(app.window, shared)
  await app.waitFor(/Abrir tablero/)
  assert.ok(clickMenuItem(app.window, 'Eliminar tablero').disabled, 'solo el propietario elimina')
})

const ADMIN_OVERVIEW = {
  settings: { allowRegistration: true },
  stats: { users: 2, admins: 1, disabled: 0, boards: 3, lists: 6, cards: 9, sessions: 2 },
  users: [
    {
      id: 'u1',
      username: 'ana',
      name: 'Ana',
      email: 'ana@example.com',
      avatar: null,
      isAdmin: true,
      disabled: false,
      createdAt: '2026-01-05T10:00:00.000Z',
      ownedBoards: 2,
      sharedBoards: 0,
    },
    {
      id: 'u2',
      username: 'bruno',
      name: 'Bruno',
      email: 'bruno@example.com',
      avatar: null,
      isAdmin: false,
      disabled: false,
      createdAt: '2026-02-05T10:00:00.000Z',
      ownedBoards: 1,
      sharedBoards: 1,
    },
  ],
}

test('el panel de administración controla el registro y crea usuarios', { skip }, async () => {
  const admin = {
    id: 'u1',
    username: 'ana',
    name: 'Ana',
    email: 'ana@example.com',
    isAdmin: true,
  }

  const app = await mount(
    {
      'GET /api/auth/me': { status: 200, body: { user: admin } },
      'GET /api/admin/overview': { status: 200, body: ADMIN_OVERVIEW },
      'PATCH /api/admin/settings': { status: 200, body: { settings: { allowRegistration: false } } },
      'POST /api/admin/users': {
        status: 201,
        body: {
          user: {
            id: 'u3',
            username: 'carla',
            name: 'Carla',
            email: 'carla@example.com',
            avatar: null,
            isAdmin: false,
            disabled: false,
          },
        },
      },
    },
    '/admin'
  )

  const html = await app.waitFor(/Usuarios \(2\)/)
  assert.match(html, /Panel de administración/)
  assert.match(html, /Ana/)
  assert.match(html, /Administrador/)
  assert.match(html, /2 tableros propios/)
  assert.match(html, /1 tablero propio/)
  assert.match(html, /Sesiones abiertas/)
  assert.match(html, /Tableros activos/)

  // El registro público se cierra desde el interruptor.
  const toggle = app.window.document.querySelector('.toggle-row input[type="checkbox"]')
  assert.ok(toggle, 'Falta el interruptor de registro')
  assert.equal(toggle.checked, true)
  toggle.click()
  await waitForCall(app, 'PATCH /api/admin/settings')

  // Alta de un usuario nuevo desde el panel.
  clickByText(app.window, 'Alta de usuario')
  await app.waitFor(/Contraseña inicial/)

  const inputs = [...app.window.document.querySelectorAll('.admin-create .field input')]
  assert.equal(inputs.length, 4)
  setInputValue(app.window, inputs[0], 'carla')
  setInputValue(app.window, inputs[1], 'Carla')
  setInputValue(app.window, inputs[2], 'carla@example.com')
  setInputValue(app.window, inputs[3], 'secreto123')
  await new Promise((resolve) => setTimeout(resolve, 20))

  app.window.document
    .querySelector('.admin-create')
    .dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }))

  await waitForCall(app, 'POST /api/admin/users')
  const done = await app.waitFor(/Usuario @carla creado/)
  assert.doesNotMatch(done, /Contraseña inicial/, 'el formulario se limpia tras el alta')
})

test('un usuario normal no entra al panel de administración', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: {
          user: { id: 'u2', username: 'bruno', name: 'Bruno', email: 'bruno@example.com', isAdmin: false },
        },
      },
      'GET /api/boards': { status: 200, body: { boards: [] } },
    },
    '/admin'
  )

  const html = await app.waitFor(/Mis tableros/)
  assert.doesNotMatch(html, /Panel de administración/)
  assert.ok(!app.calls.some((call) => call.startsWith('GET /api/admin')), 'no debería pedir el panel')
})

test('el detalle de tarjeta permite elegir una imagen de fondo', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'GET /api/cards/c1': {
        status: 200,
        body: {
          card: {
            ...BOARD.lists[0].cards[0],
            listTitle: 'Por hacer',
            checklists: [],
            comments: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      },
    },
    '/b/b1/c/c1'
  )

  const html = await app.waitFor(/Fondo de la tarjeta/)
  assert.match(html, /Diseñar portada/)
  assert.match(html, /Prioridad/)

  const imageButton = app.window.document.querySelector('button[title="Imagen de fondo"]')
  assert.ok(imageButton, 'Falta el botón de imagen de fondo')
  imageButton.click()

  const panel = await app.waitFor(/Sube una imagen o pega su URL/)
  assert.match(panel, /Subir imagen/)
  assert.match(panel, /Usar URL/)
})
