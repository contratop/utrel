import { useEffect, useRef } from 'react'

/**
 * Cierra un editor en cuanto el puntero *termina* de pulsar fuera de él, no en
 * cuanto empieza. Así no se cierra al arrancar una selección de texto (aunque
 * el ratón acabe fuera del campo), ni con un toque accidental, ni con el clic
 * que acaba de abrir el editor.
 *
 * - `contains(node)` dice si el nodo pulsado forma parte del editor.
 * - `grace` ignora las pulsaciones de los primeros milisegundos.
 */
export function useDismissOnOutside({ active, contains, onDismiss, grace = 260 }) {
  const config = useRef({ contains, onDismiss })
  config.current = { contains, onDismiss }

  useEffect(() => {
    if (!active) return undefined
    const openedAt = Date.now()
    let pressedInside = false

    const isInside = (target) => {
      try {
        return Boolean(target && config.current.contains(target))
      } catch {
        return false
      }
    }

    const onDown = (event) => {
      pressedInside = isInside(event.target)
    }

    const onUp = (event) => {
      // La pulsación empezó dentro: puede ser una selección que acaba fuera.
      if (pressedInside) return
      if (isInside(event.target)) return
      if (Date.now() - openedAt < grace) return
      config.current.onDismiss?.()
    }

    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('mouseup', onUp, true)
    document.addEventListener('touchstart', onDown, true)
    document.addEventListener('touchend', onUp, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('mouseup', onUp, true)
      document.removeEventListener('touchstart', onDown, true)
      document.removeEventListener('touchend', onUp, true)
    }
  }, [active, grace])
}

/**
 * Cierra un modal solo si la pulsación empezó y terminó en el fondo: arrastrar
 * para seleccionar texto y soltar fuera no cierra la ventana.
 */
export function useBackdropPress(onBackdropClick) {
  const state = useRef({ started: false, wasEditing: false })

  function onPointerDown(event, editing = false) {
    if (event.target !== event.currentTarget) return
    state.current = { started: true, wasEditing: editing }
  }

  function onClick(event) {
    if (event.target !== event.currentTarget || !state.current.started) return
    const { wasEditing } = state.current
    state.current = { started: false, wasEditing: false }
    // Si había un editor abierto, este primer clic solo lo cierra (y guarda).
    if (wasEditing) return
    onBackdropClick()
  }

  return { onPointerDown, onClick }
}
