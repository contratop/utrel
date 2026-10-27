import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DAY_MS,
  dueStatus,
  dueStatusLabel,
  fromLocalInput,
  parseDue,
  toLocalInput,
} from '../src/lib/dueDate.js'

const NOW = new Date('2026-03-10T12:00:00Z').getTime()

test('sin fecha devuelve "none"', () => {
  assert.equal(dueStatus(null, false, NOW), 'none')
  assert.equal(dueStatus(undefined, false, NOW), 'none')
  assert.equal(dueStatus('', false, NOW), 'none')
})

test('una fecha ya pasada se marca como vencida (morado)', () => {
  assert.equal(dueStatus('2026-03-10T11:59:00Z', false, NOW), 'overdue')
  assert.equal(dueStatus('2026-03-09T00:00:00Z', false, NOW), 'overdue')
  assert.equal(dueStatusLabel('2026-03-01T00:00:00Z', false, NOW), 'Vencida')
})

test('cuando queda 1 día o menos se marca en rojo (urgent)', () => {
  assert.equal(dueStatus('2026-03-10T12:00:01Z', false, NOW), 'urgent')
  assert.equal(dueStatus('2026-03-10T18:00:00Z', false, NOW), 'urgent')
  // exactamente 24 h sigue siendo rojo
  assert.equal(dueStatus(new Date(NOW + DAY_MS).toISOString(), false, NOW), 'urgent')
})

test('cuando quedan entre 1 y 3 días se marca en naranja (soon)', () => {
  assert.equal(dueStatus(new Date(NOW + DAY_MS + 1000).toISOString(), false, NOW), 'soon')
  assert.equal(dueStatus(new Date(NOW + 2 * DAY_MS).toISOString(), false, NOW), 'soon')
  // exactamente 3 días sigue siendo naranja
  assert.equal(dueStatus(new Date(NOW + 3 * DAY_MS).toISOString(), false, NOW), 'soon')
})

test('a más de 3 días no se resalta (later)', () => {
  assert.equal(dueStatus(new Date(NOW + 3 * DAY_MS + 1000).toISOString(), false, NOW), 'later')
  assert.equal(dueStatus('2026-04-01T00:00:00Z', false, NOW), 'later')
})

test('las completadas se pintan en verde aunque estén vencidas', () => {
  assert.equal(dueStatus('2026-03-01T00:00:00Z', true, NOW), 'complete')
  assert.equal(dueStatus(new Date(NOW + 6 * DAY_MS).toISOString(), true, NOW), 'complete')
})

test('las fechas sin hora se interpretan como el final del día local', () => {
  const parsed = parseDue('2026-03-15')
  assert.equal(parsed.getFullYear(), 2026)
  assert.equal(parsed.getMonth(), 2)
  assert.equal(parsed.getDate(), 15)
  assert.equal(parsed.getHours(), 23)

  const localNow = new Date(2026, 2, 10, 12, 0, 0).getTime() // 10 de marzo, 12:00 local
  assert.equal(dueStatus('2026-03-10', false, localNow), 'urgent')
  assert.equal(dueStatus('2026-03-12', false, localNow), 'soon')
  assert.equal(dueStatus('2026-03-14', false, localNow), 'later')
  assert.equal(dueStatus('2026-03-09', false, localNow), 'overdue')
})

test('conversión entre <input type="datetime-local"> e ISO', () => {
  const iso = fromLocalInput('2026-05-04T18:30')
  assert.equal(toLocalInput(iso), '2026-05-04T18:30')
  assert.equal(fromLocalInput(''), null)
  assert.equal(toLocalInput(null), '')
})
