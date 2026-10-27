import test from 'node:test'
import assert from 'node:assert/strict'
import { listLimitStatus, listLimitTitle } from '../src/lib/listLimit.js'

test('sin límite el contador no se colorea', () => {
  assert.equal(listLimitStatus(0, null), 'none')
  assert.equal(listLimitStatus(12, null), 'none')
  assert.equal(listLimitStatus(12, undefined), 'none')
  assert.equal(listLimitStatus(12, 0), 'none')
  assert.equal(listLimitStatus(12, -4), 'none')
})

test('con margen amplio el contador queda neutro', () => {
  assert.equal(listLimitStatus(0, 10), 'ok')
  assert.equal(listLimitStatus(6, 10), 'ok')
})

test('cuando quedan 3 huecos o menos se avisa en amarillo', () => {
  assert.equal(listLimitStatus(7, 10), 'warn')
  assert.equal(listLimitStatus(8, 10), 'warn')
  assert.equal(listLimitStatus(9, 10), 'warn')
})

test('al llegar al límite se marca en rojo', () => {
  assert.equal(listLimitStatus(10, 10), 'full')
  assert.equal(listLimitStatus(1, 1), 'full')
})

test('si se sobrepasa el límite se marca en morado', () => {
  assert.equal(listLimitStatus(11, 10), 'over')
  assert.equal(listLimitStatus(30, 10), 'over')
})

test('los títulos explican cuánto queda', () => {
  assert.equal(listLimitTitle(1, null), '1 tarjeta')
  assert.equal(listLimitTitle(3, null), '3 tarjetas')
  assert.equal(listLimitTitle(7, 10), '7 de 10 · quedan 3 huecos')
  assert.equal(listLimitTitle(9, 10), '9 de 10 · queda 1 hueco')
  assert.equal(listLimitTitle(10, 10), '10 de 10 · límite alcanzado')
  assert.equal(listLimitTitle(12, 10), '12 de 10 · 2 por encima del límite')
})
