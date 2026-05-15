import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderKanban, ArrowRight, CalendarDays, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'

export default function ClientDashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [projects,        setProjects]        = useState([])
  const [pendingReview,   setPendingReview]   = useState(null)
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

        const [projRes, revRes] = await Promise.all([
          supabase
            .from('projects')
            .select('id, name, stage')
            .eq('client_id', client.id)
            .neq('stage', 'archived')
            .order('created_at', { ascending: false }),
          supabase
            .from('project_revisions')
            .select('id, project_id, revision_number, status')
            .eq('status', 'pending_client_review'),
        ])

        setProjects(projRes.data || [])
        // Find a revision waiting on this client
        const rev = (revRes.data || []).find((r) =>
          (projRes.data || []).some((p) => p.id === r.project_id)
        )
        if (rev) {
          const proj = (projRes.data || []).find((p) => p.id === rev.project_id)
          setPendingReview({ revision: rev, project: proj })
        }
        setLoading(false)
      })
  }, [user])

  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const activeProjects = projects.filter((p) => p.stage !== 'delivered')

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-gray-300" />
    </div>
  )

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[560px] mx-auto px-6 py-14">

        {/* Greeting */}
        <div className="mb-10">
          <p className="text-sm text-gray-400 mb-1">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="text-3xl font-bold text-gray-900">
            Hey, {firstName} 👋
          </h1>
          <p className="text-gray-400 mt-2">
            {activeProjects.length > 0
              ? `You have ${activeProjects.length} active project${activeProjects.length !== 1 ? 's' : ''}.`
              : "Welcome to your project portal."}
          </p>
        </div>

        {/* Video ready to review — highest priority */}
        {pendingReview && (
          <div className="mb-6 bg-accent rounded-2xl p-5 text-white">
            <p className="text-sm font-semibold opacity-80 mb-1">🎬 Video ready for your review</p>
            <p className="text-xl font-bold mb-4">{pendingReview.project?.name}</p>
            <button
              onClick={() => navigate(`/projects/${pendingReview.project.id}/revision/${pendingReview.revision.id}`)}
              className="bg-white text-accent font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-white/90 transition-colors flex items-center gap-2 w-fit"
            >
              Watch & Review <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* Quick links */}
        <div className="space-y-3">
          <Link
            to="/my-projects"
            className="flex items-center gap-4 p-5 rounded-2xl border border-gray-100 hover:border-accent/30 hover:bg-accent/5 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <FolderKanban size={20} className="text-accent" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Your Projects</p>
              <p className="text-sm text-gray-400 mt-0.5">
                {activeProjects.length > 0
                  ? `${activeProjects.length} in progress`
                  : 'View all your projects'}
              </p>
            </div>
            <ArrowRight size={16} className="text-gray-300 group-hover:text-accent transition-colors" />
          </Link>

          <Link
            to="/client/calendar"
            className="flex items-center gap-4 p-5 rounded-2xl border border-gray-100 hover:border-accent/30 hover:bg-accent/5 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <CalendarDays size={20} className="text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Calendar</p>
              <p className="text-sm text-gray-400 mt-0.5">Shoot dates and upcoming meetings</p>
            </div>
            <ArrowRight size={16} className="text-gray-300 group-hover:text-accent transition-colors" />
          </Link>

        </div>
      </div>
    </div>
  )
}
