import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, Camera, PenLine, Building2, ChevronDown, ChevronRight, MessageSquare, FolderKanban, Eye } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'

const ROLE_META = {
  admin:    { label: 'Admin',      icon: ShieldCheck, color: '#6C63FF', bg: 'bg-violet-50',  text: 'text-violet-700'  },
  creative: { label: 'Creative',   icon: Camera,      color: '#f59e0b', bg: 'bg-amber-50',   text: 'text-amber-700'   },
  client:   { label: 'Client',     icon: Building2,   color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700' },
}

function RoleChip({ role }) {
  const m = ROLE_META[role] || ROLE_META.creative
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.bg} ${m.text}`}>
      <m.icon size={10} />
      {m.label}
    </span>
  )
}

function Tag({ children, color = 'gray' }) {
  const cls = {
    gray:   'bg-surface-2 text-text-secondary',
    blue:   'bg-blue-50 text-blue-700',
    amber:  'bg-amber-50 text-amber-700',
    green:  'bg-emerald-50 text-emerald-700',
    purple: 'bg-violet-50 text-violet-700',
  }[color] || 'bg-surface-2 text-text-secondary'
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md ${cls}`}>
      {children}
    </span>
  )
}

function Section({ title, icon: Icon, color, count, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-2 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: color + '18' }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div className="flex-1 text-left">
          <p className="font-semibold text-text-primary">{title}</p>
          <p className="text-xs text-text-muted">{count} {count === 1 ? 'person' : 'people'}</p>
        </div>
        {open ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
      </button>
      {open && <div className="divide-y divide-border border-t border-border">{children}</div>}
    </div>
  )
}

