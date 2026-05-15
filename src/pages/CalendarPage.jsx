import { useState } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import CalendarGrid from '../components/calendar/CalendarGrid'
import EventModal from '../components/calendar/EventModal'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { EVENT_TYPES } from '../components/calendar/EventChip'
import { useAuth } from '../contexts/AuthContext'

export default function CalendarPage() {
  const { profile, user } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [modalState,  setModalState]  = useState(null) // { date, event? }

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const { events: allEvents, loading, addEvent, updateEvent, deleteEvent } = useCalendarEvents(year, month)

  // Admins see everything; creatives only see events they're a member of
  const events = isAdmin
    ? allEvents
    : allEvents.filter((e) =>
        (e.calendar_event_members || []).some((m) => m.profile_id === user?.id)
      )

  const prevMonth = () => setCurrentDate((d) => subMonths(d, 1))
  const nextMonth = () => setCurrentDate((d) => addMonths(d, 1))
  const goToday   = () => setCurrentDate(new Date())

  const handleDayClick   = (date)  => setModalState({ date, event: null })
  const handleEventClick = (event) => setModalState({ date: new Date(event.start_at), event })

  const handleSave = async (data) => {
    if (modalState?.event) {
      await updateEvent(modalState.event.id, data)
    } else {
      await addEvent(data)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      {/* Header row 1 — nav + actions */}
      <div className="flex items-center gap-2 px-6 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="btn-ghost p-1.5">
            <ChevronLeft size={16} />
          </button>
          <h1 className="text-lg font-bold text-text-primary min-w-[160px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </h1>
          <button onClick={nextMonth} className="btn-ghost p-1.5">
            <ChevronRight size={16} />
          </button>
        </div>

        <button onClick={goToday} className="btn-secondary text-xs px-3 py-1.5">
          Today
        </button>

        {loading && <Loader2 size={13} className="animate-spin text-text-muted ml-1" />}

        <div className="ml-auto">
          <button
            onClick={() => setModalState({ date: new Date(), event: null })}
            className="btn-primary flex items-center gap-1.5 text-xs"
          >
            <Plus size={13} /> Add Event
          </button>
        </div>
      </div>

      {/* Header row 2 — color legend */}
      <div className="flex items-center gap-5 px-6 py-2.5 border-b border-border bg-surface-2/40 shrink-0 flex-wrap">
        {Object.entries(EVENT_TYPES).map(([key, { label, color }]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-xs font-medium text-text-secondary">{label}</span>
          </div>
        ))}
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
