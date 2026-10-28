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
  const payloads = []
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET'
    const pathname = String(url).replace(/^https?:\/\/[^/]+/, '')
    calls.push(`${method} ${pathname}`)
    if (options.body) {
      try {
        payloads.push({ method, pathname, body: JSON.parse(options.body) })
      } catch {
        payloads.push({ method, pathname, body: options.body })
      }
    }
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
    payloads,
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
  assert.match(html, /app-version[^>]*>v1\.0</, 'la versión de la aplicación se muestra de forma discreta')
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

  clickByText(app.window, 'Menú')
  await app.waitFor(/Fondo del tablero/)
  clickByText(app.window, 'Fondo del tablero…')

  const dialog = await app.waitFor(/Imagen propia/)
  assert.match(dialog, /Degradados/)
  assert.match(dialog, /Subir imagen/)
  assert.match(dialog, /bg-ocean/)
})

test('el diálogo de etiquetas elige el color en un desplegable discreto', { skip }, async () => {
  const labelled = {
    ...BOARD,
    labels: [{ id: 'lb1', name: 'Diseño', color: 'purple' }],
  }
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: labelled },
      'PATCH /api/labels/lb1': { status: 200, body: { board: labelled } },
      'POST /api/boards/b1/labels': { status: 201, body: { board: labelled } },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  // Las etiquetas viven en el menú de la derecha, no en la barra superior.
  const header = app.window.document.querySelector('.board-header-right')
  assert.ok(
    ![...header.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Etiquetas'),
    'la barra superior no carga con etiquetas'
  )
  clickByText(app.window, 'Menú')
  await app.waitFor(/Etiquetas…/)
  clickByText(app.window, 'Etiquetas…')
  await app.waitFor(/Etiquetas del tablero/)

  const doc = app.window.document
  assert.ok(!doc.querySelector('.color-grid'), 'no hay diez colores a la vista')
  assert.equal(doc.querySelectorAll('.color-select-option').length, 0, 'la paleta está plegada')

  const trigger = doc.querySelector('.color-select-trigger')
  assert.ok(trigger, 'cada etiqueta lleva su selector de color')
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.match(trigger.textContent, /Morado/, 'el selector muestra el color actual')

  // Abrir el desplegable ofrece la paleta completa con sus nombres.
  trigger.click()
  await app.waitFor(/color-select-menu/)
  const options = [...doc.querySelectorAll('.color-select-option')]
  assert.equal(options.length, 10, 'los 10 colores de la paleta')
  assert.equal(options.filter((o) => o.getAttribute('aria-selected') === 'true').length, 1, 'hay un color elegido')
  assert.ok(
    options.every((o) => o.textContent.trim() && o.querySelector('.color-dot')),
    'cada color lleva su punto y su nombre'
  )

  const red = options.find((o) => o.textContent.trim() === 'Rojo')
  red.click()
  await waitForCall(app, 'PATCH /api/labels/lb1')
  assert.equal(app.payloads.at(-1).body.color, 'red', 'el color elegido es el que se guarda')
  assert.equal(doc.querySelectorAll('.color-select-option').length, 0, 'el desplegable se cierra al elegir')
})

