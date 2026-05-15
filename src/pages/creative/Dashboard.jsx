import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Loader2, AlertCircle, CalendarDays, FolderKanban,
  Upload, CheckSquare, Clock, ChevronRight, MapPin, Video, Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, isToday, isTomorrow, isWithinInterval, addDays, startOfDay, endOfDay, parseISO } from 'date-fns'

// ── Stage helpers ──────────────────────────────────────────────────────────────
const STAGE_LABEL = {
  briefing:        'Planning',
  pre_production:  'Pre-Production',
  production:      'Shooting',
  post_production: 'Editing',
  review:          'In Review',
  delivered:       'Delivered',
}

const STAGE_DOT = {
  briefing:        'bg-slate-400',
  pre_production:  'bg-blue-500',
  production:      'bg-amber-500',
  post_production: 'bg-purple-500',
  review:          'bg-orange-500',
  delivered:       'bg-green-500',
}

// ── Determine what action (if any) a user needs to take on a project ──────────
function needsAction(project, revisions, userId, isAdmin) {
  const myRevs = revisions.filter((r) => r.project_id === project.id)
  const latestRev = myRevs[myRevs.length - 1]
  const isCreative = isAdmin || project.creative_id === userId
  const isEditor   = isAdmin || project.editor_id   === userId

  if (isCreative && project.stage === 'production') {
    return { label: 'Upload footage', icon: Upload, color: 'amber' }
  }
  if (isCreative && project.stage === 'post_production') {
    return { label: 'Send to editor', icon: Zap, color: 'purple' }
  }
  if (isCreative && latestRev?.status === 'pending_creative_review') {
    return { label: `Review revision ${latestRev.revision_number}`, icon: CheckSquare, color: 'orange' }
  }
  if (isEditor && latestRev?.status === 'pending_editor') {
    return { label: `Upload revision ${latestRev.revision_number}`, icon: Upload, color: 'blue' }
  }
  return null
}

// ── Shoot date label ───────────────────────────────────────────────────────────
function shootLabel(dateStr) {
  if (!dateStr) return null
  const d = parseISO(dateStr)
  if (isToday(d))    return { text: 'Today',    cls: 'text-red-600 font-bold' }
  if (isTomorrow(d)) return { text: 'Tomorrow', cls: 'text-amber-600 font-semibold' }
  return { text: format(d, 'EEE, MMM d'), cls: 'text-text-secondary' }
}

// ── Event type colors ──────────────────────────────────────────────────────────
const EVENT_COLOR = {
  in_person:   '#3b82f6',
  virtual:     '#ca8a04',
  travel:      '#16a34a',
  real_estate: '#9333ea',
  personal:    '#ea580c',
}
const EVENT_LABEL = {
  in_person:   'In Person',
  virtual:     'Virtual',
  travel:      'Travel',
  real_estate: 'Real Estate',
  personal:    'Personal',
}

