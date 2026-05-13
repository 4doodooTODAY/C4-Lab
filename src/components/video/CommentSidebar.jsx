import { useState } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'
import CommentItem from './CommentItem'

export default function CommentSidebar({ comments, loading, currentTime, onSeek, onDelete, onResolve }) {
  const [showResolved, setShowResolved] = useState(false)

  const visible = showResolved ? comments : comments.filter((c) => !c.is_resolved)
  const resolvedCount = comments.filter((c) => c.is_resolved).length

  // Highlight comment whose timestamp is closest to and <= currentTime
  const activeId = (() => {
    if (!currentTime || comments.length === 0) return null
    let best = null
    for (const c of comments) {
      if (c.timestamp_seconds <= currentTime + 1) best = c.id
    }
    return best
  })()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <MessageSquare size={15} className="text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Comments</h3>
        {comments.length > 0 && (
          <span className="ml-auto text-xs text-text-muted">{comments.length}</span>
        )}
      </div>

      {/* Resolved toggle */}
      {resolvedCount > 0 && (
        <div className="px-4 py-2 border-b border-border">
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={18} className="animate-spin text-text-muted" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <MessageSquare size={28} className="text-surface-3" />
            <p className="text-sm text-text-muted">No comments yet</p>
            <p className="text-xs text-text-muted/70">Play the video and add the first one</p>
          </div>
        ) : (
          visible.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onSeek={onSeek}
              onDelete={onDelete}
              onResolve={onResolve}
              isActive={comment.id === activeId}
            />
          ))
        )}
      </div>
    </div>
  )
}