test('las etiquetas nuevas también se crean con el desplegable de color', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'POST /api/boards/b1/labels': { status: 201, body: { board: BOARD } },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  clickByText(app.window, 'Menú')
  await app.waitFor(/Etiquetas…/)
  clickByText(app.window, 'Etiquetas…')
  await app.waitFor(/No hay etiquetas todavía/)

  const doc = app.window.document
  const trigger = doc.querySelector('.color-select-trigger')
  assert.ok(trigger, 'el formulario de nueva etiqueta lleva su selector')
  trigger.click()
  await app.waitFor(/color-select-menu/)

  const green = [...doc.querySelectorAll('.color-select-option')].find(
    (option) => option.textContent.trim() === 'Verde'
  )
  green.click()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(doc.querySelectorAll('.color-select-option').length, 0, 'el desplegable se cierra al elegir')
  assert.match(doc.querySelector('.color-select-trigger').textContent, /Verde/)
  assert.ok(!app.calls.includes('POST /api/boards/b1/labels'), 'elegir color no crea la etiqueta')

  setInputValue(app.window, doc.querySelector('.modal input[placeholder="Nueva etiqueta"]'), 'Calendario')
  clickByText(app.window, 'Añadir')
  await waitForCall(app, 'POST /api/boards/b1/labels')
  assert.deepEqual(app.payloads.at(-1).body, { name: 'Calendario', color: 'green' })
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

test('la búsqueda abre un modal casi a pantalla completa con resultados', { skip }, async () => {
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
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  const doc = app.window.document
  assert.ok(!doc.querySelector('.search-modal'), 'el buscador no se ve hasta pulsar Buscar')
  assert.ok(!doc.querySelector('.filter-bar'), 'los filtros tampoco se ven sin buscador')

  clickByText(app.window, 'Buscar')
  const modal = await app.waitFor(/search-modal/)
  assert.match(modal, /Buscar tarjetas por título o descripción/)
  assert.match(modal, /Cualquier fecha/, 'los filtros viajan dentro del modal')
  assert.match(modal, /Etiquetas/)
  assert.match(modal, /Miembros/)
  assert.ok(doc.querySelector('.search-modal .filter-bar'), 'el modal lleva su barra de filtros')

  const input = doc.querySelector('.search-modal input.search-input')
  assert.ok(input, 'falta el campo de búsqueda')
  assert.equal(doc.activeElement, input, 'el modal abre con el foco puesto')
  assert.ok(doc.querySelector('[data-result-id="c1"]'), 'sin texto se ven las tarjetas del tablero')

  // Los resultados aparecen mientras se escribe y el tablero de fondo no cambia.
  setInputValue(app.window, input, 'Diseñar')
  await app.waitFor(/1 de 1 tarjetas/)
  assert.ok(doc.querySelector('[data-result-id="c1"]'), 'la tarjeta coincidente aparece como resultado')
  assert.ok(doc.querySelector('[data-card-id="c1"]'), 'el tablero sigue intacto detrás del modal')

  setInputValue(app.window, input, 'no existe')
  await app.waitFor(/0 de 1 tarjetas/)
  assert.ok(!doc.querySelector('[data-result-id="c1"]'), 'sin coincidencias no hay resultados')
  assert.match(doc.querySelector('.search-empty').textContent, /Ninguna tarjeta/)

  // Los filtros del modal también cuentan (la tarjeta no tiene fecha: «Vencidas» la descarta).
  const due = doc.querySelector('.search-modal .filter-bar select')
  setSelectValue(app.window, due, 'overdue')
  await app.waitFor(/0 de 1 tarjetas/)

  // Esc cierra el modal y limpia los filtros: la siguiente búsqueda empieza de cero.
  app.window.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }))
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.ok(!doc.querySelector('.search-modal'), 'el modal se cierra')
  assert.ok(!doc.querySelector('.filter-bar'), 'y con él desaparecen los filtros')
  assert.ok(doc.querySelector('[data-card-id="c1"]'), 'el tablero vuelve a verse entero')

  clickByText(app.window, 'Buscar')
  await app.waitFor(/search-modal/)
  assert.equal(doc.querySelector('.search-modal input.search-input').value, '', 'sin texto previo')
  assert.equal(doc.querySelector('.search-modal .filter-bar select').value, 'any', 'sin filtros previos')

  // Un resultado abre la tarjeta.
  doc.querySelector('[data-result-id="c1"]').click()
  await app.waitFor(/card-modal/)
  assert.match(app.window.location.pathname, /\/b\/b1\/c\/c1$/)
  assert.ok(!doc.querySelector('.search-modal'), 'al abrir la tarjeta el buscador se cierra')
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
  assert.match(boardMenu, /Eliminar tablero/)
  assert.doesNotMatch(boardMenu, /Archivar tablero/, 'ya no se ofrece archivar el tablero')

  clickMenuItem(app.window, 'Buscar en el tablero')
  await app.waitFor(/search-modal/)
  assert.ok(app.window.document.querySelector('.search-modal input.search-input'))
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
    'DELETE /api/boards/b1': { status: 200, body: { ok: true } },
  })

  await app.waitFor(/Proyectos/)
  const tile = app.window.document.querySelectorAll('.board-tile')[0]
  assert.ok(rightClick(app.window, tile).defaultPrevented)
  const menu = await app.waitFor(/Abrir tablero/)
  assert.match(menu, /Eliminar tablero/)
  assert.doesNotMatch(menu, /Archivar tablero/, 'ya no se ofrece archivar el tablero')

  // Sin archivar, la acción del menú es eliminar, y recarga la lista una sola vez.
  clickMenuItem(app.window, 'Eliminar tablero')
  const confirmDialog = await app.waitFor(/confirm-dialog/)
  assert.match(confirmDialog, /¿Eliminar el tablero «Proyectos»/, 'la confirmación es de la app')
  const confirmButton = [...app.window.document.querySelectorAll('.confirm-dialog button')].find(
    (el) => el.textContent.trim() === 'Eliminar tablero'
  )
  assert.ok(confirmButton, 'el diálogo ofrece confirmar la eliminación')
  confirmButton.click()
  await waitForCall(app, 'DELETE /api/boards/b1')
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

