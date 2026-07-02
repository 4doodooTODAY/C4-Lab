// ── Badge primitive (status) ─────────────────────────────────────────────────
// Driven by the design-system status token set:
//   due-soon (orange) · overdue (red) · review (violet) ·
//   approved (green) · idle (muted gray)
//
//   <Badge status="due-soon">Due Friday</Badge>
//   <Badge status="approved" dot>Final</Badge>

const STATUS = {
  'due-soon': { bg: 'bg-status-due-soon-bg', text: 'text-status-due-soon-text', dot: 'bg-status-due-soon' },
  'overdue':  { bg: 'bg-status-overdue-bg',  text: 'text-status-overdue-text',  dot: 'bg-status-overdue'  },
  'review':   { bg: 'bg-status-review-bg',   text: 'text-status-review-text',   dot: 'bg-status-review'   },
  'approved': { bg: 'bg-status-approved-bg', text: 'text-status-approved-text', dot: 'bg-status-approved' },
  'idle':     { bg: 'bg-status-idle-bg',     text: 'text-status-idle-text',     dot: 'bg-status-idle'     },
}

// Aliases so callers can use domain language directly
const ALIASES = {
  'submitted':      'review',
  'in-review':      'review',
  'approved-final': 'approved',
  'neutral':        'idle',
}

export default function Badge({ status = 'idle', dot = false, className = '', children }) {
  const key = STATUS[status] ? status : (ALIASES[status] || 'idle')
  const s = STATUS[key]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full
      ${s.bg} ${s.text} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />}
      {children}
    </span>
  )
}
