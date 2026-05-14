// Shared avatar component — shows photo if available, otherwise initials
export default function Avatar({ name, url, size = 8, className = '' }) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  const px = {
    6:  'w-6  h-6  text-[10px]',
    7:  'w-7  h-7  text-xs',
    8:  'w-8  h-8  text-xs',
    9:  'w-9  h-9  text-sm',
    10: 'w-10 h-10 text-sm',
    12: 'w-12 h-12 text-base',
    14: 'w-14 h-14 text-lg',
  }[size] || 'w-8 h-8 text-xs'

  if (url) {
    return (
      <img
        src={url}
        alt={name || 'Avatar'}
        className={`${px} rounded-full object-cover shrink-0 ${className}`}
      />
    )
  }

  return (
    <div className={`${px} rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold shrink-0 ${className}`}>
      {initials}
    </div>
  )
}

// Tag badge component — used next to names throughout the app
const TAG_STYLES = {
  Photographer: 'bg-amber-50  text-amber-700  border-amber-200',
  Videographer: 'bg-blue-50   text-blue-700   border-blue-200',
  Editor:       'bg-green-50  text-green-700  border-green-200',
}

export function TagBadge({ tag }) {
  const style = TAG_STYLES[tag] || 'bg-surface-2 text-text-muted border-border'
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${style}`}>
      {tag}
    </span>
  )
}

export const ALL_TAGS = ['Photographer', 'Videographer', 'Editor']
