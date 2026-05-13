import { useState, useEffect } from 'react'
import { X, Loader2, Trash2 } from 'lucide-react'
import { EVENT_TYPES } from './EventChip'
import { format } from 'date-fns'

export default function EventModal({ date, event, onSave, onDelete, onClose }) {
  const isEdit = Boolean(event)
  const [title, setTitle] = useState(event?.title || '')
  const [description, setDescription] = useState(event?.description || '')
  const [eventType, setEventType] = useState(event?.event_type || 'general')
  const [color, setColor] = useState(event?.color || EVENT_TYPES['general'].color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Sync color when type changes
  useEffect(() => {
    if (!isEdit) setColor(EVENT_TYPES[eventType]?.color || '#6C63FF')
  }, [eventType, isEdit])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        event_type: eventType,
        color,
        event_date: format(date, 'yyyy-MM-dd'),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save event')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!event) return
    setSaving(true)
    try {
      await onDelete(event.id)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to delete')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              {isEdit ? 'Edit Event' : 'New Event'}
            </h2>
            <p className="text-sm text-text-muted mt-0.5">
              {format(date, 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="label">Event Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product Shoot"
              className="input"
              maxLength={100}
              autoFocus
              required
            />
          </div>

          {/* Type */}
          <div>
            <label className="label">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(EVENT_TYPES).map(([key, { label, color: c }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEventType(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                    eventType === key
                      ? 'border-transparent ring-2 ring-offset-1'
                      : 'border-border hover:border-text-muted'
                  }`}
                  style={
                    eventType === key
                      ? { backgroundColor: c + '15', color: c, ringColor: c }
                      : {}
                  }
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: c }}
                  />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Color override */}
          <div>
            <label className="label">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5"
              />
              <span className="text-sm text-text-muted">{color}</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Notes <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any details…"
              rows={3}
              className="input resize-none"
              maxLength={500}
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={!title.trim() || saving} className="btn-primary disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : isEdit ? 'Save' : 'Add Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