function UserRow({ profile, projects = [], canMessage = [], canSee = [] }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = projects.length > 0 || canMessage.length > 0 || canSee.length > 0

  return (
    <div>
      <button
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${hasDetails ? 'hover:bg-surface-2 cursor-pointer' : 'cursor-default'}`}
      >
        <Avatar profile={profile} size={36} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary truncate">{profile.full_name || profile.email || '—'}</p>
          <p className="text-xs text-text-muted truncate">{profile.email}</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {projects.length > 0 && (
            <Tag color="blue">{projects.length} project{projects.length !== 1 ? 's' : ''}</Tag>
          )}
          {canMessage.length > 0 && (
            <Tag color="green">Can message {canMessage.length}</Tag>
          )}
          {hasDetails && (
            expanded
              ? <ChevronDown size={14} className="text-text-muted" />
              : <ChevronRight size={14} className="text-text-muted" />
          )}
        </div>
      </button>

      {expanded && hasDetails && (
        <div className="px-5 pb-4 pt-1 bg-surface-2/50 space-y-4">

          {/* Projects */}
          {projects.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FolderKanban size={11} /> Projects
              </p>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => (
                  <Tag key={p.id} color="blue">{p.name}{p.role ? ` · ${p.role}` : ''}</Tag>
                ))}
              </div>
            </div>
          )}

          {/* Can message */}
          {canMessage.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MessageSquare size={11} /> Can message
              </p>
              <div className="flex flex-wrap gap-1.5">
                {canMessage.map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 bg-white border border-border rounded-lg px-2 py-1">
                    <Avatar profile={p} size={16} />
                    <span className="text-xs font-medium text-text-primary">{p.full_name}</span>
                    <RoleChip role={p.role} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Can see */}
          {canSee.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Eye size={11} /> Can view
              </p>
              <div className="flex flex-wrap gap-1.5">
                {canSee.map((s, i) => (
                  <Tag key={i} color="gray">{s}</Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AccessOverview() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { data: profiles },
        { data: projects },
        { data: clients  },
      ] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, role').order('full_name'),
        supabase.from('projects')
          .select('id, name, stage, creative_id, editor_id, client_id, clients(profile_id, name, contact_name)')
          .neq('stage', 'archived'),
        supabase.from('clients').select('id, profile_id, name, contact_name'),
      ])

      const profileMap  = Object.fromEntries((profiles || []).map((p) => [p.id, p]))
      const clientByProfileId = Object.fromEntries((clients || []).map((c) => [c.profile_id, c]))

      const admins    = (profiles || []).filter((p) => p.role === 'admin')
      const creatives = (profiles || []).filter((p) => p.role === 'creative')
      const clientPs  = (profiles || []).filter((p) => p.role === 'client')

      // ── Build creative access map ─────────────────────────────────────────
      const creativeRows = creatives.map((c) => {
        const myProjects = (projects || []).filter(
          (p) => p.creative_id === c.id || p.editor_id === c.id
        )
        // teammates
        const teammateIds = new Set(
          myProjects.flatMap((p) => [p.creative_id, p.editor_id].filter(Boolean))
        )
        teammateIds.delete(c.id)
        // client profiles
        const clientProfileIds = new Set(
          myProjects.map((p) => p.clients?.profile_id).filter(Boolean)
        )
        const canMessage = [
          ...admins,
          ...[...teammateIds].map((id) => profileMap[id]).filter(Boolean),
          ...[...clientProfileIds].map((id) => profileMap[id]).filter(Boolean),
        ].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)

        const projectList = myProjects.map((p) => ({
          id:   p.id,
          name: p.name,
          role: p.creative_id === c.id && p.editor_id === c.id
            ? 'Photographer & Editor'
            : p.creative_id === c.id
            ? 'Photographer'
            : 'Editor',
        }))

        const canSee = [
          'Projects dashboard',
          'Video review',
          'Calendar',
          'Team messages',
        ]

        return { profile: c, projects: projectList, canMessage, canSee }
      })

      // ── Build client access map ───────────────────────────────────────────
      const clientRows = clientPs.map((c) => {
        const clientRecord = clientByProfileId[c.id]
        const myProjects = clientRecord
          ? (projects || []).filter((p) => p.client_id === clientRecord.id)
          : []

        const photographerId = myProjects.find((p) => p.creative_id)?.creative_id || null
        const editorId       = myProjects.find((p) => p.editor_id)?.editor_id     || null

        const canMessage = [
          ...(photographerId && profileMap[photographerId] ? [profileMap[photographerId]] : []),
          ...(editorId && editorId !== photographerId && profileMap[editorId] ? [profileMap[editorId]] : []),
          ...admins,
        ]

        const projectList = myProjects.map((p) => ({ id: p.id, name: p.name }))

        const canSee = [
          'My projects',
          'Client calendar',
          'Revision videos',
        ]

        return { profile: c, projects: projectList, canMessage, canSee }
      })

      setData({ admins, creativeRows, clientRows })
      setLoading(false)
    }

    load()
  }, [])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  const { admins, creativeRows, clientRows } = data

  return (
    <div className="p-8 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Access Overview</h1>
        <p className="text-text-muted mt-1">
          See exactly what every person in the system can access and who they can reach.
        </p>
      </div>

      {/* Admins */}
      <Section title="Admins" icon={ShieldCheck} color="#6C63FF" count={admins.length}>
        {admins.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">No admins found.</p>
        ) : admins.map((a) => (
          <UserRow
            key={a.id}
            profile={a}
            canSee={['Full access to everything — all projects, all users, all messages, all files']}
          />
        ))}
      </Section>

      {/* Creatives */}
      <Section title="Creatives" icon={Camera} color="#f59e0b" count={creativeRows.length}>
        {creativeRows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">No creatives found.</p>
        ) : creativeRows.map(({ profile, projects, canMessage, canSee }) => (
          <UserRow
            key={profile.id}
            profile={profile}
            projects={projects}
            canMessage={canMessage}
            canSee={canSee}
          />
        ))}
      </Section>

      {/* Clients */}
      <Section title="Clients" icon={Building2} color="#10b981" count={clientRows.length}>
        {clientRows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">No clients found.</p>
        ) : clientRows.map(({ profile, projects, canMessage, canSee }) => (
          <UserRow
            key={profile.id}
            profile={profile}
            projects={projects}
            canMessage={canMessage}
            canSee={canSee}
          />
        ))}
      </Section>
    </div>
  )
}
