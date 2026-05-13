import { Trash2, CheckCircle, Circle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

function formatTimestamp(seconds) {
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

const COLORS = ['#6C63FF', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6']
function avatarColor(id) {
  if (!id) return COLORS[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

export default function CommentItem({ comment, onSeek, onDelete, onResolve, isActive }) {
  const { user } = useAuth()
  const isOwn = comment.author_id === user?.id
  // profiles join may return null if RLS blocks other users — fall back gracefully
  const authorName = comment.profiles?.full_name || (isOwn ? 'You' : 'Team member')
  const color = avatarColor(comment.author_id)

  return (
    <div
      onClick={() => onSeek(comment.timestamp_seconds)}
      className={`group flex gap-3 p-3 rounded-lg cursor-pointer transition-all duration-100 ${
        comment.is_resolved ? 'opacity-50' : ''
      } ${
        isActive
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-surface-2 border border-transparent'
      }`}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 mt-0.5"
        style={{ backgroundColor: color }}
      >
        {getInitials(authorName)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-text-primary truncate">{authorName}</span>
          {comment.is_internal && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Internal</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onSeek(comment.timestamp_seconds) }}
            className="ml-auto shrink-0 px-1.5 py-0.5 bg-accent text-white text-xs rounded font-mono font-medium hover:bg-accent-hover transition-colors"
          >
            {formatTimestamp(comment.timestamp_seconds)}
          </button>
        </div>
        <p className={`text-sm leading-snug ${comment.is_resolved ? 'line-through text-text-muted' : 'text-text-primary'}`}>
          {comment.content}
        </p>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-all">
        {onResolve && (
          <button
            onClick={(e) => { e.stopPropagation(); onResolve(comment.id, !comment.is_resolved) }}
            title={comment.is_resolved ? 'Unresolve' : 'Resolve'}
            className={`${comment.is_resolved ? 'text-green-500' : 'text-text-muted hover:text-green-500'} transition-colors`}
          >
            {comment.is_resolved ? <CheckCircle size={13} /> : <Circle size={13} />}
          </button>
        )}
        {onDelete && isOwn && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(comment.id) }}
            className="text-text-muted hover:text-red-500 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
