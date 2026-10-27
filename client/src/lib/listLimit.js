/** Estado del contador de tarjetas de una lista con límite (WIP). */

/** A partir de cuántos huecos libres se avisa en amarillo. */
export const LIST_LIMIT_WARN_REMAINING = 3

/**
 * - `none`: la lista no tiene límite.
 * - `ok`: dentro del límite y con margen.
 * - `warn`: quedan 3 huecos o menos (amarillo).
 * - `full`: se ha alcanzado el límite exacto (rojo).
 * - `over`: hay más tarjetas que el límite (morado).
 */
export function listLimitStatus(count, limit) {
  if (!Number.isInteger(limit) || limit <= 0) return 'none'
  if (count > limit) return 'over'
  if (count === limit) return 'full'
  if (limit - count <= LIST_LIMIT_WARN_REMAINING) return 'warn'
  return 'ok'
}

export function listLimitTitle(count, limit) {
  const cards = `${count} ${count === 1 ? 'tarjeta' : 'tarjetas'}`
  if (!Number.isInteger(limit) || limit <= 0) return cards
  const remaining = limit - count
  if (remaining < 0) return `${count} de ${limit} · ${-remaining} por encima del límite`
  if (remaining === 0) return `${count} de ${limit} · límite alcanzado`
  return `${count} de ${limit} · ${remaining === 1 ? 'queda 1 hueco' : `quedan ${remaining} huecos`}`
}
