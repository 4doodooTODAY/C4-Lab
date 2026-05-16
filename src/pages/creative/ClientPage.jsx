import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Camera, FolderKanban, HardDrive, Loader2,
  CalendarDays, MapPin, Film, ExternalLink,
  ChevronRight, Building2, FileVideo, Image, File,
  FileText, Link as LinkIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useShoots } from '../../hooks/useShoots'
import { useContentDrafts } from '../../hooks/useContentDrafts'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (!bytes) return ''
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB'
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(1) + ' KB'
}

function fileIcon(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return Film
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return Image
  return File
}

const STAGE_COLORS = {
  post_production: 'bg-purple-50 text-purple-600',
  review:          'bg-orange-50 text-orange-600',
  revisions:       'bg-red-50 text-red-600',
  delivered:       'bg-green-50 text-green-700',
  production:      'bg-amber-50 text-amber-700',
}
const STAGE_LABELS = {
  briefing: 'Briefing', pre_production: 'Pre-Production', production: 'Production',
  post_production: 'Post-Production', review: 'Review', revisions: 'Revisions', delivered: 'Delivered',
}

// ── Shoots Tab ─────────────────────────────────────────────────────────────────
function ShootsTab({ clientId }) {
  const { shoots, loading } = useShoots(clientId)
  const today = startOfDay(new Date())

  const upcoming = shoots.filter((s) => s.shoot_date && !isBefore(parseISO(s.shoot_date), today))
  const past     = shoots.filter((s) => !s.shoot_date || isBefore(parseISO(s.shoot_date), today))

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-text-muted" /></div>

  if (!shoots.length) return (
    <div className="card p-10 text-center">
      <Camera size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">No shoots yet</p>
      <p className="text-sm text-text-muted mt-1">Shoots scheduled by admin will appear here.</p>
    </div>
  )

  const ShootRow = ({ shoot }) => (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-text-primary">{shoot.title}</p>
          <div className="flex flex-wrap gap-3 mt-1.5">
            {shoot.shoot_date && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <CalendarDays size={11} />
                {format(parseISO(shoot.shoot_date), 'EEE, MMM d yyyy')}
                {shoot.shoot_time && ` · ${shoot.shoot_time.slice(0, 5)}`}
              </span>
            )}
            {shoot.location && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <MapPin size={11} /> {shoot.location}
              </span>
            )}
          </div>
          {shoot.description && <p className="text-xs text-text-secondary mt-1.5 line-clamp-2">{shoot.description}</p>}
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          shoot.status === 'completed' ? 'bg-green-50 text-green-700' :
          shoot.status === 'cancelled' ? 'bg-red-50 text-red-600' :
          'bg-blue-50 text-blue-700'
        }`}>
          {shoot.status}
        </span>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Upcoming</h3>
          <div className="space-y-3">{upcoming.map((s) => <ShootRow key={s.id} shoot={s} />)}</div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Past</h3>
          <div className="space-y-3">{past.map((s) => <ShootRow key={s.id} shoot={s} />)}</div>
        </div>
      )}
    </div>
  )
}

// ── Projects Tab ───────────────────────────────────────────────────────────────
function ProjectsTab({ clientId }) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, stage, due_date, creative_id, editor_id, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setProjects(data || []); setLoading(false) })
  }, [clientId])

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-text-muted" /></div>

  if (!projects.length) return (
    <div className="card p-10 text-center">
      <FolderKanban size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">No projects yet</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {projects.map((p) => (
        <div key={p.id}
          onClick={() => navigate(`/projects/${p.id}/creative`)}
          className="card p-4 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">{p.name}</p>
            {p.due_date && (
              <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                <CalendarDays size={10} /> Due {format(parseISO(p.due_date), 'MMM d, yyyy')}
              </p>
            )}
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] || 'bg-surface-2 text-text-muted'}`}>
            {STAGE_LABELS[p.stage] || p.stage}
          </span>
          <ChevronRight size={14} className="text-text-muted shrink-0" />
        </div>
      ))}
    </div>
  )
}

