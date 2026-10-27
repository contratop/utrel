/**
 * Con los filtros activos el DOM solo muestra tarjetas visibles, pero el servidor
 * recalcula posiciones sobre todas las tarjetas de la lista. Estas funciones hacen
 * de puente entre ambos espacios de índices.
 */

/** Índice de inserción dentro de la lista completa a partir del índice visible. */
export function resolveInsertIndex(visibleCards, fullCards, domIndex) {
  if (fullCards.length === 0) return 0
  if (domIndex >= visibleCards.length) return fullCards.length
  const reference = visibleCards[domIndex]
  const found = fullCards.findIndex((card) => card.id === reference.id)
  return found >= 0 ? found : fullCards.length
}

/** Índice que espera la API, que excluye la tarjeta arrastrada al reordenar. */
export function serverIndexFor(insertAt, { sameList = false, fromIndex = -1 } = {}) {
  const adjusted = sameList && fromIndex >= 0 && fromIndex < insertAt ? insertAt - 1 : insertAt
  return Math.max(0, adjusted)
}

/**
 * Índice de inserción a partir de los rectángulos de las tarjetas pintadas.
 * Se coloca antes de la primera tarjeta cuyo punto medio queda por debajo del cursor.
 */
export function dropIndexFromRects(rects, pointerY) {
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index]
    if (pointerY < rect.top + rect.height / 2) return index
  }
  return rects.length
}

/** Posición vertical del indicador de inserción, relativa al contenido del contenedor. */
export function dropIndicatorOffset(rects, index, containerTop, scrollTop = 0) {
  if (!rects.length) return 0
  if (index <= 0) return Math.max(0, rects[0].top - containerTop + scrollTop)
  if (index >= rects.length) {
    const last = rects[rects.length - 1]
    return last.top + last.height - containerTop + scrollTop
  }
  return rects[index].top - containerTop + scrollTop
}

/** Índice de una lista a partir de los rectángulos de las columnas (por coordenada X). */
export function columnIndexFromRects(rects, pointerX) {
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index]
    if (pointerX < rect.left + rect.width / 2) return index
  }
  return rects.length
}
