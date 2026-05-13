import { useState } from 'react'
import { PlusCircle, Loader2, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

function formatTimestamp(seconds) {
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function AddCommentBar({ currentTime, onAdd }) {
  const [text, setText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { profile } = useAuth()

  // Only creatives and team leads can mark comments as internal
  const canMarkInternal = profile?.role === 'creative' || profile?.role === 'team_lead'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setSaving(true)
    setError('')
    try {
      await onAdd({
        content: text.trim(),
        timestamp_seconds: currentTime,
        is_internal: isInternal,
      })
      setText('')
    } catch (err) {
      setError(err.message || 'Failed to save comment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-border bg-white p-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        {/* Timestamp row */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-accent bg-accent/10 px-2 py-1 rounded">
            {formatTimestamp(currentTime ?? 0)}
          </span>
          {canMarkInternal && (
            <button
              type="button"
              onClick={() => setIsInternal((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
                isInternal
                  ? 'bg-amber-100 text-amber-700 font-medium'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Lock size={11} />
              {isInternal ? 'Internal' : 'Mark internal'}
            </button>
          )}
          <span className="text-xs text-text-muted ml-auto">Comment at current time</span>
        </div>

        {/* Comment input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Leave a comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input flex-1"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!text.trim() || saving}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
            Add
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </form>
    </div>
  )
}