test('añadir lista vive en la vista de tablero, como una columna más', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'POST /api/boards/b1/lists': { status: 201, body: BOARD },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  const doc = app.window.document
  const header = doc.querySelector('.board-header-right')
  assert.ok(
    ![...header.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Añadir lista'),
    'la barra superior ya no lleva el botón'
  )
  assert.ok(!doc.querySelector('.new-list-form'), 'el formulario no aparece hasta pulsar el botón')

  const lists = doc.querySelector('.lists')
  const addButton = [...lists.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === 'Añadir lista'
  )
  assert.ok(addButton, 'el botón está dentro del tablero')
  assert.ok(
    lists.lastElementChild.contains(addButton),
    'y se sitúa al final de las listas, a la derecha'
  )

  addButton.click()
  await app.waitFor(/new-list-form/)
  const form = doc.querySelector('.new-list-form')
  assert.equal(
    form.parentElement,
    lists.lastElementChild,
    'la lista que se nombra ocupa el hueco de la derecha, no la fila de arriba'
  )
  const input = form.querySelector('input')
  assert.equal(doc.activeElement, input, 'el formulario abre con el foco puesto')

  setInputValue(app.window, input, 'Hecho')
  await new Promise((resolve) => setTimeout(resolve, 20))
  form.dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }))
  await waitForCall(app, 'POST /api/boards/b1/lists')
  assert.equal(app.payloads.at(-1).body.title, 'Hecho')

  // En la vista de calendario no hay botón de añadir lista.
  clickByText(app.window, 'Calendario')
  await app.waitFor(/calendar-grid/)
  assert.ok(
    ![...doc.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Añadir lista'),
    'en el calendario no se ofrece añadir listas'
  )
})

test('renombrar una lista no arrastra la columna', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'PATCH /api/lists/l1': { status: 200, body: BOARD },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  const list = () => app.window.document.querySelector('[data-list-id="l1"]')
  const head = () => list().querySelector('.list-head')
  assert.equal(head().getAttribute('draggable'), 'true', 'la columna se arrastra desde su cabecera')

  rightClick(app.window, list())
  await app.waitFor(/Renombrar lista/)
  clickMenuItem(app.window, 'Renombrar lista')

  const editing = await app.waitFor(/list-head editing/)
  assert.equal(head().getAttribute('draggable'), 'false', 'renombrando no se arrastra la columna')
  assert.ok(head().classList.contains('editing'), 'la cabecera deja de parecer un asa')

  // Escape cancela el renombrado (sin guardar) y devuelve el arrastre.
  const input = head().querySelector('input')
  assert.equal(app.window.document.activeElement, input)
  input.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(!app.calls.includes('PATCH /api/lists/l1'), 'Escape no guarda el nombre')
  assert.equal(head().getAttribute('draggable'), 'true')
  assert.ok(!editing.includes('draggable="false"') || head().getAttribute('draggable') === 'true')

  // Al salir del campo, sí se guarda.
  rightClick(app.window, list())
  await app.waitFor(/Renombrar lista/)
  clickMenuItem(app.window, 'Renombrar lista')
  await app.waitFor(/list-head editing/)
  setInputValue(app.window, head().querySelector('input'), 'Pendiente')
  // focusout es el evento con el que React escucha el blur.
  head().querySelector('input').dispatchEvent(new app.window.FocusEvent('focusout', { bubbles: true }))
  await waitForCall(app, 'PATCH /api/lists/l1')
  assert.equal(app.payloads.at(-1).body.title, 'Pendiente')
})

test('un elemento de checklist largo se ve entero de un vistazo', { skip }, async () => {
  const longText =
    'Revisar y documentar todos los casos límite del importador de CSV, incluidas las filas vacías, los separadores repetidos y los acentos mal codificados'
  const card = {
    ...BOARD.lists[0].cards[0],
    listTitle: 'Por hacer',
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    checklists: [
      {
        id: 'cl1',
        title: 'Pasos',
        position: 1000,
        items: [{ id: 'i1', text: longText, done: false, position: 1000 }],
      },
    ],
  }

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'GET /api/cards/c1': { status: 200, body: { card } },
    },
    '/b/b1/c/c1'
  )

  await app.waitFor(/checklist-item-text/)
  const field = app.window.document.querySelector('.checklist-item-text')
  assert.equal(field.tagName, 'TEXTAREA', 'el texto del elemento es un campo que envuelve y crece')
  assert.equal(field.value, longText, 'se ve el texto completo, sin recortar')
  assert.ok(
    app.window.document.querySelectorAll('.checklist-items .item textarea').length === 1,
    'cada elemento tiene su campo'
  )
})

test('la vista previa del markdown dibuja tablas y listas de tareas', { skip }, async () => {
  const description = [
    '# Plan',
    '',
    '- [x] hecho',
    '- [ ] pendiente',
    '',
    '| Tarea | Estado |',
    '| --- | --- |',
    '| Uno | Listo |',
    '',
    '![foto](https://ejemplo.com/f.png)',
    '',
    '<img src="x" onerror="alert(1)">',
  ].join('\n')
  const card = {
    ...BOARD.lists[0].cards[0],
    description,
    listTitle: 'Por hacer',
    checklists: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'GET /api/cards/c1': { status: 200, body: { card } },
    },
    '/b/b1/c/c1'
  )

  const safe = await app.waitFor(/Plan/)
  assert.doesNotMatch(safe, /onerror/, 'el markdown no inyecta atributos peligrosos')

  const block = [...app.window.document.querySelectorAll('.block')].find((section) =>
    section.textContent.includes('Descripción')
  )
  const edit = [...block.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Editar')
  edit.click()
  await app.waitFor(/desc-editor/)

  clickByText(app.window, 'Vista previa')
  const preview = await app.waitFor(/desc-preview/)
  const doc = app.window.document

  assert.match(preview, /<table>/, 'la tabla se dibuja en la vista previa')
  assert.equal(doc.querySelectorAll('.desc-preview th').length, 2)
  assert.equal(doc.querySelector('.desc-preview th').textContent, 'Tarea')

  const checkboxes = doc.querySelectorAll('.desc-preview input[type="checkbox"]')
  assert.equal(checkboxes.length, 2, 'las casillas de la lista de tareas se conservan')
  assert.equal(checkboxes[0].checked, true, 'la casilla marcada viene marcada')
  assert.ok(doc.querySelector('.desc-preview img'), 'la imagen se conserva')
})

