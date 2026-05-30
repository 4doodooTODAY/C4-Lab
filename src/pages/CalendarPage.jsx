import { useState, useEffect } from 'react'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Loader2, Plus, Camera, FileText, X, MapPin, Clock, FolderKanban, CalendarDays, ExternalLink } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import CalendarGrid from '../components/calendar/CalendarGrid'
import EventModal from '../components/calendar/EventModal'
import NewProjectModal from './admin/NewProjectModal'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { EVENT_TYPES } from '../components/calendar/EventChip'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fmtTime } from '../lib/time'

// ── Shoot / Draft detail panel ─────────────────────────────────────────────────
function ShootDraftPanel({ item, onClose }) {
  if (!item) return null
  const isShoot = item._isShoot
  const isDraft = item._isDraft

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 bg-white rounded-2xl border border-border shadow-2xl overflow-hidden">
      <div className={`h-1 ${isShoot ? 'bg-violet-500' : 'bg-amber-500'}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {isShoot ? <Camera size={14} className="text-violet-600 shrink-0" /> : item._isProject ? <FolderKanban size={14} className="text-blue-600 shrink-0" /> : <FileText size={14} className="text-amber-600 shrink-0" />}
            <span className={`text-xs font-semibold uppercase tracking-wide ${isShoot ? 'text-violet-600' : item._isProject ? 'text-blue-600' : 'text-amber-600'}`}>
              {isShoot ? 'Shoot' : item._isProject ? 'Project' : `Content Draft — ${item._type || 'Post'}`}
            </span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-0.5">
            <X size={13} />
          </button>
        </div>
        <p className="text-sm font-semibold text-text-primary">{item.title}</p>
        {item.location && (
          <p className="text-xs text-text-muted mt-1 flex items-center gap-1"><MapPin size={10} /> {item.location}</p>
        )}
        {!item.all_day && item.start_at && (
          <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
            <Clock size={10} /> {format(new Date(item.start_at), 'h:mm a')}
          </p>
        )}
        {item._concept && <p className="text-xs text-text-secondary mt-2 line-clamp-3">{item._concept}</p>}
        {item._clientName && <p className="text-xs text-text-muted mt-1">Client: {item._clientName}</p>}
        {item._isProject && item.id && (
          <Link
            to={`/projects/${item.id.replace('_project_', '')}/creative`}
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
          >
            <ExternalLink size={11} /> Open Workflow
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Read-only panel for real calendar events (non-admin users) ─────────────────
function ReadOnlyEventPanel({ event, onClose }) {
  if (!event) return null
  const typeColor = event.event_type === 'meeting' ? 'bg-blue-500' : event.event_type === 'deadline' ? 'bg-red-500' : 'bg-accent'
  const typeLabel = event.event_type ? event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1) : 'Event'
  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 bg-white rounded-2xl border border-border shadow-2xl overflow-hidden">
      <div className={`h-1 ${typeColor}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-text-muted shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{typeLabel}</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-0.5"><X size={13} /></button>
        </div>
        <p className="text-sm font-semibold text-text-primary">{event.title}</p>
        {event.location && (
          <p className="text-xs text-text-muted mt-1 flex items-center gap-1"><MapPin size={10} /> {event.location}</p>
        )}
        {!event.all_day && event.start_at && (
          <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
            <Clock size={10} /> {format(new Date(event.start_at), 'h:mm a')}
            {event.end_at && ` – ${format(new Date(event.end_at), 'h:mm a')}`}
          </p>
        )}
        {event.description && <p className="text-xs text-text-secondary mt-2 line-clamp-4">{event.description}</p>}
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const { profile, user, isAdmin } = useAuth()
  // Admin in creative-view has isAdmin=false (useAuth respects viewMode),
  // so treat them the same as a real creative for day-click / UI purposes
  const isCreative = profile?.role === 'creative' || profile?.role === 'editor' || (profile?.role === 'admin' && !isAdmin)

  const navigate = useNavigate()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [modalState,  setModalState]  = useState(null)
  const [newProjectDate, setNewProjectDate] = useState(null) // date prefilled into new project modal
  const [shoots,      setShoots]      = useState([])
  const [drafts,      setDrafts]      = useState([])
  const [projects,    setProjects]    = useState([])
  const [auxLoading,  setAuxLoading]  = useState(false)
  const [selectedAux, setSelectedAux] = useState(null) // selected shoot/draft/project for panel
  const [selectedRealEvent, setSelectedRealEvent] = useState(null) // read-only real event panel

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const { events: allEvents, loading, addEvent, updateEvent, deleteEvent } = useCalendarEvents(year, month)

  // ── Load shoots — fetch all, filter in JS ───────────────────────────────
  // We intentionally skip server-side date filtering. Doing date range
  // comparison in PostgREST has caused edge-case misses. Instead we fetch
  // all accessible shoots and filter by month in JS — simple, bulletproof.
  useEffect(() => {
    if (!user) return

    const monthStr = format(currentDate, 'yyyy-MM') // e.g. '2026-06'

    let q = supabase
      .from('shoots')
      .select('id, title, creative_notes, shoot_date, shoot_time, location, status, photographer_id, clients(name, contact_name)')

    // Non-admin: only shoots this user is assigned to as photographer
    if (!isAdmin) q = q.eq('photographer_id', user.id)

    q.then(({ data, error }) => {
      if (error) { console.error('[CalendarPage] Shoots fetch error:', error); return }
      const shootEvents = (data || [])
        .filter((s) =>
          s.status !== 'cancelled' &&           // exclude cancelled (null passes safely in JS)
          s.shoot_date?.startsWith(monthStr)    // only this month — plain string prefix match
        )
        .map((s) => {
          const timeStr = s.shoot_time ? s.shoot_time.slice(0, 5) : '09:00'
          const startAt = new Date(`${s.shoot_date}T${timeStr}:00`)
          const endAt   = new Date(startAt.getTime() + 4 * 60 * 60 * 1000)
          return {
            id:          `_shoot_${s.id}`,
            title:       s.title,
            event_type:  'shoot',
            start_at:    startAt.toISOString(),
            end_at:      endAt.toISOString(),
            all_day:     !s.shoot_time,
            location:    s.location,
            _isShoot:    true,
            _concept:    s.creative_notes,
            _clientName: s.clients?.contact_name || s.clients?.name,
          }
        })
      setShoots(shootEvents)
    })
  }, [user, currentDate, isAdmin])

  // ── Load project due dates for the current month ─────────────────────────
  // Admin: all projects with a due_date this month
  // Creative/editor: only projects they are specifically assigned to (editor_id or creative_id)
  useEffect(() => {
    if (!user) return

    const monthStr   = format(currentDate, 'yyyy-MM')
    const monthStart = `${monthStr}-01`
    const nextMonth  = format(addMonths(currentDate, 1), 'yyyy-MM-01')

    let q = supabase
      .from('projects')
      .select('id, name, due_date, stage, editor_id, creative_id, client_id, clients(name, contact_name)')
      .not('due_date', 'is', null)
      .gte('due_date', monthStart)
      .lt('due_date', nextMonth)

    // Non-admin: only projects where this user is the assigned editor or creative
    if (!isAdmin) {
      q = q.or(`editor_id.eq.${user.id},creative_id.eq.${user.id}`)
    }

    q.then(({ data, error }) => {
      if (error) { console.error('[CalendarPage] Projects fetch error:', error); return }
      const projectEvents = (data || []).map((p) => {
        const startAt = new Date(`${p.due_date}T09:00:00`)
        return {
          id:          `_project_${p.id}`,
          title:       p.name,
          event_type:  'project',
          start_at:    startAt.toISOString(),
          end_at:      startAt.toISOString(),
          all_day:     true,
          _isProject:  true,
          _stage:      p.stage,
          _clientName: p.clients?.contact_name || p.clients?.name,
        }
      })
      setProjects(projectEvents)
    })
  }, [user, currentDate, isAdmin])

  // ── Load drafts for the current month ────────────────────────────────────
  useEffect(() => {
    if (!user) return

    const monthStr   = format(currentDate, 'yyyy-MM')
    const monthStart = `${monthStr}-01`
    const nextMonth  = format(addMonths(currentDate, 1), 'yyyy-MM-01')

    supabase
      .from('content_drafts')
      .select('id, type, title, concept, target_date, status, clients(name, contact_name)')
      .not('status', 'in', '("scrapped")')
      .gte('target_date', monthStart)
      .lt('target_date', nextMonth)
      .then(({ data }) => {
        const draftEvents = (data || []).map((d) => {
          const startAt = new Date(`${d.target_date}T12:00:00`)
          return {
            id:          `_draft_${d.id}`,
            title:       d.title || `${(d.type || 'Content').charAt(0).toUpperCase() + (d.type || 'content').slice(1)} Draft`,
            event_type:  'draft',
            start_at:    startAt.toISOString(),
            end_at:      startAt.toISOString(),
            all_day:     true,
            _isDraft:    true,
            _type:       d.type,
            _concept:    d.concept,
            _status:     d.status,
            _clientName: d.clients?.contact_name || d.clients?.name,
          }
        })
        setDrafts(draftEvents)
      })
  }, [user, currentDate])

  // Filter real events by role, and strip out shoot-linked calendar events.
  // Shoots are already shown as synthetic events from the shoots table —
  // showing the auto-generated calendar event too creates duplicates.
  // We detect shoot-linked events two ways:
  //   1. shoot_id column is set (requires SQL column to exist — see setup notes)
  //   2. Fallback: event_type === 'shoot' (NewShootModal always uses this type)
  // Using both ensures zero duplicates regardless of DB schema state.
  const pureCalendarEvents = allEvents.filter((e) => !e.shoot_id && e.event_type !== 'shoot')
  const roleEvents = isAdmin
    ? pureCalendarEvents
    : pureCalendarEvents.filter((e) =>
        (e.calendar_event_members || []).some((m) => m.profile_id === user?.id)
      )

  // Merge real events + synthetic shoot/draft events
  const events = [...roleEvents, ...shoots, ...drafts, ...projects]

  const prevMonth = () => { setCurrentDate((d) => subMonths(d, 1)); setSelectedAux(null) }
  const nextMonth = () => { setCurrentDate((d) => addMonths(d, 1)); setSelectedAux(null) }
  const goToday   = () => { setCurrentDate(new Date()); setSelectedAux(null) }

  const handleDayClick = (date) => {
    setSelectedAux(null)
    setSelectedRealEvent(null)
    if (isAdmin) {
      // Admins get choice: event modal or project — for simplicity open project modal
      // (they can still use "Add Event" button for calendar events)
      setNewProjectDate(format(date, 'yyyy-MM-dd'))
    } else if (isCreative) {
      // Creatives/editors click a day → create project with that date prefilled
      setNewProjectDate(format(date, 'yyyy-MM-dd'))
    }
  }
  const handleEventClick = (event) => {
    // Synthetic events: show detail panel, don't open modal
    if (event._isShoot || event._isDraft || event._isProject) {
      setSelectedAux(event)
      setSelectedRealEvent(null)
      return
    }
    setSelectedAux(null)
    if (!isAdmin) {
      // Non-admins see a read-only panel for real calendar events
      setSelectedRealEvent(event)
      return
    }
    setSelectedRealEvent(null)
    setModalState({ date: new Date(event.start_at), event })
  }

  const handleSave = async (data) => {
    if (modalState?.event?.id) {
      await updateEvent(modalState.event.id, data)
    } else {
      await addEvent(data)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      {/* Header row 1 — nav + actions */}
      <div className="flex items-center gap-2 px-6 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="btn-ghost p-1.5">
            <ChevronLeft size={16} />
          </button>
          <h1 className="text-lg font-bold text-text-primary min-w-[160px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </h1>
          <button onClick={nextMonth} className="btn-ghost p-1.5">
            <ChevronRight size={16} />
          </button>
        </div>

        <button onClick={goToday} className="btn-secondary text-xs px-3 py-1.5">
          Today
        </button>

        {(loading || auxLoading) && <Loader2 size={13} className="animate-spin text-text-muted ml-1" />}

        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setModalState({ date: new Date(), event: { event_type: 'meeting' } })}
              className="btn-secondary flex items-center gap-1.5 text-xs"
            >
              <CalendarDays size={13} /> Schedule Meeting
            </button>
            <button
              onClick={() => setModalState({ date: new Date(), event: null })}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <Plus size={13} /> Add Event
            </button>
          </div>
        )}
      </div>

      {/* Header row 2 — color legend */}
      <div className="flex items-center gap-5 px-6 py-2.5 border-b border-border bg-surface-2/40 shrink-0 flex-wrap">
        {Object.entries(EVENT_TYPES).map(([key, { label, color }]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-xs font-medium text-text-secondary">{label}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <CalendarGrid
        currentDate={currentDate}
        events={events}
        onDayClick={handleDayClick}
        onEventClick={handleEventClick}
      />

      {/* ── DEV DEBUG PANEL — remove before launch ── */}
      {true && (
        <div className="fixed bottom-4 left-4 z-50 bg-gray-900/95 text-white text-[11px] p-3 rounded-xl max-w-72 shadow-2xl font-mono">
          <p className="font-bold text-yellow-400 mb-1">📅 Calendar Debug</p>
          <p>Month: {format(currentDate, 'MMMM yyyy')}</p>
          <p>isAdmin: <span className={isAdmin ? 'text-green-400' : 'text-red-400'}>{String(isAdmin)}</span></p>
          <p>user: {user?.id?.slice(0,8)}…</p>
          <p className="mt-1 text-yellow-300">Shoots in state: {shoots.length}</p>
          {shoots.length === 0
            ? <p className="text-red-400">⚠ No shoots loaded</p>
            : shoots.map((s) => (
                <p key={s.id} className="text-green-300 truncate">✓ {s.title} ({new Date(s.start_at).toLocaleDateString()})</p>
              ))
          }
        </div>
      )}

      {/* Shoot / Draft / Project detail panel */}
      {selectedAux && (
        <ShootDraftPanel item={selectedAux} onClose={() => setSelectedAux(null)} />
      )}

      {/* Read-only real event panel for non-admins */}
      {selectedRealEvent && (
        <ReadOnlyEventPanel event={selectedRealEvent} onClose={() => setSelectedRealEvent(null)} />
      )}

      {/* Event modal (admin calendar events) */}
      {modalState && (
        <EventModal
          date={modalState.date}
          event={modalState.event}
          onSave={handleSave}
          onDelete={deleteEvent}
          onClose={() => setModalState(null)}
        />
      )}

      {/* New project modal — triggered by day click for all roles */}
      {newProjectDate && (
        <NewProjectModal
          prefillDate={newProjectDate}
          onClose={() => setNewProjectDate(null)}
          onCreated={(id) => { setNewProjectDate(null); navigate(`/projects/${id}/creative`) }}
        />
      )}
    </div>
  )
}
