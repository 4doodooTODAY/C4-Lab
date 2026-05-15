import { useState, useEffect } from 'react'
import { X, Loader2, Trash2, MapPin, Link, Users } from 'lucide-react'
import { EVENT_TYPES } from './EventChip'
import { format, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Avatar from '../ui/Avatar'

function toDateInput(iso)  { return iso ? iso.slice(0, 10) : '' }
function toTimeInput(iso)  { return iso ? format(new Date(iso), 'HH:mm') : '09:00' }
function buildISO(date, time) { return new Date(`${date}T${time}:00`).toISOString() }

const TYPE_BUTTONS = Object.entries(EVENT_TYPES)

export default function EventModal({ date, event, onSave, onDelete, onClose }) {
  const { profile } = useAuth()
  const isEdit    = Boolean(event)
  const isAdmin   = profile?.role === 'admin'

  // Form state
  const [title,      setTitle]      = useState(event?.title      || '')
  const [type,       setType]       = useState(event?.event_type || 'in_person')
  const [allDay,     setAllDay]     = useState(event?.all_day    ?? true)
  const [startDate,  setStartDate]  = useState(event?.start_at   ? toDateInput(event.start_at) : format(date, 'yyyy-MM-dd'))
  const [startTime,  setStartTime]  = useState(event?.start_at   ? toTimeInput(event.start_at) : '09:00')
  const [endDate,    setEndDate]    = useState(event?.end_at     ? toDateInput(event.end_at)   : format(date, 'yyyy-MM-dd'))
  const [endTime,    setEndTime]    = useState(event?.end_at     ? toTimeInput(event.end_at)   : '10:00')
  const [location,   setLocation]   = useState(event?.location   || '')
  const [meetingUrl, setMeetingUrl] = useState(event?.meeting_url || '')
  const [description,setDescription]= useState(event?.description || '')
  const [memberIds,  setMemberIds]  = useState(
    event?.calendar_event_members?.map((m) => m.profile_id) || []
  )

  // Team members for picker
  const [team, setTeam] = useState([])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .in('role', ['admin', 'creative'])
      .order('full_name')
      .then(({ data }) => setTeam(data || []))
  }, [])

  const [saving,  setSaving]  = useState(false)
  const [deleting,setDeleting]= useState(false)
  const [error,   setError]   = useState('')

  const needsLocation   = ['in_person', 'travel', 'real_estate'].includes(type)
  const needsMeetingUrl = type === 'virtual'

  const toggleMember = (id) => {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const start_at = allDay
        ? new Date(`${startDate}T00:00:00`).toISOString()
        : buildISO(startDate, startTime)
      const end_at = allDay
        ? new Date(`${endDate}T23:59:59`).toISOString()
        : buildISO(endDate, endTime)

      await onSave({
        title:       title.trim(),
        description: description.trim(),
        event_type:  type,
        start_at,
        end_at,
        all_day:     allDay,
        location:    needsLocation   ? location.trim()   : null,
        meeting_url: needsMeetingUrl ? meetingUrl.trim() : null,
        member_ids:  memberIds,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save event')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!event) return
    setDeleting(true)
    try {
      await onDelete(event.id)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to delete')
      setDeleting(false)
    }
  }

  const { color: activeColor } = EVENT_TYPES[type] || EVENT_TYPES.in_person

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-text-primary">
              {isEdit ? 'Edit Event' : 'New Event'}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">{format(date, 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 -mt-1 -mr-1">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
          {/* Title */}
          <div>
            <label className="label">Event Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's happening?"
              className="input"
              autoFocus
              required
            />
          </div>

          {/* Type */}
          <div>
            <label className="label">Type</label>
            <div className="grid grid-cols-5 gap-1.5">
              {TYPE_BUTTONS.map(([key, { label, color }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-[10px] font-semibold transition-all ${
                    type === key ? 'border-transparent' : 'border-border hover:border-text-muted'
                  }`}
                  style={type === key ? { backgroundColor: color + '18', color, borderColor: color + '60' } : {}}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {label}
                </button>
              ))}
            </div>
            {type === 'real_estate' && (
              <p className="text-[10px] text-purple-600 mt-1.5 font-medium">
                ⬡ Real Estate overrides all other colors
              </p>
            )}
            {type === 'personal' && (
              <p className="text-[10px] text-orange-600 mt-1.5 font-medium">
                🔒 Only visible to admin and assigned people
              </p>
            )}
          </div>

          {/* All day toggle + dates */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Date</label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-text-muted">All day</span>
                <div
                  onClick={() => setAllDay((v) => !v)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${allDay ? 'bg-accent' : 'bg-surface-3'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${allDay ? 'left-4' : 'left-0.5'}`} />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-text-muted mb-1">Start</p>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input text-sm" required />
                {!allDay && (
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input text-sm mt-1" />
                )}
              </div>
              <div>
                <p className="text-[10px] text-text-muted mb-1">End</p>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm" required />
                {!allDay && (
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input text-sm mt-1" />
                )}
              </div>
            </div>
          </div>

          {/* Location or Meeting URL */}
          {needsLocation && (
            <div>
              <label className="label flex items-center gap-1">
                <MapPin size={11} /> Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={type === 'travel' ? 'e.g. Miami, FL' : 'Address or venue name'}
                className="input"
              />
            </div>
          )}

          {needsMeetingUrl && (
            <div>
              <label className="label flex items-center gap-1">
                <Link size={11} /> Meeting Link
              </label>
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://zoom.us/j/..."
                className="input"
              />
            </div>
          )}

          {/* Assigned people */}
          {team.length > 0 && (
            <div>
              <label className="label flex items-center gap-1">
                <Users size={11} /> Who's involved
                <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {team.map((member) => {
                  const selected = memberIds.includes(member.id)
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                        selected
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border hover:border-text-muted text-text-secondary'
                      }`}
                    >
                      <Avatar profile={member} size={18} />
                      {member.full_name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="label">Notes <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any details…"
              rows={2}
              className="input resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </form>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border shrink-0">
          {isEdit && (isAdmin || event.created_by === profile?.id) && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
            >
              <Trash2 size={14} />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary disabled:opacity-50"
              style={saving ? {} : { backgroundColor: activeColor }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : isEdit ? 'Save' : 'Add Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