test('editar no se descarta con la primera pulsación accidental', { skip }, async () => {
  const card = {
    ...BOARD.lists[0].cards[0],
    listTitle: 'Por hacer',
    checklists: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'GET /api/cards/c1': { status: 200, body: { card } },
      'PATCH /api/cards/c1': { status: 200, body: { card: { ...card, title: 'Título nuevo' } } },
    },
    '/b/b1/c/c1'
  )

  await app.waitFor(/Descripción/)
  const doc = app.window.document
  const press = (target) => target.dispatchEvent(new app.window.MouseEvent('mousedown', { bubbles: true }))
  const release = (target) => target.dispatchEvent(new app.window.MouseEvent('mouseup', { bubbles: true }))

  // Se abre el editor del título.
  doc.querySelector('.card-modal-title').click()
  await app.waitFor(/data-card-title/)
  const input = doc.querySelector('[data-card-title] input')
  setInputValue(app.window, input, 'Título nuevo')
  await new Promise((resolve) => setTimeout(resolve, 320))

  // Seleccionar texto y soltar el ratón fuera no cierra el editor.
  press(input)
  release(doc.body)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.ok(doc.querySelector('[data-card-title]'), 'la selección que acaba fuera no cierra el editor')
  assert.ok(!app.calls.includes('PATCH /api/cards/c1'), 'y no guarda a medias')

  // Pulsar y soltar fuera sí guarda y sale.
  press(doc.body)
  release(doc.body)
  await waitForCall(app, 'PATCH /api/cards/c1')
  assert.equal(app.payloads.at(-1).body.title, 'Título nuevo')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(!doc.querySelector('[data-card-title]'), 'el editor se cierra al salir del campo')

  // El fondo del modal no cierra la tarjeta si la pulsación empezó dentro.
  press(doc.querySelector('.card-modal-title'))
  doc.querySelector('.modal-backdrop').dispatchEvent(
    new app.window.MouseEvent('click', { bubbles: true, cancelable: true })
  )
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(doc.querySelector('.card-modal'), 'el modal sigue abierto')

  // Con un editor abierto, el primer clic en el fondo solo lo cierra a él.
  doc.querySelector('.card-modal-title').click()
  await app.waitFor(/data-card-title/)
  await new Promise((resolve) => setTimeout(resolve, 320))
  const backdrop = doc.querySelector('.modal-backdrop')
  press(backdrop)
  release(backdrop)
  backdrop.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(!doc.querySelector('[data-card-title]'), 'el editor se cierra')
  assert.ok(doc.querySelector('.card-modal'), 'pero la tarjeta sigue abierta')

  // Escape sale del campo y, sin nada abierto, cierra la tarjeta.
  doc.querySelector('.card-modal-title').click()
  await app.waitFor(/data-card-title/)
  await new Promise((resolve) => setTimeout(resolve, 60))
  app.window.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }))
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.ok(doc.querySelector('.card-modal'), 'Escape con un editor abierto no cierra la tarjeta')
  assert.ok(!doc.querySelector('[data-card-title]'))

  app.window.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }))
  const deadline = Date.now() + 2000
  while (Date.now() < deadline && doc.querySelector('.card-modal')) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.ok(!doc.querySelector('.card-modal'), 'sin editores, Escape vuelve al tablero')
  assert.ok(doc.querySelector('.board-canvas'), 'y se ve el tablero')
})

test('el título del tablero se guarda al salir, no al primer arrastre', { skip }, async () => {
  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'PATCH /api/boards/b1': {
        status: 200,
        body: { ...BOARD, board: { ...BOARD.board, title: 'Proyectos 2026' } },
      },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  const doc = app.window.document
  doc.querySelector('.board-title').click()
  await app.waitFor(/data-board-title/)
  const input = doc.querySelector('[data-board-title] input')
  setInputValue(app.window, input, 'Proyectos 2026')
  await new Promise((resolve) => setTimeout(resolve, 320))

  input.dispatchEvent(new app.window.MouseEvent('mousedown', { bubbles: true }))
  doc.body.dispatchEvent(new app.window.MouseEvent('mouseup', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.ok(doc.querySelector('[data-board-title]'), 'sigue editando si el ratón acaba fuera')

  doc.body.dispatchEvent(new app.window.MouseEvent('mousedown', { bubbles: true }))
  doc.body.dispatchEvent(new app.window.MouseEvent('mouseup', { bubbles: true }))
  await waitForCall(app, 'PATCH /api/boards/b1')
  assert.equal(app.payloads.at(-1).body.title, 'Proyectos 2026')
})

function setTextareaValue(win, input, value) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new win.Event('input', { bubbles: true }))
}

