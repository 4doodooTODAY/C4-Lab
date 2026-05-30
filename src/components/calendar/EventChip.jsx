import { format } from 'date-fns'

export const EVENT_TYPES = {
  in_person:   { label: 'In Person',   color: '#3b82f6' },  // blue
  virtual:     { label: 'Virtual',     color: '#ca8a04' },  // yellow
  travel:      { label: 'Travel',      color: '#16a34a' },  // green
  real_estate: { label: 'Real Estate', color: '#9333ea' },  // purple
  personal:    { label: 'Personal',    color: '#ea580c' },  // orange
  shoot:       { label: 'Shoot Day',   color: '#8b5cf6' },  // violet
  draft:       { label: 'Content',     color: '#f59e0b' },  // amber
  project:     { label: 'Due Date',    color: '#0ea5e9' },  // sky blue
}

export default function EventChip({ event, onClick }) {
  const { color } = EVENT_TYPES[event.event_type] || EVENT_TYPES.in_person
  const timeStr = (!event.all_day && event.start_at)
    ? format(new Date(event.start_at), 'h:mm a')
    : null

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(event) }}
      className="w-full text-left px-1.5 py-0.5 rounded text-[11px] font-medium truncate transition-opacity hover:opacity-80 flex items-center gap-1"
      style={{ backgroundColor: color + '20', color }}
    >
      {timeStr && (
        <span className="shrink-0 font-normal opacity-75 text-[10px]">{timeStr}</span>
      )}
      <span className="truncate">{event.title}</span>
    </button>
  )
}
