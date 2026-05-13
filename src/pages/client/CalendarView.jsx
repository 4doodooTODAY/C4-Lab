import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Film, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, isSameDay, addMonths, subMonths } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const STATUS_CONFIG = {
  awaiting_review:   { label: 'Awaiting Review', icon: Clock,        color: 'text-text-muted',  dot: 'bg-text-muted' },
  changes_requested: { label: 'Changes Requested', icon: AlertCircle, color: 'text-amber-500',   dot: 'bg-amber-500' },
  approved:          { label: 'Approved',          icon: CheckCircle, color: 'text-green-500',   dot: 'bg-green-500' },
}

function buildCalendarGrid(month) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 })
  const days = []
  let cur = start
  while (cur <= end) {
    days.push(cur)
    cur = addDays(cur, 1)
  }
  return days
}

export default function ClientCalendarView() {
  const { user } = useAuth()
  const [month, setMonth] = useState(new Date())
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    // Fetch media that has a scheduled date (calendar_events linked or scheduled_at field)
    // For now we fetch media with status 'approved' or 'awaiting_review' through client's projects
    supabase
      .from('media')
      .select('*, projects(title, client_id, clients(name))')
      .not('scheduled_at', 'is', null)
      .order('scheduled_at', { ascending: true })
      .then(({ data }) => {
        setMedia(data || [])
        setLoading(false)
      })
  }, [user, month])

  const days = buildCalendarGrid(month)
  const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const getMediaForDay = (day) =>
    media.filter((m) => m.scheduled_at && isSameDay(new Date(m.scheduled_at), day))

  const selectedDayMedia = selected ? getMediaForDay(selected) : []

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Content Calendar</h1>
        <p className="text-text-secondary mt-1">Your scheduled posts and deliverables.</p>
      </div>

      <div className="card overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <button
            onClick={() => setMonth(subMonths(month, 1))}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-text-primary">
            {format(month, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setMonth(addMonths(month, 1))}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2.5 text-center text-xs font-medium text-text-muted">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const inMonth = isSameMonth(day, month)
              const today = isToday(day)
              const isSelected = selected && isSameDay(day, selected)
              const dayMedia = getMediaForDay(day)

              return (
                <button
                  key={i}
                  onClick={() => setSelected(isSelected ? null : day)}
                  className={`min-h-[80px] p-2 text-left border-b border-r border-border transition-colors ${
                    isSelected ? 'bg-accent/5' : inMonth ? 'hover:bg-surface-2' : ''
                  } ${i % 7 === 6 ? 'border-r-0' : ''} ${i >= days.length - 7 ? 'border-b-0' : ''}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mb-1 ${
                    today
                      ? 'bg-accent text-white'
                      : inMonth
                      ? 'text-text-primary'
                      : 'text-text-muted'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayMedia.slice(0, 2).map((m) => {
                      const cfg = STATUS_CONFIG[m.status] || STATUS_CONFIG.awaiting_review
                      return (
                        <div key={m.id} className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                          <p className="text-[10px] text-text-secondary truncate leading-tight">{m.title}</p>
                        </div>
                      )
                    })}
                    {dayMedia.length > 2 && (
                      <p className="text-[10px] text-text-muted">+{dayMedia.length - 2} more</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected day panel */}
      {selected && (
        <div className="mt-4 card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            {format(selected, 'EEEE, MMMM d')}
          </h3>
          {selectedDayMedia.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayMedia.map((m) => {
                const cfg = STATUS_CONFIG[m.status] || STATUS_CONFIG.awaiting_review
                const StatusIcon = cfg.icon
                return (
                  <Link
                    key={m.id}
                    to={`/video/${m.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Film size={15} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{m.title}</p>
                      {m.projects?.title && (
                        <p className="text-xs text-text-muted">{m.projects.title}</p>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                      <StatusIcon size={12} />
                      {cfg.label}
                    </div>
                    <ChevronRight size={14} className="text-text-muted group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
