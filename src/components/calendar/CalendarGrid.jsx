import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  isToday,
} from 'date-fns'
import EventChip from './EventChip'
import { Plus } from 'lucide-react'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getEventsForDay(events, date) {
  const key = format(date, 'yyyy-MM-dd')
  return events.filter((e) => e.event_date === key)
}

export default function CalendarGrid({ currentDate, events, onDayClick, onEventClick }) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-semibold text-text-muted tracking-wide uppercase"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 divide-x divide-y divide-border">
        {days.map((day) => {
          const dayEvents = getEventsForDay(events, day)
          const isCurrentMonth = isSameMonth(day, currentDate)
          const todayDay = isToday(day)
          const MAX_VISIBLE = 3

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`group relative p-1.5 cursor-pointer transition-colors min-h-[90px] ${
                isCurrentMonth ? 'bg-white hover:bg-surface-2' : 'bg-surface-2/50 hover:bg-surface-2'
              }`}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                    todayDay
                      ? 'bg-accent text-white'
                      : isCurrentMonth
                      ? 'text-text-primary'
                      : 'text-text-muted'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDayClick(day)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-accent transition-all"
                >
                  <Plus size={12} />
                </button>
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, MAX_VISIBLE).map((event) => (
                  <EventChip key={event.id} event={event} onClick={onEventClick} />
                ))}
                {dayEvents.length > MAX_VISIBLE && (
                  <p className="text-xs text-text-muted px-1">
                    +{dayEvents.length - MAX_VISIBLE} more
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
