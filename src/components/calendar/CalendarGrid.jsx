import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, format,
  parseISO, isSameDay, isWithinInterval, startOfDay, endOfDay,
} from 'date-fns'
import EventChip from './EventChip'
import { Plus } from 'lucide-react'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getEventsForDay(events, day) {
  return events.filter((e) => {
    const start = new Date(e.start_at)
    const end   = new Date(e.end_at)
    return isWithinInterval(day, { start: startOfDay(start), end: endOfDay(end) })
  })
}

export default function CalendarGrid({ currentDate, events, onDayClick, onEventClick }) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd   = endOfMonth(currentDate)
  const gridStart  = startOfWeek(monthStart)
  const gridEnd    = endOfWeek(monthEnd)
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Split into weeks for the grid
  const weeks = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border bg-surface-2/50">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2 text-center text-[11px] font-semibold text-text-muted tracking-widest uppercase">
            {day}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex-1 flex flex-col divide-y divide-border overflow-hidden">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex-1 grid grid-cols-7 divide-x divide-border min-h-0">
            {week.map((day) => {
              const dayEvents       = getEventsForDay(events, day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const today          = isToday(day)
              const MAX_VISIBLE    = 3

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => onDayClick(day)}
                  className={`group relative p-1.5 cursor-pointer transition-colors flex flex-col ${
                    isCurrentMonth
                      ? 'bg-white hover:bg-surface-2/60'
                      : 'bg-surface-2/30 hover:bg-surface-2/60'
                  }`}
                >
                  {/* Date number */}
                  <div className="flex items-center justify-between mb-1 shrink-0">
                    <span
                      className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                        today
                          ? 'bg-accent text-white'
                          : isCurrentMonth
                          ? 'text-text-primary'
                          : 'text-text-muted'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDayClick(day) }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-accent transition-all"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Events */}
                  <div className="space-y-0.5 flex-1 overflow-hidden">
                    {dayEvents.slice(0, MAX_VISIBLE).map((event) => (
                      <EventChip key={event.id} event={event} onClick={onEventClick} />
                    ))}
                    {dayEvents.length > MAX_VISIBLE && (
                      <p className="text-[10px] text-text-muted px-1 font-medium">
                        +{dayEvents.length - MAX_VISIBLE} more
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
