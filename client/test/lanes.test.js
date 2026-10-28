import test from 'node:test'
import assert from 'node:assert/strict'
import { newLaneId, reconcileLanes } from '../src/lib/lanes.js'

const boards = [
  { id: 'b1', role: 'owner' },
  { id: 'b2', role: 'member' },
  { id: 'b3', role: 'owner' },
]

test('sin columnas guardadas se separan propios y compartidos', () => {
  const lanes = reconcileLanes(null, boards)
  assert.deepEqual(
    lanes.map((lane) => lane.title),
    ['Propios', 'Compartidos']
  )
  assert.deepEqual(lanes[0].boardIds, ['b1', 'b3'])
  assert.deepEqual(lanes[1].boardIds, ['b2'])
  assert.ok(lanes.every((lane) => typeof lane.id === 'string' && lane.id.length > 0))
})

test('las columnas guardadas conservan el orden y descartan duplicados y tableros perdidos', () => {
  const lanes = reconcileLanes(
    [
      { id: 'x', title: 'Ahora', boardIds: ['b2', 'b1', 'b1', 'fantasma'] },
      { id: 'y', title: 'Luego', boardIds: ['b3', 'b2'] },
    ],
    boards
  )
  assert.deepEqual(lanes[0].boardIds, ['b2', 'b1'])
  assert.deepEqual(lanes[1].boardIds, ['b3'])
  assert.deepEqual(lanes.map((lane) => lane.id), ['x', 'y'])
})

test('los tableros nuevos entran en la primera columna', () => {
  const lanes = reconcileLanes([{ id: 'x', title: 'Solo una', boardIds: ['b1'] }], boards)
  assert.equal(lanes.length, 1)
  assert.deepEqual(lanes[0].boardIds, ['b1', 'b2', 'b3'])
})

test('los títulos vacíos y los identificadores repetidos se corrigen', () => {
  const lanes = reconcileLanes(
    [
      { id: 'same', title: '   ', boardIds: [] },
      { id: 'same', title: 'Válida', boardIds: [] },
    ],
    []
  )
  assert.equal(lanes.length, 2)
  assert.match(lanes[0].title, /Columna 1/)
  assert.notEqual(lanes[0].id, lanes[1].id)
})

test('newLaneId no repite identificadores', () => {
  const ids = new Set(Array.from({ length: 20 }, () => newLaneId()))
  assert.equal(ids.size, 20)
})