const tick = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms))

test('la página de tableros alterna entre vista normal y Kanban', { skip }, async () => {
  const boards = [
    {
      id: 'b1',
      title: 'Proyectos',
      background: 'berry',
      ownerId: 'u1',
      role: 'owner',
      listCount: 3,
      cardCount: 5,
      overdueCount: 1,
      members: [{ id: 'u1', username: 'ana', name: 'Ana' }],
    },
    {
      id: 'b2',
      title: 'Equipo',
      background: 'ocean',
      ownerId: 'u2',
      role: 'member',
      listCount: 1,
      cardCount: 2,
      overdueCount: 0,
      members: [{ id: 'u2', username: 'bruno', name: 'Bruno' }],
    },
  ]

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards': { status: 200, body: { boards } },
    },
    '/'
  )

  await app.waitFor(/Proyectos/)
  const doc = app.window.document
  assert.ok(doc.querySelector('.board-grid'), 'la vista normal muestra la cuadrícula')
  assert.equal(doc.querySelectorAll('.boards-kanban-cards .board-tile').length, 0)

  clickByText(app.window, 'Kanban')
  const kanban = await app.waitFor(/boards-kanban/)
  assert.match(kanban, /Propios/)
  assert.match(kanban, /Compartidos/)
  assert.equal(doc.querySelectorAll('.boards-kanban-column').length, 2)
  const kanbanTiles = doc.querySelectorAll('.boards-kanban-cards .board-tile')
  assert.equal(kanbanTiles.length, 2, 'cada tablero usa la misma tarjeta que la vista normal')
  assert.equal(kanbanTiles[0].textContent.includes('Proyectos'), true)
  assert.ok(doc.querySelector('.boards-main-wide'), 'el tablero maestro ocupa todo el ancho')
  assert.equal(app.window.localStorage.getItem('utrel:boards-view'), 'kanban')

  clickByText(app.window, 'Normal')
  await app.waitFor(/board-grid/)
  assert.equal(app.window.localStorage.getItem('utrel:boards-view'), 'grid')
})

test('la cinta Markdown aplica formato a la descripción', { skip }, async () => {
  const card = {
    ...BOARD.lists[0].cards[0],
    description: '',
    listTitle: 'Por hacer',
    checklists: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'GET /api/cards/c1': { status: 200, body: { card } },
      'PATCH /api/cards/c1': { status: 200, body: { card } },
    },
    '/b/b1/c/c1'
  )

  await app.waitFor(/Descripción/)
  const doc = app.window.document
  const block = [...doc.querySelectorAll('.block')].find((section) =>
    section.textContent.includes('Descripción')
  )
  ;[...block.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Editar').click()
  await app.waitFor(/desc-toolbar/)

  assert.equal(doc.querySelectorAll('.desc-toolbar .desc-tool').length, 10, 'la cinta trae sus diez acciones')
  assert.ok(doc.querySelector('.desc-tool[aria-label="Negrita"]'))

  const textarea = doc.querySelector('.desc-editor textarea')
  setTextareaValue(app.window, textarea, 'Hola')
  await tick()
  textarea.focus()
  textarea.setSelectionRange(0, 4)

  doc.querySelector('.desc-tool[aria-label="Negrita"]').click()
  await tick()
  assert.equal(textarea.value, '**Hola**', 'la negrita envuelve el texto seleccionado')

  doc.querySelector('.desc-tool[aria-label="Encabezado"]').click()
  await tick()
  assert.equal(textarea.value, '# **Hola**', 'el encabezado se aplica a la línea')

  const save = [...doc.querySelectorAll('.desc-editor button')].find(
    (el) => el.textContent.trim() === 'Guardar'
  )
  save.click()
  await waitForCall(app, 'PATCH /api/cards/c1')
  assert.equal(app.payloads.at(-1).body.description, '# **Hola**', 'se guarda el texto con formato')
})

