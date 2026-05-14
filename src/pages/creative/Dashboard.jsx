import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Film, CalendarDays, ChevronRight, Loader2, MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'

export default function CreativeDashboard() {
  const { profile, user } = useAuth()
  const [projects, setProjects] = useState([])
  const [recentMedia, setRecentMedia] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: proj }, { data: media }] = await Promise.all([
        supabase.from('projects').select('id, title, status, created_at, clients(name)').order('created_at', { ascending: false }).limit(6),
        supabase.from('media').select('id, title, status, created_at, projects(title)').order('created_at', { ascending: false }).limit(4),
      ])
      setProjects(proj || [])
      setRecentMedia(media || [])
      setLoading(false)
    }
    load()
  }, [user])

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <p className="text-sm text-text-muted">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-2xl font-bold text-text-primary">
          Hey {profile?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-text-secondary mt-1">Here's what's active across your projects.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-8">
          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { to: '/videos', icon: Film, label: 'Video Review', desc: 'Upload and review video content', color: '#6C63FF' },
              { to: '/calendar', icon: CalendarDays, label: 'Calendar', desc: 'Shoot days, edits, and deadlines', color: '#10b981' },
            ].map(({ to, icon: Icon, label, desc, color }) => (
              <Link key={to} to={to} className="card p-5 hover:shadow-md transition-shadow group flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: color + '18' }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary mb-0.5">{label}</p>
                  <p className="text-xs text-text-secondary">{desc}</p>
                </div>
                <div className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
                  Open <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>

          {/* Recent media */}
          {recentMedia.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-primary">Recent Uploads</h2>
                <Link to="/videos" className="text-xs text-accent hover:underline">View all</Link>
              </div>
              <div className="card divide-y divide-border overflow-hidden">
                {recentMedia.map((m) => (
                  <Link key={m.id} to={`/video/${m.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Film size={15} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{m.title}</p>
                      {m.projects?.title && (
                        <p className="text-xs text-text-muted">{m.projects.title}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.status === 'approved' ? 'bg-green-100 text-green-700' :
                      m.status === 'changes_requested' ? 'bg-amber-100 text-amber-700' :
                      'bg-surface-3 text-text-muted'
                    }`}>
                      {m.status?.replace('_', ' ')}
                    </span>
                    <ChevronRight size={15} className="text-text-muted shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
