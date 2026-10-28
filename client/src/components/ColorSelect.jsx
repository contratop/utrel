import { useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { useDismissOnOutside } from '../lib/editing.js'
import { LABEL_COLORS, LABEL_COLOR_NAMES } from '../lib/constants.js'

/**
 * Selector de color discreto: un botón pequeño con el color actual (punto y
 * nombre) y, al pulsarlo, un desplegable con la paleta del tablero. Nada de
 * diez colores a la vista saturado la pantalla.
 */
export default function ColorSelect({
  value,
  onPick,
  label,
  title,
  allowNone = false,
  noneLabel = 'Sin color',
  displayLabel,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const options = [
    ...(allowNone ? [{ value: null, name: noneLabel }] : []),
    ...LABEL_COLORS.map((color) => ({ value: color, name: LABEL_COLOR_NAMES[color] })),
  ]
  const selected = value ?? null
  const current = options.find((option) => option.value === selected) || options[0]
  const shownName = displayLabel || current.name

  useDismissOnOutside({
    active: open,
    contains: (node) => Boolean(wrapRef.current && wrapRef.current.contains(node)),
    onDismiss: () => setOpen(false),
  })

  return (
    <div className="color-select" ref={wrapRef}>
      <button
        type="button"
        className="color-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={title || label}
        title={title || label}
        onClick={() => setOpen((open) => !open)}
      >
        <span className={`color-dot${selected ? ` bg-${selected}` : ' plain'}`} aria-hidden="true" />
        <span className="color-select-value">{shownName}</span>
        <Icon name="chevron-down" size={14} />
      </button>

      {open && (
        <div className="color-select-menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = option.value === selected
            return (
              <button
                key={option.value || 'none'}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`color-select-option${isSelected ? ' selected' : ''}`}
                onClick={() => {
                  setOpen(false)
                  onPick(option.value)
                }}
              >
                <span
                  className={`color-dot${option.value ? ` bg-${option.value}` : ' plain'}`}
                  aria-hidden="true"
                />
                <span className="grow">{option.name}</span>
                {isSelected && <Icon name="check" size={14} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
