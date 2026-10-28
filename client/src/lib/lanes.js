/** Identificador de una columna nueva, sin depender de que exista randomUUID. */
export function newLaneId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `lane-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Columnas por defecto: los tableros propios y los compartidos. Es lo que ve
 * un usuario la primera vez que abre la vista Kanban.
 */
function defaultLanes(boards, assigned) {
  const own = boards.filter((board) => board.role === 'owner').map((board) => board.id)
  const shared = boards.filter((board) => board.role !== 'owner').map((board) => board.id)
  own.forEach((id) => assigned.add(id))
  shared.forEach((id) => assigned.add(id))
  return [
    { id: newLaneId(), title: 'Propios', boardIds: own },
    { id: newLaneId(), title: 'Compartidos', boardIds: shared },
  ]
}

/**
 * Convierte lo guardado en columnas usables: descarta tableros que ya no
 * existen o ya están en otra columna y reparte los nuevos en la primera.
 */
export function reconcileLanes(saved, boards) {
  const available = new Set(boards.map((board) => board.id))
  const assigned = new Set()
  const laneIds = new Set()
  const lanes = []

  if (Array.isArray(saved)) {
    for (const [index, lane] of saved.entries()) {
      if (!lane || typeof lane !== 'object') continue
      const boardIds = []
      for (const id of Array.isArray(lane.boardIds) ? lane.boardIds : []) {
        if (typeof id !== 'string' || !available.has(id) || assigned.has(id)) continue
        assigned.add(id)
        boardIds.push(id)
      }
      let id = typeof lane.id === 'string' && lane.id ? lane.id : newLaneId()
      if (laneIds.has(id)) id = newLaneId()
      laneIds.add(id)
      lanes.push({
        id,
        title:
          typeof lane.title === 'string' && lane.title.trim()
            ? lane.title.trim().slice(0, 40)
            : `Columna ${index + 1}`,
        boardIds,
      })
    }
  }

  if (lanes.length === 0) lanes.push(...defaultLanes(boards, assigned))

  // Los tableros que no estén en ninguna columna (recién creados desde otro
  // sitio) se muestran al principio para que no desaparezcan.
  const missing = boards.filter((board) => !assigned.has(board.id)).map((board) => board.id)
  if (missing.length > 0) lanes[0].boardIds.push(...missing)

  return lanes
}