test('las asas permiten reordenar checklists y mover un elemento a otra checklist', { skip }, async () => {
  const card = {
    ...BOARD.lists[0].cards[0],
    description: '',
    listTitle: 'Por hacer',
    checklists: [
      {
        id: 'k1',
        title: 'Uno',
        items: [
          { id: 'i1', text: 'Primero', done: false },
          { id: 'i2', text: 'Segundo', done: false },
        ],
      },
      { id: 'k2', title: 'Dos', items: [] },
    ],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'GET /api/cards/c1': { status: 200, body: { card } },
      'PATCH /api/checklists/k1': { status: 200, body: { card } },
      'PATCH /api/checklist-items/i1': { status: 200, body: { card } },
    },
    '/b/b1/c/c1'
  )

  await app.waitFor(/checklist-item-text/)
  const doc = app.window.document
  assert.equal(doc.querySelectorAll('.checklist-head .drag-handle').length, 2)
  assert.equal(doc.querySelectorAll('.item-handle').length, 2, 'cada elemento lleva su asa')

  const pointer = (type, target, x = 5, y = 5) =>
    target.dispatchEvent(new app.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }))

  // Arrastrar la primera checklist al final.
  pointer('pointerdown', doc.querySelector('[data-checklist-id="k1"] .drag-handle'))
  await tick()
  assert.ok(doc.querySelector('.drag-ghost'), 'el arrastre empieza al pulsar el asa')
  pointer('pointerup', app.window)
  await waitForCall(app, 'PATCH /api/checklists/k1')
  assert.equal(app.payloads.at(-1).body.targetIndex, 1, 'el índice descuenta la checklist movida')

  // Arrastrar un elemento a la checklist vacía.
  doc.querySelector('[data-checklist-id="k2"]').getBoundingClientRect = () => ({
    top: 20,
    bottom: 80,
    left: 0,
    right: 200,
    width: 200,
    height: 60,
  })
  doc.elementFromPoint = () => doc.querySelector('[data-checklist-id="k2"]')
  pointer('pointerdown', doc.querySelector('[data-item-id="i1"] .item-handle'))
  await tick()
  pointer('pointerup', app.window, 20, 40)
  await waitForCall(app, 'PATCH /api/checklist-items/i1')
  const moved = app.payloads.at(-1).body
  assert.equal(moved.checklistId, 'k2', 'el elemento se envía a la checklist de destino')
  assert.equal(moved.targetIndex, 0, 'y al principio de la checklist vacía')
})

test('arrastrar una tarjeta en el calendario cambia su fecha de vencimiento', { skip }, async () => {
  const card = {
    ...BOARD.lists[0].cards[0],
    dueDate: null,
    listTitle: 'Por hacer',
    checklists: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'PATCH /api/cards/c1': { status: 200, body: { card } },
    },
    '/b/b1'
  )

  await app.waitFor(/Diseñar portada/)
  const doc = app.window.document
  clickByText(app.window, 'Calendario')
  await app.waitFor(/calendar-grid/)

  assert.match(doc.querySelector('.calendar-hint').textContent, /Arrastra una tarjeta/)
  const chip = doc.querySelector('.calendar-undated .calendar-chip')
  assert.ok(chip, 'la tarjeta sin fecha se puede arrastrar al calendario')

  const day = doc.querySelector('.calendar-day[data-calendar-day]')
  const key = day.getAttribute('data-calendar-day')
  doc.elementFromPoint = () => day

  const pointer = (type, target, x, y) =>
    target.dispatchEvent(new app.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }))

  pointer('pointerdown', chip, 5, 5)
  pointer('pointermove', app.window, 40, 40)
  pointer('pointerup', app.window, 40, 40)

  await waitForCall(app, 'PATCH /api/cards/c1')
  const body = app.payloads.at(-1).body
  const [year, month, date] = key.split('-').map(Number)
  assert.equal(
    body.dueDate,
    new Date(year, month - 1, date, 12, 0, 0, 0).toISOString(),
    'la fecha pasa al día donde se suelta, con hora de mediodía'
  )
})

const KANBAN_BOARDS = [
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
    title: 'Equipo',
    background: 'ocean',
    ownerId: 'u2',
    role: 'member',
    listCount: 1,
    cardCount: 2,
    overdueCount: 0,
    members: [{ id: 'u2', username: 'bruno', name: 'Bruno' }],
  },
]

const startInKanban = (window) => window.localStorage.setItem('utrel:boards-view', 'kanban')

const kanbanMount = (routes) =>
  mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      ...routes,
    },
    '/',
    startInKanban
  )

const LANES = [
  { id: 'l1', title: 'Foco', boardIds: ['b1'] },
  { id: 'l2', title: 'Después', boardIds: ['b2'] },
]

test('las columnas Kanban se muestran y se renombran', { skip }, async () => {
  const renamed = [{ ...LANES[0], title: 'Prioridad' }, LANES[1]]
  const app = await kanbanMount({
    'GET /api/boards': { status: 200, body: { boards: KANBAN_BOARDS, lanes: LANES } },
    'PUT /api/boards/lanes': { status: 200, body: { lanes: renamed } },
  })

  await app.waitFor(/Foco/)
  const doc = app.window.document
  assert.deepEqual(
    [...doc.querySelectorAll('.boards-kanban-head h3')].map((node) => node.textContent.trim()),
    ['Foco', 'Después']
  )
  assert.equal(doc.querySelectorAll('.boards-kanban-column').length, 2)
  assert.match(doc.querySelector('.boards-kanban-column').textContent, /Proyectos/)

  doc.querySelector('[aria-label="Renombrar «Foco»"]').click()
  await tick()
  const input = doc.querySelector('.lane-rename input')
  assert.ok(input, 'la cabecera pasa a edición')
  setInputValue(app.window, input, 'Prioridad')
  doc.querySelector('.lane-rename').dispatchEvent(
    new app.window.Event('submit', { bubbles: true, cancelable: true })
  )

  await waitForCall(app, 'PUT /api/boards/lanes')
  assert.equal(app.payloads.at(-1).body.lanes[0].title, 'Prioridad')
  await app.waitFor(/Prioridad/)
})

