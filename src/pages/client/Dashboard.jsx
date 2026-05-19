import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FolderKanban, ArrowRight, CalendarDays, Loader2,
  FileText, Camera, Scissors, MapPin,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO, formatDistanceToNow, isFuture, isToday } from 'date-fns'
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

  const [clientId,       setClientId]       = useState(null)
  const [projects,       setProjects]       = useState([])
  const [pendingReview,  setPendingReview]  = useState(null)
  const [pendingConcepts,setPendingConcepts]= useState(0)
  const [upcomingShoots, setUpcomingShoots] = useState([])
  const [loading,        setLoading]        = useState(true)

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
          supabase.from('projects').select('id, name, stage, status, due_date').eq('client_id', client.id).neq('stage', 'archived').order('created_at', { ascending: false }),
          supabase.from('project_revisions').select('id, project_id, revision_number, status').eq('status', 'pending_client_review'),
          supabase.from('content_drafts').select('id').eq('client_id', client.id).eq('status', 'pending_client'),
          supabase.from('shoots').select('id, title, shoot_date, shoot_time, location, status').eq('client_id', client.id).gte('shoot_date', today).neq('status', 'cancelled').order('shoot_date', { ascending: true }).limit(3),
        ])

        const projData = projRes.data || []
        setProjects(projData)
        setPendingConcepts((conceptsRes.data || []).length)
        setUpcomingShoots(shootsRes.data || [])

        const rev = (revRes.data || []).find((r) => projData.some((p) => p.id === r.project_id))
        if (rev) {
          const proj = projData.find((p) => p.id === rev.project_id)
          setPendingReview({ revision: rev, project: proj })
        }
        setLoading(false)
      })
  }, [user])

  const firstName      = profile?.full_name?.split(' ')[0] || 'there'
  const activeProjects = projects.filter((p) => p.stage !== 'delivered')
  const inEdit         = projects.filter((p) => ['post_production','review','revisions'].includes(p.stage)).length

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
              ? `${activeProjects.length} active project${activeProjects.length !== 1 ? 's' : ''}${inEdit > 0 ? ` · ${inEdit} in the edit` : ''}`
              : 'Welcome to your project portal.'}
          </p>
        </div>

        {/* Stats strip */}
        {projects.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Active',    value: activeProjects.length, icon: FolderKanban, color: 'text-accent',      bg: 'bg-accent/10' },
              { label: 'In Edit',  value: inEdit,                 icon: Scissors,     color: 'text-purple-600',  bg: 'bg-purple-50' },
              { label: 'Concepts', value: pendingConcepts,        icon: FileText,     color: pendingConcepts > 0 ? 'text-amber-600' : 'text-gray-400', bg: pendingConcepts > 0 ? 'bg-amber-50' : 'bg-gray-50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
                <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
                  <Icon size={15} className={color} />
                </div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* 🎬 Video ready — highest priority alert */}
        {pendingReview && (
          <div className="mb-5 bg-accent rounded-2xl p-5 text-white shadow-lg shadow-accent/20">
            <p className="text-xs font-semibold opacity-70 mb-1 uppercase tracking-wide">Action Required</p>
            <p className="text-sm font-semibold opacity-80 mb-0.5">🎬 Your video is ready for review</p>
            <p className="text-lg font-bold mb-4">{pendingReview.project?.name}</p>
            <button
              onClick={() => navigate(`/projects/${pendingReview.project.id}/revision/${pendingReview.revision.id}`)}
              className="bg-white text-accent font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-white/90 transition-colors flex items-center gap-2 w-fit shadow-sm"
            >
              Watch & Leave Feedback <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Upcoming shoots */}
        {upcomingShoots.length > 0 && (
          <div className="mb-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Upcoming Shoots</h2>
            <div className="space-y-2">
              {upcomingShoots.map((shoot) => {
                const shootDate = parseISO(shoot.shoot_date)
                const isShootToday = isToday(shootDate)
                return (
                  <div key={shoot.id} className={`flex items-start gap-3 p-4 rounded-2xl border ${isShootToday ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'} shadow-sm`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isShootToday ? 'bg-amber-100' : 'bg-purple-50'}`}>
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

        {/* Your Projects */}
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
                  <Link key={proj.id} to={`/my-projects/${proj.id}`}
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
                          <span className="text-[10px] text-gray-400">
                            Due {format(parseISO(proj.due_date), 'MMM d')}
                          </span>
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
        {projects.length === 0 && !loading && (
          <div className="mb-5 p-4 rounded-2xl border border-dashed border-gray-200 text-center">
            <p className="text-sm text-gray-400">No active projects yet.</p>
          </div>
        )}

        {/* Nav links */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick Access</h2>

          <Link to="/my-projects" className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white hover:border-accent/30 hover:bg-accent/5 transition-all group shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <FolderKanban size={18} className="text-accent" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Your Projects</p>
              <p className="text-xs text-gray-400 mt-0.5">{activeProjects.length > 0 ? `${activeProjects.length} in progress` : 'View all projects'}</p>
            </div>
            <ArrowRight size={15} className="text-gray-300 group-hover:text-accent transition-colors" />
          </Link>

          <Link to="/client/concepts" className={`flex items-center gap-4 p-4 rounded-2xl border transition-all group shadow-sm ${pendingConcepts > 0 ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300' : 'border-gray-100 bg-white hover:border-accent/30 hover:bg-accent/5'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative ${pendingConcepts > 0 ? 'bg-amber-100' : 'bg-purple-50'}`}>
              <FileText size={18} className={pendingConcepts > 0 ? 'text-amber-600' : 'text-purple-600'} />
              {pendingConcepts > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">{pendingConcepts}</span>
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Content Concepts</p>
              <p className={`text-xs mt-0.5 ${pendingConcepts > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                {pendingConcepts > 0 ? `${pendingConcepts} waiting for your approval` : 'Review and approve ideas'}
              </p>
            </div>
            <ArrowRight size={15} className={`transition-colors ${pendingConcepts > 0 ? 'text-amber-400' : 'text-gray-300 group-hover:text-accent'}`} />
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
