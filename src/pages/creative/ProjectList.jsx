import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, FolderKanban, Camera, Scissors, CalendarDays, ArrowRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'

const STAGE_COLORS = {
  briefing:        'bg-slate-100 text-slate-600',
  pre_production:  'bg-blue-50 text-blue-600',
  production:      'bg-amber-50 text-amber-700',
  post_production: 'bg-purple-50 text-purple-600',
  review:          'bg-orange-50 text-orange-600',
  revisions:       'bg-red-50 text-red-600',
  delivered:       'bg-green-50 text-green-600',
}

const STAGE_LABELS = {
  briefing:        'Planning',
  pre_production:  'Pre-Production',
  production:      'Shooting',
  post_production: 'Editing',
  review:          'Rev 1 Review',
  revisions:       'Revisions',
  delivered:       'Delivered',
}

function getActionLabel(project, revisions, myId, isCreativeRole) {
  const stage = project.stage
  const amCreative = project.creative_id === myId
  const amEditor   = project.editor_id === myId

  if (amCreative) {
    if (stage === 'production') return 'Upload Footage'
    if (stage === 'post_production') return 'Write Notes'
    // Check if there's a revision pending creative review
    const pending = revisions?.find((r) =>
      r.project_id === project.id && r.status === 'pending_creative_review'
    )
    if (pending) return 'Review Revision'
    return 'View Project'
  }

  if (amEditor) {
    const pending = revisions?.find((r) =>
      r.project_id === project.id && r.status === 'pending_editor'
    )
    if (pending) return 'Upload Revision'
    if (stage === 'post_production') return 'Upload Revision'
    return 'View Project'
  }

  return 'View Project'
}

function RevisionBadge({ revisions, projectId }) {
  const latest = revisions?.filter((r) => r.project_id === projectId)
    .sort((a, b) => b.revision_number - a.revision_number)[0]
  if (!latest) return null
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
      Rev {latest.revision_number} — {latest.status === 'pending_creative_review' ? 'Ready for Review' : latest.status.replace(/_/g, ' ')}
    </span>
  )
}

function ProjectCard({ project, revisions, myId, onClick }) {
  const shootDate = project.shoot_date ? parseISO(project.shoot_date) : null
  const amEditor  = project.editor_id === myId && project.creative_id !== myId
  const actionLabel = getActionLabel(project, revisions, myId, true)

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-border p-5 hover:shadow-md hover:border-border-strong transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{project.name}</p>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {project.clients?.contact_name || project.clients?.name || '—'}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[project.stage] || 'bg-surface-2 text-text-muted'}`}>
          {STAGE_LABELS[project.stage] || project.stage}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {shootDate && !amEditor && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <CalendarDays size={11} /> {format(shootDate, 'MMM d, yyyy')}
          </span>
        )}
        <RevisionBadge revisions={revisions} projectId={project.id} />
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onClick() }}
        className="w-full btn-primary flex items-center justify-center gap-2 text-sm"
      >
        {actionLabel} <ArrowRight size={13} />
      </button>
    </div>
  )
}

export default function CreativeProjectList() {
  const { profile } = useAuth()
  const navigate     = useNavigate()
  const [myId]       = useState(profile?.id)

  const [shoots,    setShoots]    = useState([])
  const [edits,     setEdits]     = useState([])
  const [revisions, setRevisions] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!myId) return
    setLoading(true)
    Promise.all([
      supabase
        .from('projects')
        .select('id, name, stage, shoot_date, creative_id, editor_id, clients(name, contact_name)')
        .eq('creative_id', myId)
        .neq('status', 'archived')
        .order('shoot_date', { ascending: false }),
      supabase
        .from('projects')
        .select('id, name, stage, shoot_date, creative_id, editor_id, clients(name, contact_name)')
        .eq('editor_id', myId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),
      supabase
        .from('project_revisions')
        .select('id, project_id, revision_number, status'),
    ]).then(([shootRes, editRes, revRes]) => {
      setShoots(shootRes.data || [])
      // Exclude projects where user is both creative and editor — only show in shoots
      const shootIds = new Set((shootRes.data || []).map((p) => p.id))
      setEdits((editRes.data || []).filter((p) => !shootIds.has(p.id)))
      setRevisions(revRes.data || [])
      setLoading(false)
    })
  }, [myId])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">My Projects</h1>
        <p className="text-sm text-text-muted mt-1">Your shoots and editing assignments</p>
      </div>

      {/* My Shoots */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Camera size={16} className="text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">My Shoots</h2>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{shoots.length}</span>
        </div>
        {shoots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center">
            <Camera size={32} className="mx-auto text-text-muted/30 mb-3" />
            <p className="text-sm text-text-muted">No shoots assigned to you yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shoots.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                revisions={revisions}
                myId={myId}
                onClick={() => navigate(`/projects/${p.id}/creative`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* My Edits */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Scissors size={16} className="text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">My Edits</h2>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{edits.length}</span>
        </div>
        {edits.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center">
            <Scissors size={32} className="mx-auto text-text-muted/30 mb-3" />
            <p className="text-sm text-text-muted">No editing projects assigned to you yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {edits.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                revisions={revisions}
                myId={myId}
                onClick={() => navigate(`/projects/${p.id}/creative`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
