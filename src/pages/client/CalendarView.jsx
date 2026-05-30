import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Link, Loader2 } from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isToday, isSameDay, addMonths, subMonths,
  isWithinInterval, startOfDay, endOfDay, parseISO,
} from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const TYPE_COLORS = {
  in_person:   '#3b82f6',
  virtual:     '#ca8a04',
  travel:      '#16a34a',
  real_estate: '#9333ea',
  personal:    '#ea580c',
}

const TYPE_LABELS = {
  in_person:   'In Person',
  virtual:     'Virtual',
  travel:      'Travel',
  real_estate: 'Real Estate',
  personal:    'Personal',
}

function buildGrid(month) {
  const start = startOfWeek(startOfMonth(month))
  const end   = endOfWeek(endOfMonth(month))
  const days  = []
  let cur = start
  while (cur <= end) { days.push(cur); cur = addDays(cur, 1) }
  return days
}

export default function ClientCalendarView() {
  const { user } = useAuth()
  const [month,    setMonth]    = useState(new Date())
  const [events,   setEvents]   = useState([])
  const [shoots,   setShoots]   = useState([]) // from projects
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)

    const rangeStart = startOfMonth(month).toISOString()
    const rangeEnd   = addDays(endOfMonth(month), 1).toISOString()

    Promise.all([
      // Calendar events this client is a member of (non-personal team events)
      supabase
        .from('calendar_event_members')
        .select('event_id, calendar_events(*)')
        .eq('profile_id', user.id)
        .gte('calendar_events.start_at', rangeStart)
        .lte('calendar_events.start_at', rangeEnd),

      // Shoots for this client — query client row first, then their shoots
      supabase
        .from('clients')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle()
        .then(({ data: clientRow }) => {
          if (!clientRow?.id) return Promise.resolve({ data: [] })
          const monthStart = startOfMonth(month).toISOString().split('T')[0]
          const monthEnd   = addDays(endOfMonth(month), 1).toISOString().split('T')[0]
          return supabase
            .from('shoots')
            .select('id, title, shoot_date, shoot_time, location, status')
            .eq('client_id', clientRow.id)
            .or('status.is.null,status.neq.cancelled')
            .gte('shoot_date', monthStart)
            .lt('shoot_date', monthEnd)
        }),
    ]).then(([evRes, shootsRes]) => {
      const calEvents = (evRes.data || [])
        .map((m) => m.calendar_events)
        .filter(Boolean)
      setEvents(calEvents)

      const shootDates = (shootsRes.data || []).map((s) => ({
        id:       `shoot-${s.id}`,
        title:    s.title,
        date:     s.shoot_date,
        time:     s.shoot_time,
        location: s.location,
        type:     'shoot',
      }))
      setShoots(shootDates)

      setLoading(false)
    })
  }, [user, month])

  const days = buildGrid(month)

  const getDayItems = (day) => {
    const calItems = events.filter((e) => {
      const start = new Date(e.start_at)
      const end   = new Date(e.end_at)
      return isWithinInterval(day, { start: startOfDay(start), end: endOfDay(end) })
    })
    const shootItems = shoots.filter((s) => isSameDay(parseISO(s.date), day))
    return { calItems, shootItems }
  }

  const selectedItems = selected ? getDayItems(selected) : { calItems: [], shootItems: [] }
  const hasSelected = selectedItems.calItems.length > 0 || selectedItems.shootItems.length > 0

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="text-gray-400 mt-1">Your shoot dates and meetings.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={() => setMonth(subMonths(month, 1))} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-bold text-gray-800">{format(month, 'MMMM yyyy')}</h2>
          <button onClick={() => setMonth(addMonths(month, 1))} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
            <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : (
          <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
            {days.map((day, i) => {
              const inMonth  = isSameMonth(day, month)
              const today    = isToday(day)
              const isSel    = selected && isSameDay(day, selected)
              const { calItems, shootItems } = getDayItems(day)
              const total = calItems.length + shootItems.length

              return (
                <div
                  key={i}
                  onClick={() => setSelected(isSel ? null : day)}
                  className={`min-h-[80px] p-2 cursor-pointer transition-colors ${
                    isSel ? 'bg-accent/5' : inMonth ? 'hover:bg-gray-50' : 'bg-gray-50/50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                    today ? 'bg-accent text-white' : inMonth ? 'text-gray-700' : 'text-gray-300'
                  }`}>
                    {format(day, 'd')}
                  </div>

                  <div className="space-y-0.5">
                    {shootItems.slice(0, 2).map((s) => (
                      <div key={s.id} className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                        <p className="text-[10px] text-violet-700 truncate font-medium">{s.title}</p>
                      </div>
                    ))}
                    {calItems.slice(0, 2 - shootItems.length).map((e) => (
                      <div key={e.id} className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[e.event_type] || '#3b82f6' }} />
                        <p className="text-[10px] text-gray-600 truncate">{e.title}</p>
                      </div>
                    ))}
                    {total > 2 && <p className="text-[10px] text-gray-400">+{total - 2} more</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected day detail */}
      {selected && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <CalendarDays size={14} className="text-gray-400" />
            {format(selected, 'EEEE, MMMM d')}
          </h3>

          {!hasSelected ? (
            <p className="text-sm text-gray-400">Nothing scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedItems.shootItems.map((s) => (
                <div key={s.id} className="flex items-start gap-3 px-3 py-3 rounded-xl bg-violet-50 border border-violet-100">
                  <div className="w-2 h-2 rounded-full bg-violet-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-gray-900">{s.title}</p>
                    <p className="text-xs text-violet-600 font-medium mt-0.5">Shoot</p>
                    {s.time && (
                      <p className="text-xs text-gray-400 mt-0.5">{s.time.slice(0, 5)}</p>
                    )}
                    {s.location && (
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <MapPin size={10} /> {s.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {selectedItems.calItems.map((e) => {
                const color = TYPE_COLORS[e.event_type] || '#3b82f6'
                return (
                  <div key={e.id} className="flex items-start gap-3 px-3 py-3 rounded-xl border" style={{ borderColor: color + '30', backgroundColor: color + '08' }}>
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{e.title}</p>
                      <p className="text-xs mt-0.5" style={{ color }}>{TYPE_LABELS[e.event_type] || e.event_type}</p>
                      {!e.all_day && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(new Date(e.start_at), 'h:mm a')} – {format(new Date(e.end_at), 'h:mm a')}
                        </p>
                      )}
                      {e.location && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <MapPin size={10} /> {e.location}
                        </p>
                      )}
                      {e.meeting_url && (
                        <a href={e.meeting_url} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-500 hover:underline mt-1 flex items-center gap-1">
                          <Link size={10} /> Join Meeting
                        </a>
                      )}
                      {e.description && (
                        <p className="text-xs text-gray-500 mt-1">{e.description}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
