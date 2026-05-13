export const EVENT_TYPES = {
  shoot: { label: 'Shoot Day', color: '#6C63FF' },
  edit: { label: 'Edit', color: '#10b981' },
  review: { label: 'Review', color: '#f59e0b' },
  delivery: { label: 'Delivery', color: '#ef4444' },
  meeting: { label: 'Meeting', color: '#3b82f6' },
  general: { label: 'General', color: '#8b5cf6' },
}

export default function EventChip({ event, onClick }) {
  const color = event.color || EVENT_TYPES[event.event_type]?.color || '#6C63FF'

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(event)
      }}
      className="w-full text-left px-1.5 py-0.5 rounded text-xs font-medium truncate transition-opacity hover:opacity-80"
      style={{ backgroundColor: color + '22', color }}
    >
      {event.title}
    </button>
  )
}