// ── Files Tab (Storage Browser) ────────────────────────────────────────────────
function FilesTab({ clientId }) {
  const { shoots, loading: shootsLoading } = useShoots(clientId)
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    if (!clientId) return
    supabase
      .from('shoot_uploads')
      .select('id, file_name, file_url, file_size, shoot_id, created_at, project_id')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setUploads(data || []); setLoading(false) })
  }, [clientId])

  if (shootsLoading || loading) return (
    <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
  )

  // Group uploads by shoot_id
  const byShoot = {}
  uploads.forEach((u) => {
    const key = u.shoot_id || 'unlinked'
    if (!byShoot[key]) byShoot[key] = []
    byShoot[key].push(u)
  })

  const shootMap = {}
  shoots.forEach((s) => { shootMap[s.id] = s })

  const groups = [
    ...shoots.map((s) => ({ key: s.id, label: s.title, date: s.shoot_date, files: byShoot[s.id] || [] })),
    ...(byShoot['unlinked']?.length ? [{ key: 'unlinked', label: 'Other Uploads', date: null, files: byShoot['unlinked'] }] : []),
  ].filter((g) => g.files.length > 0)

  if (!groups.length) return (
    <div className="card p-10 text-center">
      <HardDrive size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">No files uploaded yet</p>
      <p className="text-sm text-text-muted mt-1">Client footage uploads will appear here.</p>
    </div>
  )

  const toggleGroup = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }))

  return (
    <div className="space-y-3">
      {groups.map(({ key, label, date, files }) => {
        const isOpen = expanded[key] !== false // default open
        return (
          <div key={key} className="card overflow-hidden">
            <button
              onClick={() => toggleGroup(key)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-2/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Camera size={14} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{label}</p>
                  <p className="text-xs text-text-muted">
                    {files.length} file{files.length !== 1 ? 's' : ''}
                    {date && ` · ${format(parseISO(date), 'MMM d, yyyy')}`}
                  </p>
                </div>
              </div>
              <ChevronRight size={14} className={`text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>

            {isOpen && (
              <div className="border-t border-border">
                {files.map((file) => {
                  const Icon = fileIcon(file.file_name)
                  return (
                    <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors">
                      <Icon size={14} className="text-text-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{file.file_name || 'Unnamed file'}</p>
                        <p className="text-xs text-text-muted">
                          {fmtBytes(file.file_size)} · {format(new Date(file.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      {file.file_url && (
                        <a href={file.file_url} target="_blank" rel="noreferrer"
                          className="p-1.5 text-text-muted hover:text-accent transition-colors"
                          title="Open file"
                          onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Concepts Tab (read-only view of content drafts) ───────────────────────────
const DRAFT_TYPE_LABELS = {
  post: 'Post', reel: 'Reel', story: 'Story', carousel: 'Carousel', other: 'Other',
}
const DRAFT_STATUS_COLORS = {
  pending_client: 'bg-amber-50 text-amber-700',
  approved:       'bg-green-50 text-green-700',
  scrapped:       'bg-gray-100 text-gray-500',
}
const DRAFT_STATUS_LABELS = {
  pending_client: 'Awaiting Client',
  approved:       'Approved',
  scrapped:       'Scrapped',
}

function ConceptsTab({ clientId }) {
  const { drafts, loading } = useContentDrafts(clientId)
  const active = drafts.filter((d) => d.status !== 'scrapped')

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-text-muted" /></div>

  if (!active.length) return (
    <div className="card p-10 text-center">
      <FileText size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">No concepts yet</p>
      <p className="text-sm text-text-muted mt-1">The admin will create content concepts for this client.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {active.map((d) => (
        <div key={d.id} className="card p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-3 text-text-muted">
                {DRAFT_TYPE_LABELS[d.type] || d.type || 'Draft'}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${DRAFT_STATUS_COLORS[d.status] || 'bg-surface-2 text-text-muted'}`}>
                {DRAFT_STATUS_LABELS[d.status] || d.status}
              </span>
              {d.target_date && (
                <span className="text-[10px] text-text-muted flex items-center gap-1">
                  <CalendarDays size={9} /> {format(parseISO(d.target_date), 'MMM d')}
                </span>
              )}
            </div>
          </div>
          {d.title && <p className="text-sm font-semibold text-text-primary">{d.title}</p>}
          {d.concept && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{d.concept}</p>}
          {d.shoots?.title && (
            <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
              <Camera size={10} /> {d.shoots.title}
            </p>
          )}
          {d.inspiration_links?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1.5">
              {d.inspiration_links.map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noreferrer"
                  className="text-[10px] text-accent hover:underline flex items-center gap-0.5">
                  <LinkIcon size={9} /> ref {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'shoots',   label: 'Shoots',   icon: Camera },
  { id: 'concepts', label: 'Concepts', icon: FileText },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'files',    label: 'Files',    icon: HardDrive },
]

export default function CreativeClientPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('shoots')

  useEffect(() => {
    if (!id) return
    supabase.from('clients').select('id, name, contact_name').eq('id', id).single()
      .then(({ data }) => { setClient(data); setLoading(false) })
  }, [id])

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
  if (!client) return <div className="p-8 text-center text-text-muted">Client not found.</div>

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/clients')} className="btn-ghost p-2"><ArrowLeft size={16} /></button>
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
          <Building2 size={18} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{client.name}</h1>
          {client.contact_name && <p className="text-sm text-text-muted">{client.contact_name}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === tabId ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'shoots'   && <ShootsTab   clientId={id} />}
      {tab === 'concepts' && <ConceptsTab clientId={id} />}
      {tab === 'projects' && <ProjectsTab clientId={id} />}
      {tab === 'files'    && <FilesTab    clientId={id} />}
    </div>
  )
}