test('las columnas Kanban se añaden, se mueven y se eliminan', { skip }, async () => {
  // Añadir una columna.
  const added = await kanbanMount({
    'GET /api/boards': { status: 200, body: { boards: KANBAN_BOARDS, lanes: LANES } },
    'PUT /api/boards/lanes': { status: 200, body: { lanes: LANES } },
  })
  await added.waitFor(/Foco/)
  clickByText(added.window, 'Añadir columna')
  await tick()
  const form = added.window.document.querySelector('.boards-kanban-add .lane-rename')
  assert.ok(form, 'aparece el formulario de columna nueva')
  setInputValue(added.window, form.querySelector('input'), 'Archivo')
  form.dispatchEvent(new added.window.Event('submit', { bubbles: true, cancelable: true }))
  await waitForCall(added, 'PUT /api/boards/lanes')
  const payload = added.payloads.at(-1).body.lanes
  assert.equal(payload.length, 3)
  assert.equal(payload[2].title, 'Archivo')
  assert.deepEqual(payload[2].boardIds, [])

  // Mover un tablero de columna desde su tarjeta.
  const moved = await kanbanMount({
    'GET /api/boards': { status: 200, body: { boards: KANBAN_BOARDS, lanes: LANES } },
    'PUT /api/boards/lanes': { status: 200, body: { lanes: LANES } },
  })
  await moved.waitFor(/Foco/)
  const tile = moved.window.document.querySelector('.boards-kanban-cards .board-tile')
  assert.ok(tile, 'la tarjeta de tablero se muestra en su columna')
  rightClick(moved.window, tile)
  await moved.waitFor(/Mover a «Después»/)
  clickMenuItem(moved.window, 'Mover a «Después»')
  await waitForCall(moved, 'PUT /api/boards/lanes')
  const movedLanes = moved.payloads.at(-1).body.lanes
  assert.deepEqual(movedLanes[0].boardIds, [])
  assert.deepEqual(movedLanes[1].boardIds, ['b2', 'b1'])

  // Eliminar una columna reparte sus tableros entre las que quedan.
  const deleted = await kanbanMount({
    'GET /api/boards': { status: 200, body: { boards: KANBAN_BOARDS, lanes: LANES } },
    'PUT /api/boards/lanes': { status: 200, body: { lanes: LANES } },
  })
  await deleted.waitFor(/Foco/)
  deleted.window.document.querySelector('[aria-label="Eliminar «Después»"]').click()
  await deleted.waitFor(/confirm-dialog/)
  const confirm = [...deleted.window.document.querySelectorAll('.confirm-dialog button')].find(
    (button) => button.textContent.trim() === 'Eliminar columna'
  )
  confirm.click()
  await waitForCall(deleted, 'PUT /api/boards/lanes')
  const remaining = deleted.payloads.at(-1).body.lanes
  assert.equal(remaining.length, 1)
  assert.deepEqual(remaining[0].boardIds, ['b1', 'b2'])
})

test('los tableros se arrastran entre columnas en la vista Kanban', { skip }, async () => {
  const app = await kanbanMount({
    'GET /api/boards': { status: 200, body: { boards: KANBAN_BOARDS, lanes: LANES } },
    'PUT /api/boards/lanes': { status: 200, body: { lanes: LANES } },
  })
  await app.waitFor(/Foco/)

  const doc = app.window.document
  const [source, target] = doc.querySelectorAll('.boards-kanban-column')
  const tile = source.querySelector('.board-tile')
  assert.ok(tile, 'la tarjeta de tablero es arrastrable')

  const data = new Map()
  const dataTransfer = {
    effectAllowed: '',
    dropEffect: '',
    setData: (type, value) => data.set(type, value),
    getData: (type) => data.get(type) || '',
  }
  const dragEvent = (type) => {
    const event = new app.window.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
    return event
  }

  tile.dispatchEvent(dragEvent('dragstart'))
  await tick()
  assert.match(tile.className, /dragging/)
  assert.equal(data.get('text/plain'), 'b1')

  target.dispatchEvent(dragEvent('dragover'))
  await tick()
  assert.match(target.className, /drop-target/, 'la columna destino se resalta')

  target.dispatchEvent(dragEvent('drop'))
  await tick()
  assert.equal(
    doc.querySelectorAll('.board-tile.dragging').length,
    0,
    'al soltar, ninguna tarjeta queda oscurecida aunque no llegue dragend'
  )
  await waitForCall(app, 'PUT /api/boards/lanes')

  const movedLanes = app.payloads.at(-1).body.lanes
  assert.deepEqual(movedLanes[0].boardIds, [])
  assert.deepEqual(movedLanes[1].boardIds, ['b2', 'b1'])
})

