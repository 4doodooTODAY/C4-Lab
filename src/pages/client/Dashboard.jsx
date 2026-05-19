import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FolderKanban, ArrowRight, CalendarDays, Loader2,
  FileText, Camera, Scissors, MapPin, Bell, Film,
  CheckCircle2, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO, formatDistanceToNow, isToday } from 'date-fns'
import { fmtTime } from '../../lib/time'

const STAGE_MAP = {
  briefing:        { label: 'Getting Started', color: 'bg-gray-100 text-gray-500' },
  pre_production:  { label: 'Planning',         color: 'bg-blue-50 text-blue-600' },
  production:      { label: 'In Production',    color: 'bg-amber-50 text-amber-700' },
  post_production: { label: 'Editing',          color: 'bg-purple-50 text-purple-600' },
  review:          { label: 'Ready to Review',  color: 'bg-orange-50 text-orange-600' },
  revisions:       { label: 'Revisions',        color: 'bg-red-50 text-red-600' },
  delivered:       { label: 'Complete',         color: 'bg-green-50 text-green-700' },
}

export default function ClientDashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()

  const [clientId,        setClientId]        = useState(null)
  const [projects,        setProjects]        = useState([])
  const [actions,         setActions]         = useState([])   // consolidated action items
  const [upcomingShoots,  setUpcomingShoots]  = useState([])
  const [loading,         setLoading]         = useState(true)

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('clients')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(async ({ data: client }) => {
        if (!client) { setLoading(false); return }
        setClientId(client.id)

        const today = new Date().toISOString().split('T')[0]

        const [projRes, revRes, conceptsRes, shootsRes] = await Promise.all([
          supabase.from('projects')
            .select('id, name, stage, status, due_date')
            .eq('client_id', client.id)
            .neq('status', 'archived')
            .order('created_at', { ascending: false }),
          supabase.from('project_revisions')
            .select('id, project_id, revision_number, status, projects(id, name, client_id)')
            .eq('status', 'pending_client_review'),
          supabase.from('content_drafts')
            .select('id, title, type')
            .eq('client_id', client.id)
            .eq('status', 'pending_client'),
          supabase.from('shoots')
            .select('id, title, shoot_date, shoot_time, location, status')
            .eq('client_id', client.id)
            .gte('shoot_date', today)
            .neq('status', 'cancelled')
            .order('shoot_date', { ascending: true })
            .limit(3),
        ])

        const projData = projRes.data || []
        setProjects(projData)
        setUpcomingShoots(shootsRes.data || [])

        // Build consolidated action list
        const actionItems = []

        // Videos ready for review — only for this client's projects
        const clientProjectIds = new Set(projData.map((p) => p.id))
        for (const rev of (revRes.data || [])) {
          if (clientProjectIds.has(rev.project_id)) {
            actionItems.push({
              id:       `rev-${rev.id}`,
              type:     'review',
              label:    rev.projects?.name || 'Your Video',
              sub:      `Revision ${rev.revision_number} is ready to watch`,
              href:     `/projects/${rev.project_id}/revision/${rev.id}`,
              priority: 1,
            })
          }
        }

        // Concepts awaiting approval
        for (const draft of (conceptsRes.data || [])) {
          actionItems.push({
            id:       `draft-${draft.id}`,
            type:     'concept',
            label:    draft.title || 'Content Concept',
            sub:      'Waiting for your approval',
            href:     '/client/concepts',
            priority: 2,
          })
        }

        // Sort by priority (reviews first)
        actionItems.sort((a, b) => a.priority - b.priority)
        setActions(actionItems)
        setLoading(false)
      })
  }, [user])

  const firstName      = profile?.full_name?.split(' ')[0] || 'there'
  const activeProjects = projects.filter((p) => p.stage !== 'delivered')

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-gray-200" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="max-w-[580px] mx-auto px-6 py-12">

        {/* Greeting */}
        <div className="mb-8">
          <p className="text-sm text-gray-400 mb-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="text-3xl font-bold text-gray-900">Hey, {firstName} 👋</h1>
          <p className="text-gray-400 mt-1.5">
            {activeProjects.length > 0
              ? `${activeProjects.length} active project${activeProjects.length !== 1 ? 's' : ''}`
              : 'Welcome to your project portal.'}
          </p>
        </div>

        {/* ── Action Required ──────────────────────────────────────────── */}
        {actions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                <Bell size={11} className="text-white" />
              </div>
              <h2 className="text-sm font-bold text-gray-900">
                Action Required
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {actions.length}
                </span>
              </h2>
            </div>

            <div className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
              {actions.map((action, i) => (
                <button
                  key={action.id}
                  onClick={() => navigate(action.href)}
                  className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-red-50/60 transition-colors text-left ${
                    i < actions.length - 1 ? 'border-b border-red-50' : ''
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    action.type === 'review' ? 'bg-accent text-white' : 'bg-amber-100'
                  }`}>
                    {action.type === 'review'
                      ? <Film size={16} className="text-white" />
                      : <FileText size={16} className="text-amber-600" />
                    }
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{action.label}</p>
                    <p className={`text-xs mt-0.5 ${
                      action.type === 'review' ? 'text-accent font-medium' : 'text-amber-600'
                    }`}>
                      {action.sub}
                    </p>
                  </div>

                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Upcoming Shoots ──────────────────────────────────────────── */}
        {upcomingShoots.length > 0 && (
          <div className="mb-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Upcoming Shoots</h2>
            <div className="space-y-2">
              {upcomingShoots.map((shoot) => {
                const shootDate   = parseISO(shoot.shoot_date)
                const isShootToday = isToday(shootDate)
                return (
                  <div key={shoot.id} className={`flex items-start gap-3 p-4 rounded-2xl border shadow-sm ${
                    isShootToday ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'
                  }`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isShootToday ? 'bg-amber-100' : 'bg-purple-50'
                    }`}>
                      <Camera size={18} className={isShootToday ? 'text-amber-600' : 'text-purple-500'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{shoot.title}</p>
                        {isShootToday && (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white uppercase tracking-wide">Today</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {isShootToday ? 'Today' : format(shootDate, 'EEEE, MMMM d')}
                        {shoot.shoot_time && ` · ${fmtTime(shoot.shoot_time)}`}
                      </p>
                      {shoot.location && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <MapPin size={9} /> {shoot.location}
                        </p>
                      )}
                    </div>
                    {!isShootToday && (
                      <p className="text-xs text-gray-400 shrink-0 mt-0.5">
                        {formatDistanceToNow(shootDate, { addSuffix: true })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Your Projects ─────────────────────────────────────────────── */}
        {projects.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Projects</h2>
              <Link to="/my-projects" className="text-xs text-accent font-medium hover:underline">View all →</Link>
            </div>
            <div className="space-y-2">
              {projects.slice(0, 3).map((proj) => {
                const stage = STAGE_MAP[proj.stage] || { label: proj.stage, color: 'bg-gray-100 text-gray-500' }
                return (
                  <Link key={proj.id} to="/my-projects"
                    className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white hover:border-accent/30 hover:bg-accent/5 transition-all group shadow-sm">
                    <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                      <FolderKanban size={15} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{proj.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${stage.color}`}>
                          {stage.label}
                        </span>
                        {proj.due_date && (
                          <span className="text-[10px] text-gray-400">Due {format(parseISO(proj.due_date), 'MMM d')}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight size={13} className="text-gray-300 group-hover:text-accent transition-colors shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {projects.length === 0 && actions.length === 0 && !loading && (
          <div className="mb-5 p-6 rounded-2xl border border-dashed border-gray-200 text-center">
            <CheckCircle2 size={28} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm font-medium text-gray-400">You're all caught up!</p>
            <p className="text-xs text-gray-300 mt-1">We'll let you know when something needs your attention.</p>
          </div>
        )}

        {/* ── Quick Access ──────────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick Access</h2>

          <Link to="/my-projects" className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white hover:border-accent/30 hover:bg-accent/5 transition-all group shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <FolderKanban size={18} className="text-accent" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Your Projects</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeProjects.length > 0 ? `${activeProjects.length} in progress` : 'View all projects'}
              </p>
            </div>
            <ArrowRight size={15} className="text-gray-300 group-hover:text-accent transition-colors" />
          </Link>

          <Link to="/client/concepts" className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white hover:border-accent/30 hover:bg-accent/5 transition-all group shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
              <FileText size={18} className="text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Content Concepts</p>
              <p className="text-xs text-gray-400 mt-0.5">Review and approve ideas from your team</p>
            </div>
            <ArrowRight size={15} className="text-gray-300 group-hover:text-accent transition-colors" />
          </Link>

          <Link to="/client/calendar" className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white hover:border-accent/30 hover:bg-accent/5 transition-all group shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <CalendarDays size={18} className="text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Calendar</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {upcomingShoots.length > 0 ? `${upcomingShoots.length} upcoming shoot${upcomingShoots.length !== 1 ? 's' : ''}` : 'Shoot dates and events'}
              </p>
            </div>
            <ArrowRight size={15} className="text-gray-300 group-hover:text-accent transition-colors" />
          </Link>
        </div>

      </div>
    </div>
  )
}
