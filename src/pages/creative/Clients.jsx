import { useAuth } from '../../contexts/AuthContext'
import { useCreativeClients } from '../../hooks/useClientCreatives'
import { useNavigate } from 'react-router-dom'
import { Loader2, Building2, Camera, FolderKanban, ChevronRight, Users2 } from 'lucide-react'
import { format, parseISO, isAfter, startOfDay } from 'date-fns'

function getNextShoot(shoots = []) {
  const today = startOfDay(new Date())
  const upcoming = shoots
    .filter((s) => s.shoot_date && isAfter(parseISO(s.shoot_date), today) && s.status === 'scheduled')
    .sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
  return upcoming[0] || null
}

function getActiveProjects(projects = []) {
  return projects.filter((p) => p.stage !== 'delivered')
}

export default function CreativeClients() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const { clients, loading } = useCreativeClients(profile?.id)

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  const clientList = clients.map((a) => ({
    assignment: a,
    client:     a.clients,
    nextShoot:  getNextShoot(a.clients?.shoots || []),
    active:     getActiveProjects(a.clients?.projects || []),
  }))

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">My Clients</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {clientList.length} client{clientList.length !== 1 ? 's' : ''} assigned to you
        </p>
      </div>

      {clientList.length === 0 ? (
        <div className="card p-12 text-center">
          <Users2 size={36} className="mx-auto text-text-muted/30 mb-3" />
          <p className="text-sm font-semibold text-text-primary">No clients assigned yet</p>
          <p className="text-sm text-text-muted mt-1">Ask an admin to assign you to a client.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {clientList.map(({ assignment, client, nextShoot, active }) => (
            <div
              key={assignment.id}
              onClick={() => navigate(`/clients/${client.id}`)}
              className="card p-5 hover:shadow-md hover:border-border-strong transition-all cursor-pointer"
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Building2 size={18} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{client?.name || '—'}</p>
                  <p className="text-xs text-text-muted mt-0.5">{client?.contact_name || ''}</p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
                  {assignment.role}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-surface-2 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-text-primary">{active.length}</p>
                  <p className="text-[10px] text-text-muted flex items-center justify-center gap-1">
                    <FolderKanban size={9} /> Active
                  </p>
                </div>
                <div className="bg-surface-2 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-text-primary">{client?.shoots?.length || 0}</p>
                  <p className="text-[10px] text-text-muted flex items-center justify-center gap-1">
                    <Camera size={9} /> Shoots
                  </p>
                </div>
              </div>

              {/* Next shoot */}
              {nextShoot ? (
                <div className="flex items-center gap-2 text-xs text-text-muted bg-blue-50 rounded-lg px-3 py-2">
                  <Camera size={11} className="text-blue-500 shrink-0" />
                  <span className="font-medium text-blue-700 truncate">{nextShoot.title}</span>
                  <span className="text-blue-500 shrink-0">{format(parseISO(nextShoot.shoot_date), 'MMM d')}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Camera size={11} />
                  <span>No upcoming shoots</span>
                </div>
              )}

              <ChevronRight size={14} className="text-text-muted absolute right-5 top-1/2 -translate-y-1/2 hidden" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
