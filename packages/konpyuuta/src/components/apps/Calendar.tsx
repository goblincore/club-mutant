import { useState } from 'react'

export function Calendar() {
  const today = new Date()
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  )

  function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate()
  }

  function getFirstDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 1).getDay()
  }

  function prevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  }

  function nextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Build grid cells: leading empty slots + day numbers
  const cells: Array<number | null> = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const isToday = (day: number | null): boolean => {
    if (day === null) return false
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    )
  }

  return (
    <div className="cal-root">
      <div className="calendar-container">
        <div className="calendar-header">
          <button onClick={prevMonth}>◀</button>
          <span id="cal-month-year">
            {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth}>▶</button>
        </div>
        <div className="calendar-weekdays">
          {dayHeaders.map(d => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-days">
          {cells.map((day, i) => (
            <div
              key={i}
              className={`cal-day${day === null ? ' empty' : ''}${isToday(day) ? ' today' : ''}`}
            >
              {day !== null ? day : ''}
            </div>
          ))}
        </div>
        <div className="cal-footer">
          <button
            onClick={() =>
              setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))
            }
          >
            Today
          </button>
        </div>
      </div>
    </div>
  )
}
