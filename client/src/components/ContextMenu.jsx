import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Menú contextual propio: sustituye al del navegador en tableros, listas y
 * tarjetas. Se coloca en el punto donde se pulsó (sin salirse de la ventana) y
 * se cierra con Escape, con un clic fuera, al hacer scroll o al girar/redimensionar.
 *
 * Los elementos son `{ label, onSelect, danger?, disabled?, icon? }`, y
 * `{ separator: true }` dibuja una línea.
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const [active, setActive] = useState(0)
  const entries = items.filter(Boolean)

  // Ajusta el menú para que no se salga de la pantalla.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const margin = 8
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    })
  }, [x, y])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    const isInside = (target) => ref.current && target instanceof Node && ref.current.contains(target)
    const close = () => onClose()

    const onMouseDown = (event) => {
      if (!isInside(event.target)) close()
    }
    // Un clic derecho en otra zona (fuera de un tablero, lista o tarjeta, que ya
    // gestionan el suyo) cierra el menú en lugar de abrir el del navegador.
    const onContextMenu = (event) => {
      event.preventDefault()
      if (!isInside(event.target)) close()
    }

    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  function onKeyDown(event) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      onClose()
      return
    }
    const enabled = entries.reduce((indexes, item, index) => (item.onSelect ? [...indexes, index] : indexes), [])
    if (enabled.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const current = enabled.indexOf(active)
      setActive(enabled[(current + step + enabled.length) % enabled.length])
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = entries[active]
      if (item && item.onSelect) {
        onClose()
        item.onSelect()
      }
    }
  }

  return (
    <div
      className="context-menu"
      role="menu"
      tabIndex={-1}
      ref={ref}
      style={position}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {entries.map((item, index) =>
        item.separator ? (
          <div key={`sep-${index}`} className="context-menu-sep" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            className={`context-menu-item${item.danger ? ' danger' : ''}${index === active ? ' active' : ''}`}
            disabled={item.disabled}
            onMouseEnter={() => setActive(index)}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.icon && (
              <span className="context-menu-icon" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  )
}
