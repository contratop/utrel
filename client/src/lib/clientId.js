const STORAGE_KEY = 'utrel:client-id'

let cached = null

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  }
}

/**
 * Identificador de esta pestaña. Viaja en la cabecera `X-Client-Id` de cada
 * cambio y vuelve en los eventos en vivo, para no recargar el tablero cuando el
 * cambio lo hicimos nosotros mismos. Vive en `sessionStorage` (una pestaña, un
 * id) para que dos pestañas del mismo navegador también se sincronicen.
 */
export function clientId() {
  if (cached) return cached
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      cached = stored
      return cached
    }
  } catch {
    /* almacenamiento no disponible (modo privado) */
  }
  cached = randomId()
  try {
    window.sessionStorage.setItem(STORAGE_KEY, cached)
  } catch {
    /* sin persistencia: el id sigue siendo estable mientras viva la pestaña */
  }
  return cached
}
