import { useMemo, useState } from 'react'
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

export default function CalendarView({ cards, onOpenCard }) {
  const [cursor, setCursor] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [showCompleted, setShowCompleted] = useState(true)

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

  return (
    <div className="calendar">
      <div className="calendar-head">
        <div className="calendar-nav">
          <button type="button" className="btn ghost" onClick={() => shift(-1)}>
            ‹
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoy
          </button>
          <button type="button" className="btn ghost" onClick={() => shift(1)}>
            ›
          </button>
          <h2 className="calendar-title">{monthLabel}</h2>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(event) => setShowCompleted(event.target.checked)}
          />
          Mostrar completadas
        </label>
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
            <div key={key} className={`calendar-day${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}`}>
              <span className="calendar-day-number">{date.getDate()}</span>
              <div className="calendar-day-cards">
                {dayCards.map((card) => {
                  const status = dueStatus(card.dueDate, card.dueComplete)
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`calendar-chip due-${status}${card.dueComplete ? ' completed' : ''}`}
                      title={`${card.title} · ${dueStatusLabel(card.dueDate, card.dueComplete)} · ${formatDue(
                        card.dueDate
                      )}`}
                      onClick={() => onOpenCard(card.id)}
                    >
                      {card.title}
                    </button>
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
          <div className="calendar-undated-list">
            {undated.map((card) => (
              <button
                key={card.id}
                type="button"
                className="calendar-chip plain"
                onClick={() => onOpenCard(card.id)}
              >
                {card.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
