import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, Users, Film, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { count: userCount },
        { count: projectCount },
        { count: mediaCount },
        { data: recentProjects },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('*', { count: 'exact', head: true }),
        supabase.from('media').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('id, title, status, created_at, clients(name)').order('created_at', { ascending: false }).limit(5),
      ])
      setStats({ userCount, projectCount, mediaCount })
      setProjects(recentProjects || [])
      setLoading(false)
    }
    load()
  }, [])

  const statCards = [
    { label: 'Users', value: stats?.userCount ?? '—', icon: Users, color: '#6C63FF', to: '/admin/users' },
    { label: 'Projects', value: stats?.projectCount ?? '—', icon: FolderOpen, color: '#10b981', to: '/videos' },
    { label: 'Media Files', value: stats?.mediaCount ?? '—', icon: Film, color: '#f59e0b', to: '/videos' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-sm text-text-muted">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-2xl font-bold text-text-primary">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {profile?.full_name?.split(' ')[0] || 'Admin'}
        </h1>
        <p className="text-text-secondary mt-1">Here's what's happening across C4 Lab.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {statCards.map(({ label, value, icon: Icon, color, to }) => (
              <Link key={label} to={to} className="card p-5 hover:shadow-md transition-shadow flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: color + '18' }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{value}</p>
                  <p className="text-sm text-text-muted">{label}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Recent projects */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-primary">Recent Projects</h2>
              <Link to="/videos" className="text-xs text-accent hover:underline">View all</Link>
            </div>
            {projects.length === 0 ? (
              <div className="card p-8 text-center text-sm text-text-muted">No projects yet</div>
            ) : (
              <div className="card divide-y divide-border overflow-hidden">
                {projects.map((p) => (
                  <Link key={p.id} to="/videos"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <FolderOpen size={15} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{p.title}</p>
                      {p.clients?.name && (
                        <p className="text-xs text-text-muted truncate">{p.clients.name}</p>
                      )}
                    </div>
                    <ChevronRight size={15} className="text-text-muted shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
