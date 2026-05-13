import { useState } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import CalendarGrid from '../components/calendar/CalendarGrid'
import EventModal from '../components/calendar/EventModal'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { EVENT_TYPES } from '../components/calendar/EventChip'

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [modalState, setModalState] = useState(null) // { date, event? }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const { events, loading, addEvent, updateEvent, deleteEvent } = useCalendarEvents(year, month)

  const prevMonth = () => setCurrentDate((d) => subMonths(d, 1))
  const nextMonth = () => setCurrentDate((d) => addMonths(d, 1))
  const goToday = () => setCurrentDate(new Date())

  const handleDayClick = (date) => setModalState({ date, event: null })
  const handleEventClick = (event) => {
    setModalState({ date: new Date(event.event_date + 'T12:00:00'), event })
  }

  const handleSave = async (data) => {
    if (modalState?.event) {
      await updateEvent(modalState.event.id, data)
    } else {
      await addEvent(data)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-xl font-bold text-text-primary">
          {format(currentDate, 'MMMM yyyy')}
        </h1>

        <div className="flex items-center gap-1 ml-2">
          <button onClick={prevMonth} className="btn-ghost p-1.5">
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextMonth} className="btn-ghost p-1.5">
            <ChevronRight size={16} />
          </button>
        </div>

        <button onClick={goToday} className="btn-secondary text-xs px-3 py-1.5">
          Today
        </button>

        {loading && <Loader2 size={14} className="animate-spin text-text-muted ml-2" />}

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3">
          {Object.entries(EVENT_TYPES).map(([key, { label, color }]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-text-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <CalendarGrid
        currentDate={currentDate}
        events={events}
        onDayClick={handleDayClick}
        onEventClick={handleEventClick}
      />

      {/* Event modal */}
      {modalState && (
        <EventModal
          date={modalState.date}
          event={modalState.event}
          onSave={handleSave}
          onDelete={deleteEvent}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  )
}
