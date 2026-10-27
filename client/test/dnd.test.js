import test from 'node:test'
import assert from 'node:assert/strict'
import {
  columnIndexFromRects,
  dropIndexFromRects,
  dropIndicatorOffset,
  resolveInsertIndex,
  serverIndexFor,
} from '../src/lib/dnd.js'

const cards = (...ids) => ids.map((id) => ({ id }))

test('sin filtros el índice visible coincide con el de la lista', () => {
  const full = cards('a', 'b', 'c')
  assert.equal(resolveInsertIndex(full, full, 0), 0)
  assert.equal(resolveInsertIndex(full, full, 2), 2)
  assert.equal(resolveInsertIndex(full, full, 3), 3)
})

test('con filtros activos se inserta antes de la tarjeta de referencia', () => {
  const full = cards('a', 'b', 'c', 'd')
  const visible = [full[0], full[3]] // el filtro oculta b y c
  assert.equal(resolveInsertIndex(visible, full, 0), 0)
  assert.equal(resolveInsertIndex(visible, full, 1), 3)
  // soltando al final de las visibles se añade al final de la lista completa
  assert.equal(resolveInsertIndex(visible, full, 2), 4)
})

test('una referencia ausente cae al final en lugar de perder la tarjeta', () => {
  const full = cards('a', 'b')
  assert.equal(resolveInsertIndex(cards('z'), full, 0), 2)
})

test('lista vacía siempre devuelve 0', () => {
  assert.equal(resolveInsertIndex([], [], 5), 0)
})

test('el índice de inserción se decide por los puntos medios de las tarjetas', () => {
  const rects = [
    { top: 0, height: 40 },
    { top: 48, height: 40 },
    { top: 96, height: 40 },
  ]
  assert.equal(dropIndexFromRects(rects, -50), 0)
  assert.equal(dropIndexFromRects(rects, 19), 0)
  assert.equal(dropIndexFromRects(rects, 21), 1)
  assert.equal(dropIndexFromRects(rects, 70), 2)
  assert.equal(dropIndexFromRects(rects, 500), 3)
  assert.equal(dropIndexFromRects([], 120), 0)
})

test('el indicador se pinta en el borde de la tarjeta sin mover el layout', () => {
  const rects = [
    { top: 100, height: 40 },
    { top: 150, height: 40 },
  ]
  assert.equal(dropIndicatorOffset([], 0, 0), 0)
  assert.equal(dropIndicatorOffset(rects, 0, 90), 10)
  assert.equal(dropIndicatorOffset(rects, 1, 90), 60)
  assert.equal(dropIndicatorOffset(rects, 2, 90), 100)
  // con la lista desplazada la posición se mantiene relativa al contenido
  assert.equal(dropIndicatorOffset(rects, 1, 90, 30), 90)
})

test('la columna de destino se decide por la mitad horizontal', () => {
  const columns = [
    { left: 0, right: 100, width: 100 },
    { left: 110, right: 210, width: 100 },
  ]
  assert.equal(columnIndexFromRects(columns, 10), 0)
  assert.equal(columnIndexFromRects(columns, 60), 1)
  assert.equal(columnIndexFromRects(columns, 999), 2)
  assert.equal(columnIndexFromRects([], 40), 0)
})

test('reordenar dentro de la misma lista descuenta la tarjeta arrastrada', () => {
  // arrastrando hacia abajo el servidor excluye la tarjeta movida
  assert.equal(serverIndexFor(2, { sameList: true, fromIndex: 0 }), 1)
  // arrastrando hacia arriba no hay que ajustar nada
  assert.equal(serverIndexFor(1, { sameList: true, fromIndex: 3 }), 1)
  // entre listas distintas tampoco
  assert.equal(serverIndexFor(2, { sameList: false, fromIndex: 0 }), 2)
  assert.equal(serverIndexFor(0, { sameList: true, fromIndex: 0 }), 0)
})