test('la portada de la tarjeta permite elegir el encuadre de la imagen', { skip }, async () => {
  const card = {
    ...BOARD.lists[0].cards[0],
    coverImage: 'https://ejemplo.com/portada.png',
    coverColor: null,
    coverPosition: 'top',
    listTitle: 'Por hacer',
    checklists: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const app = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'GET /api/cards/c1': { status: 200, body: { card } },
      'PATCH /api/cards/c1': { status: 200, body: { card } },
    },
    '/b/b1/c/c1'
  )

  await app.waitFor(/Descripción/)
  const doc = app.window.document
  const coverCol = [...doc.querySelectorAll('.meta-col')].find((section) =>
    section.textContent.includes('Fondo de la tarjeta')
  )
  ;[...coverCol.querySelectorAll('button')].find((button) => button.title === 'Imagen de fondo').click()
  await app.waitFor(/cover-position/)

  const cells = doc.querySelectorAll('.cover-position-cell')
  assert.equal(cells.length, 9, 'hay una cuadrícula 3×3 de encuadres')
  assert.equal(doc.querySelectorAll('.cover-position-cell.active').length, 1, 'un encuadre está elegido')
  assert.match(doc.querySelector('.cover-position-preview').getAttribute('style'), /50% 0%/, 'la previsualización usa el encuadre actual')

  doc.querySelector('[aria-label="Encuadrar la imagen: Abajo derecha"]').click()
  await waitForCall(app, 'PATCH /api/cards/c1')
  assert.equal(app.payloads.at(-1).body.coverPosition, 'bottom-right')
})

test('el tablero y la tarjeta muestran su historial de actividad', { skip }, async () => {
  const activity = [
    {
      id: 'a1',
      kind: 'card_member',
      message: 'asignó a @bruno a la tarjeta',
      createdAt: new Date().toISOString(),
      user: { id: 'u1', username: 'ana', name: 'Ana', avatar: null },
    },
  ]
  const card = {
    ...BOARD.lists[0].cards[0],
    listTitle: 'Por hacer',
    checklists: [],
    comments: [],
    activity,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const cardApp = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': { status: 200, body: BOARD },
      'GET /api/cards/c1': { status: 200, body: { card } },
    },
    '/b/b1/c/c1'
  )
  const cardHtml = await cardApp.waitFor(/Actividad de la tarjeta/)
  assert.match(cardHtml, /asignó a @bruno/)

  const boardApp = await mount(
    {
      'GET /api/auth/me': {
        status: 200,
        body: { user: { id: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com' } },
      },
      'GET /api/boards/b1': {
        status: 200,
        body: { ...BOARD, activity: [{ ...activity[0], message: 'cambió el fondo del tablero' }] },
      },
    },
    '/b/b1'
  )
  await boardApp.waitFor(/Diseñar portada/)
  clickByText(boardApp.window, 'Menú')
  await boardApp.waitFor(/Actividad del tablero/)
  clickByText(boardApp.window, 'Actividad del tablero…')
  const dialog = await boardApp.waitFor(/activity-list/)
  assert.match(dialog, /cambió el fondo del tablero/)
  assert.match(dialog, /Ana/, 'la entrada muestra el autor')
})

test('los desplegables del tablero se cierran al pulsar fuera', { skip }, async () => {
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
  const doc = app.window.document
  const press = (target) => target.dispatchEvent(new app.window.MouseEvent('mousedown', { bubbles: true }))
  const release = (target) => target.dispatchEvent(new app.window.MouseEvent('mouseup', { bubbles: true }))
  const outside = async () => {
    press(doc.querySelector('.board-canvas'))
    release(doc.querySelector('.board-canvas'))
    await new Promise((resolve) => setTimeout(resolve, 40))
  }

  // Hay un pequeño margen de gracia tras abrir un desplegable: se respeta.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 320))

  // Menú superior derecho.
  clickByText(app.window, 'Menú')
  await app.waitFor(/Elementos archivados/)
  assert.ok(doc.querySelector('.board-header-right .popover'), 'el menú se abre')
  await settle()
  await outside()
  assert.ok(!doc.querySelector('.board-header-right .popover'), 'un clic fuera lo cierra')

  // Y también con Escape.
  clickByText(app.window, 'Menú')
  await app.waitFor(/Elementos archivados/)
  app.window.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }))
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.ok(!doc.querySelector('.board-header-right .popover'), 'Escape lo cierra')

  // Menú de la lista.
  doc.querySelector('[data-list-id="l1"] .list-head .menu-wrap button').click()
  await app.waitFor(/Límite de tarjetas/)
  assert.ok(doc.querySelector('[data-list-id="l1"] .popover'), 'el menú de la lista se abre')
  await settle()
  await outside()
  assert.ok(!doc.querySelector('[data-list-id="l1"] .popover'), 'un clic fuera lo cierra')

  // Pulsar dentro del propio menú no lo cierra.
  doc.querySelector('[data-list-id="l1"] .list-head .menu-wrap button').click()
  await app.waitFor(/Límite de tarjetas/)
  await settle()
  const inside = doc.querySelector('[data-list-id="l1"] .popover .meta-label')
  press(inside)
  release(inside)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.ok(doc.querySelector('[data-list-id="l1"] .popover'), 'pulsar dentro no cierra el menú')
})