// ── Stat chip ──────────────────────────────────────────────────────────────────
function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div className="card flex items-center gap-4 px-5 py-5">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: accent + '18' }}>
        <Icon size={20} style={{ color: accent }} />
      </div>
      <div>
        <p className="text-3xl font-bold text-text-primary leading-none">{value}</p>
        <p className="text-sm text-text-muted mt-1">{label}</p>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function CreativeDashboard() {
  const { profile, user } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [projects,   setProjects]   = useState([])
  const [revisions,  setRevisions]  = useState([])
  const [events,     setEvents]     = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!user?.id) return

    async function load() {
      const now     = new Date()
      const cutoff  = addDays(now, 21) // look 3 weeks ahead

      // My projects (or all for admin)
      let projQuery = supabase
        .from('projects')
        .select('id, name, stage, shoot_date, location, creative_id, editor_id, clients(name, contact_name)')
        .neq('stage', 'archived')
        .order('shoot_date', { ascending: true, nullsFirst: false })

      if (!isAdmin) {
        projQuery = projQuery.or(`creative_id.eq.${user.id},editor_id.eq.${user.id}`)
      }

      const { data: projData } = await projQuery

      const myProjects = projData || []
      const projectIds = myProjects.map((p) => p.id)

      // Revisions for those projects
      const { data: revData } = projectIds.length
        ? await supabase
            .from('project_revisions')
            .select('id, project_id, revision_number, status, created_at')
            .in('project_id', projectIds)
            .order('revision_number')
        : { data: [] }

      // Upcoming calendar events (next 3 weeks) that I'm part of (or visible)
      const { data: evtData } = await supabase
        .from('calendar_events')
        .select('id, title, start_at, end_at, event_type, location, all_day, calendar_event_members(profile_id)')
        .gte('start_at', now.toISOString())
        .lte('start_at', cutoff.toISOString())
        .order('start_at')

      // Filter: show event if not personal, OR if user is a member
      const visibleEvents = (evtData || []).filter((e) => {
        if (e.event_type !== 'personal') return true
        return (e.calendar_event_members || []).some((m) => m.profile_id === user.id)
      })

      setProjects(myProjects)
      setRevisions(revData || [])
      setEvents(visibleEvents)
      setLoading(false)
    }

    load()
  }, [user, isAdmin])

  const firstName    = profile?.full_name?.split(' ')[0] || 'there'
  const activeProjs  = projects.filter((p) => p.stage !== 'delivered')

  // Projects needing my action right now
  const actionItems  = activeProjs
    .map((p) => ({ project: p, action: needsAction(p, revisions, user?.id, isAdmin) }))
    .filter((x) => x.action !== null)

  // Upcoming shoot dates from projects (next 21 days, not already shot)
  const now = new Date()
  const upcoming = [
    // From project shoot_dates
    ...projects
      .filter((p) => {
        if (!p.shoot_date) return false
        const d = parseISO(p.shoot_date)
        return isWithinInterval(d, { start: startOfDay(now), end: addDays(now, 21) }) &&
               p.stage !== 'delivered'
      })
      .map((p) => ({
        id:    'proj-' + p.id,
        title: p.name,
        sub:   p.clients?.name || p.clients?.contact_name || null,
        date:  p.shoot_date,
        type:  'shoot',
        loc:   p.location || null,
        link:  `/projects/${p.id}`,
      })),
    // From calendar events
    ...events.map((e) => ({
      id:    'evt-' + e.id,
      title: e.title,
      sub:   EVENT_LABEL[e.event_type] || e.event_type,
      date:  e.start_at,
      type:  'event',
      evtType: e.event_type,
      loc:   e.location || null,
      link:  '/calendar',
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))

  // Stats
  const shootsThisWeek = upcoming.filter((u) => {
    const d = new Date(u.date)
    return isWithinInterval(d, { start: startOfDay(now), end: endOfDay(addDays(now, 14)) })
  }).length

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="p-8 max-w-4xl space-y-9">

      {/* Greeting */}
      <div>
        <p className="text-base text-text-muted">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-3xl font-bold text-text-primary mt-1">
          Hey, {firstName} 👋
        </h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Active projects"   value={activeProjs.length}   icon={FolderKanban} accent="#6C63FF" />
        <Stat label="Need your action"  value={actionItems.length}   icon={AlertCircle}  accent={actionItems.length ? '#f59e0b' : '#94a3b8'} />
        <Stat label="Next 14 days"       value={shootsThisWeek}       icon={CalendarDays} accent="#10b981" />
      </div>

      {/* Needs attention */}
      {actionItems.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            Needs your attention
          </h2>
          <div className="card divide-y divide-border overflow-hidden">
            {actionItems.map(({ project, action }) => {
              const ActionIcon = action.icon
              const colors = {
                amber:  { bg: 'bg-amber-50',  text: 'text-amber-700'  },
                purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
                orange: { bg: 'bg-orange-50', text: 'text-orange-700' },
                blue:   { bg: 'bg-blue-50',   text: 'text-blue-700'   },
              }[action.color]

              return (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2 transition-colors group"
                >
                  <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
                    <ActionIcon size={18} className={colors.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary truncate">{project.name}</p>
                    <p className={`text-sm font-medium ${colors.text} mt-0.5`}>{action.label}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    {project.clients?.name && (
                      <span className="text-sm text-text-muted hidden sm:block">{project.clients.name}</span>
                    )}
                    <ChevronRight size={16} className="text-text-muted group-hover:text-accent transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-500" />
            Coming up
          </h2>
          <div className="card divide-y divide-border overflow-hidden">
            {upcoming.slice(0, 6).map((item) => {
              const lbl = shootLabel(item.date)
              const dotColor = item.type === 'shoot'
                ? '#f59e0b'
                : (EVENT_COLOR[item.evtType] || '#6C63FF')

              return (
                <Link
                  key={item.id}
                  to={item.link}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2 transition-colors group"
                >
                  <span className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: dotColor }} />

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.sub && (
                        <span className="text-sm text-text-muted">{item.sub}</span>
                      )}
                      {item.loc && (
                        <span className="flex items-center gap-1 text-sm text-text-muted">
                          <MapPin size={12} />
                          {item.loc}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {lbl && <p className={`text-sm ${lbl.cls}`}>{lbl.text}</p>}
                    {item.type === 'event' && (
                      <p className="text-xs text-text-muted mt-0.5">
                        {format(parseISO(item.date), 'h:mm a')}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
          {upcoming.length > 6 && (
            <Link to="/calendar" className="block text-sm text-accent text-center mt-2 hover:underline">
              + {upcoming.length - 6} more on calendar
            </Link>
          )}
        </section>
      )}

      {/* Active projects */}
      {activeProjs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <FolderKanban size={16} className="text-accent" />
              {isAdmin ? 'All active projects' : 'Your projects'}
            </h2>
            <Link to="/projects" className="text-sm text-accent hover:underline">View all</Link>
          </div>
          <div className="card divide-y divide-border overflow-hidden">
            {activeProjs.map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2 transition-colors group"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STAGE_DOT[p.stage] || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary truncate">{p.name}</p>
                  {(p.clients?.name || p.clients?.contact_name) && (
                    <p className="text-sm text-text-muted truncate">
                      {p.clients.name || p.clients.contact_name}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <span className="text-xs font-medium text-text-muted">
                    {STAGE_LABEL[p.stage] || p.stage}
                  </span>
                  <ChevronRight size={16} className="text-text-muted group-hover:text-accent transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {activeProjs.length === 0 && upcoming.length === 0 && (
        <div className="text-center py-16 text-text-muted">
          <Video size={36} className="mx-auto mb-3 text-text-muted/40" />
          <p className="font-medium">No active projects yet</p>
          <p className="text-sm mt-1">Once a project is assigned to you it'll show up here.</p>
        </div>
      )}

    </div>
  )
}
