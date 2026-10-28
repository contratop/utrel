import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { dueStatus, dueStatusLabel, formatDue } from '../lib/dueDate.js'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function buildMonthGrid(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // lunes = 0
  const start = new Date(first)
  start.setDate(first.getDate() - offset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { date, inMonth: date.getMonth() === cursor.getMonth() }
  })
}

const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Día del calendario bajo el puntero, si lo hay. */
function dayKeyAt(x, y) {
  if (typeof document.elementFromPoint !== 'function') return null
  const hit = document.elementFromPoint(x, y)
  const day = hit && hit.closest ? hit.closest('[data-calendar-day]') : null
  return day ? day.getAttribute('data-calendar-day') : null
}

export default function CalendarView({ cards, onOpenCard, onToggleDue, onMoveCard }) {
  const [cursor, setCursor] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [showCompleted, setShowCompleted] = useState(true)
  const [dragCard, setDragCard] = useState(null)
  const [dropDay, setDropDay] = useState(null)

  const dragRef = useRef(null)
  const dropDayRef = useRef(null)
  const suppressClickRef = useRef(0)

  const setDropDayValue = (key) => {
    dropDayRef.current = key
    setDropDay(key)
  }

  const days = useMemo(() => buildMonthGrid(cursor), [cursor])
  const today = new Date()

  const visible = useMemo(
    () => cards.filter((card) => showCompleted || !card.dueComplete),
    [cards, showCompleted]
  )

  const byDay = useMemo(() => {
    const map = new Map()
    for (const card of visible) {
      if (!card.dueDate) continue
      const due = new Date(card.dueDate)
      const key = dayKey(due)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(card)
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    }
    return map
  }, [visible])

  const undated = visible.filter((card) => !card.dueDate)
  const monthLabel = cursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  const shift = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))

  useEffect(() => () => dragRef.current?.cleanup?.(), [])

  /**
   * Arrastre con puntero (ratón, dedo o lápiz). Con el ratón empieza al mover
   * unos píxeles; en táctil hace falta una pulsación larga, para no robar el
   * desplazamiento de la página al tocar una tarjeta.
   */
  function startCardDrag(event, card) {
    if (event.button !== undefined && event.button !== 0) return
    if (dragRef.current) return

    const state = {
      card,
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'mouse',
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      timer: null,
      cleanup: null,
    }
    dragRef.current = state

    const activate = () => {
      if (!dragRef.current) return
      state.active = true
      state.timer = null
      setDragCard({ id: card.id, title: card.title, x: state.x, y: state.y })
      setDropDayValue(dayKeyAt(state.x, state.y))
      if (navigator.vibrate) navigator.vibrate(10)
    }

    const cleanup = () => {
      if (state.timer) window.clearTimeout(state.timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', onTouchMove)
      if (dragRef.current === state) dragRef.current = null
      setDragCard(null)
      setDropDayValue(null)
    }
    state.cleanup = cleanup

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== state.pointerId) return
      state.x = moveEvent.clientX
      state.y = moveEvent.clientY
      if (!state.active) {
        const moved = Math.hypot(state.x - state.startX, state.y - state.startY)
        if (state.pointerType === 'mouse' && moved > 5) {
          activate()
        } else if (moved > 10) {
          // El dedo se movió antes de la pulsación larga: es un desplazamiento.
          cleanup()
        }
        return
      }
      setDragCard((ghost) => (ghost ? { ...ghost, x: state.x, y: state.y } : ghost))
      const key = dayKeyAt(state.x, state.y)
      if (dropDayRef.current !== key) setDropDayValue(key)
    }

    const onUp = (upEvent) => {
      if (upEvent.pointerId !== state.pointerId) return
      if (!state.active) {
        cleanup()
        return
      }
      const key = dayKeyAt(state.x, state.y)
      suppressClickRef.current = Date.now() + 400
      cleanup()
      if (key) onMoveCard?.(card.id, key)
    }

    const onCancel = () => cleanup()

    // Con el arrastre táctil activo el dedo mueve la tarjeta, no la página.
    const onTouchMove = (touchEvent) => {
      if (dragRef.current?.active) touchEvent.preventDefault()
    }

    if (state.pointerType !== 'mouse') state.timer = window.setTimeout(activate, 220)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
  }

  const cardClickable = () => Date.now() >= suppressClickRef.current

  return (
    <div className="calendar">
      <div className="calendar-head">
        <div className="calendar-nav">
          <button type="button" className="btn ghost" onClick={() => shift(-1)} title="Mes anterior">
            <Icon name="chevron-left" size={15} />
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoy
          </button>
          <button type="button" className="btn ghost" onClick={() => shift(1)} title="Mes siguiente">
            <Icon name="chevron-right" size={15} />
          </button>
          <h2 className="calendar-title">{monthLabel}</h2>
        </div>
        <div className="row wrap calendar-head-tools">
          <span className="muted small calendar-hint">
            <Icon name="grip-vertical" size={13} />
            Arrastra una tarjeta a otro día para cambiar su fecha
          </span>
          <label className="check-row">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(event) => setShowCompleted(event.target.checked)}
            />
            Mostrar completadas
          </label>
        </div>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
        {days.map(({ date, inMonth }) => {
          const key = dayKey(date)
          const dayCards = byDay.get(key) || []
          const isToday =
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate()

          return (
            <div
              key={key}
              className={`calendar-day${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}${
                dropDay === key ? ' drop-target' : ''
              }`}
              data-calendar-day={key}
            >
              <span className="calendar-day-number">{date.getDate()}</span>
              <div className="calendar-day-cards">
                {dayCards.map((card) => {
                  const status = dueStatus(card.dueDate, card.dueComplete)
                  return (
                    <div
                      key={card.id}
                      className={`calendar-chip-row${dragCard?.id === card.id ? ' dragging' : ''}`}
                      onPointerDown={(event) => startCardDrag(event, card)}
                    >
                      {/* Círculo para completar la fecha sin salir del calendario. */}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={!!card.dueComplete}
                        aria-label={card.dueComplete ? 'Marcar como pendiente' : 'Marcar como completada'}
                        title={card.dueComplete ? 'Marcar como pendiente' : 'Marcar como completada'}
                        className={`due-toggle calendar-due-toggle due-${status}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (!cardClickable()) return
                          onToggleDue?.(card.id, !card.dueComplete)
                        }}
                      >
                        {card.dueComplete && <Icon name="check" size={12} strokeWidth={3} />}
                      </button>
                      <button
                        type="button"
                        className={`calendar-chip due-${status}${card.dueComplete ? ' completed' : ''}`}
                        title={`${card.title} · ${dueStatusLabel(card.dueDate, card.dueComplete)} · ${formatDue(
                          card.dueDate
                        )} · Arrastra para cambiar de día`}
                        onClick={() => {
                          if (!cardClickable()) return
                          onOpenCard(card.id)
                        }}
                      >
                        {card.title}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {undated.length > 0 && (
        <div className="calendar-undated">
          <h3>Sin fecha de vencimiento ({undated.length})</h3>
          <p className="muted small">Arrastra una al calendario para asignarle fecha.</p>
          <div className="calendar-undated-list">
            {undated.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`calendar-chip plain${dragCard?.id === card.id ? ' dragging' : ''}`}
                onPointerDown={(event) => startCardDrag(event, card)}
                onClick={() => {
                  if (!cardClickable()) return
                  onOpenCard(card.id)
                }}
              >
                {card.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {dragCard && (
        <div
          className="calendar-drag-ghost"
          style={{ left: dragCard.x + 14, top: dragCard.y + 14 }}
          aria-hidden="true"
        >
          <Icon name="calendar-clock" size={12} />
          <span>{dragCard.title}</span>
        </div>
      )}
    </div>
  )
}
