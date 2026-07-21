import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Camera, Scissors, CalendarDays, MapPin, ArrowRight, Upload, MessageSquare, Check, Send } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import ShootDetailModal from '../../components/shoots/ShootDetailModal'
import { fmtTime } from '../../lib/time'
import StatusBadge, { usePins, PinButton } from '../../components/projects/StatusBadge'
import { computeProjectStatus, latestRevisionFor } from '../../lib/projectStatus'

const STAGE_COLORS = {
  post_production: 'bg-accent/10 text-status-review-text',
  review:          'bg-status-due-soon-bg text-status-due-soon-text',
  revisions:       'bg-status-overdue-bg text-status-overdue-text',
  delivered:       'bg-status-approved-bg text-status-approved-text',
}
const STAGE_LABELS = {
  post_production: 'Editing',
  review:          'In Review',
  revisions:       'In Review',
  delivered:       'Delivered',
}

// ── Shoot Card ────────────────────────────────────────────────────────────────
function ShootCard({ shoot, onOpen, onMarkDone }) {
  return (
    <div className="card border border-border p-5 hover:shadow-md hover:border-border-strong transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 cursor-pointer flex-1" onClick={() => onOpen(shoot)}>
          <p className="text-sm font-semibold text-text-primary truncate">{shoot.title}</p>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {shoot.clients?.contact_name || shoot.clients?.name || 'Not set'}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          shoot.status === 'completed' ? 'bg-status-approved-bg text-status-approved-text' :
          shoot.status === 'cancelled' ? 'bg-status-overdue-bg text-status-overdue-text' :
          'bg-accent/10 text-status-review-text'
        }`}>
          {shoot.status}
        </span>
      </div>

      <div className="space-y-1">
        {shoot.shoot_date && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <CalendarDays size={11} />
            {format(parseISO(shoot.shoot_date), 'EEE, MMM d yyyy')}
            {shoot.shoot_time && ` · ${fmtTime(shoot.shoot_time)}`}
          </div>
        )}
        {shoot.location && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <MapPin size={11} /> {shoot.location}
          </div>
        )}
        {shoot.creative_notes && (
          <p className="text-xs text-text-secondary line-clamp-2">{shoot.creative_notes}</p>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onOpen(shoot)}
          className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
        >
          <Upload size={13} /> Details & Upload
        </button>
        {shoot.status !== 'completed' && (
          <button
            onClick={() => onMarkDone(shoot.id)}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-status-approved-bg text-status-approved-text hover:bg-status-approved-bg transition-colors flex items-center gap-1 shrink-0"
          >
            <Check size={12} /> Mark Done
          </button>
        )}
      </div>
    </div>
  )
}

// ── Edit Card ─────────────────────────────────────────────────────────────────
function EditCard({ project, revisions, myId, onClick, onMarkDone, isPinned, onTogglePin }) {
  const latest = latestRevisionFor(project.id, revisions)
  const status = computeProjectStatus(project, latest)

  const hasPendingUpload = latest?.status === 'pending_editor'
  const stage = project.stage

  return (
    <div className="card border border-border p-5 hover:shadow-md hover:border-border-strong transition-all">
      <div className="flex items-start justify-between gap-2 mb-2 cursor-pointer" onClick={onClick}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">{project.name}</p>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {project.clients?.contact_name || project.clients?.name || 'Not set'}
          </p>
        </div>
        {onTogglePin && <PinButton pinned={isPinned} onToggle={onTogglePin} />}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <StatusBadge status={status} />
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[stage] || 'bg-surface-2 text-text-muted'}`}>
          {STAGE_LABELS[stage] || stage}
        </span>
      </div>

      {latest && (
        <p className="text-xs text-text-muted mb-3 cursor-pointer" onClick={onClick}>
          {latest.revision_number === 1 ? 'Initial Cut' : `Revision ${latest.revision_number}`}
          {' · '}
          <span className={hasPendingUpload ? 'text-status-due-soon-text font-medium' : ''}>
            {hasPendingUpload ? 'Upload requested' : latest.status.replace(/_/g, ' ')}
          </span>
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onClick}
          className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
        >
          {hasPendingUpload ? 'Upload Revision' : 'Open Project'} <ArrowRight size={13} />
        </button>
        {stage === 'ready_to_post' && (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-accent/10 text-status-review-text flex items-center gap-1 shrink-0">
            <Send size={11} strokeWidth={2} /> Awaiting post
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CreativeProjectList() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const myId        = profile?.id
  const isEditor    = profile?.role === 'editor'
  // Detect admin by role (not useAuth().isAdmin, which is false once an admin
  // switches into Creative View) so admins still see every shoot/project here.
  const isAdmin     = profile?.role === 'admin'

  const [shoots,       setShoots]       = useState([])
  const [edits,        setEdits]        = useState([])
  const [revisions,    setRevisions]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [detailShoot, setDetailShoot] = useState(null)  // shoot detail modal
  const { pinned, toggle: togglePin, sortPinned } = usePins(myId)

  useEffect(() => {
    if (!myId) return
    setLoading(true)

    Promise.all([
      // My Shoots. Creatives only, editors skip this
      // Admin in creative-view mode bypasses client_creatives and sees all shoots
      isEditor
        ? Promise.resolve([])
        : isAdmin
          ? supabase
              .from('shoots')
              .select('id, title, creative_notes, shoot_date, shoot_time, location, status, inspiration_links, client_id, clients(name, contact_name)')
              .neq('status', 'cancelled')
              .order('shoot_date', { ascending: true })
              .then(({ data }) => data || [])
          : supabase
              .from('shoots')
              .select('id, title, creative_notes, shoot_date, shoot_time, location, status, inspiration_links, client_id, clients(name, contact_name)')
              .eq('photographer_id', myId)
              .neq('status', 'cancelled')
              .order('shoot_date', { ascending: true })
              .then(({ data }) => data || []),

      // My Edits. Projects scoped to assigned clients (admin sees all)
      isAdmin
        ? supabase
            .from('projects')
            .select('id, name, stage, due_date, editor_id, client_id, clients(name, contact_name)')
            .order('created_at', { ascending: false })
        : supabase
            .from('client_creatives')
            .select('client_id')
            .eq('profile_id', myId)
            .then(async ({ data: ccRows }) => {
              const clientIds = (ccRows || []).map((r) => r.client_id).filter(Boolean)
              if (!clientIds.length) return { data: [] }
              return supabase
                .from('projects')
                .select('id, name, stage, due_date, editor_id, client_id, clients(name, contact_name)')
                .in('client_id', clientIds)
                .order('created_at', { ascending: false })
            }),

      // Revisions for edit status badges
      supabase
        .from('project_revisions')
        .select('id, project_id, revision_number, status'),
    ]).then(([shootData, editRes, revRes]) => {
      setShoots(shootData)
      setEdits(editRes?.data || editRes || [])
      setRevisions(revRes.data || [])
      setLoading(false)
    })
  }, [myId])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  const activeShots    = shoots.filter((s) => s.status !== 'completed')
  const completedShots = shoots.filter((s) => s.status === 'completed')
  const activeEdits    = edits.filter((e) => e.stage !== 'delivered')
  const completedEdits = edits.filter((e) => e.stage === 'delivered')

  // Projects I'm the editor on (my job to edit) vs. other projects for my clients
  const myAssignedEdits = activeEdits.filter((e) => e.editor_id === myId)
  const clientEdits     = activeEdits.filter((e) => e.editor_id !== myId)

  const onMarkShootDone = async (id) => {
    await supabase.from('shoots').update({ status: 'completed' }).eq('id', id)
    setShoots((prev) => prev.map((sh) => sh.id === id ? { ...sh, status: 'completed' } : sh))
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="display">My Work</h1>
        <p className="text-sm text-text-muted mt-1">
          {isEditor ? 'Your editing projects' : 'Your shoots and editing assignments'}
        </p>
      </div>

      {/* My Shoots. Creatives only */}
      {!isEditor && (
        <>
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Camera size={16} className="text-text-muted" />
              <h2 className="text-base font-semibold text-text-primary">My Shoots</h2>
              <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{activeShots.length}</span>
            </div>
            {activeShots.length === 0 ? (
              <div className="card border border-border p-8 text-center">
                <Camera size={32} className="mx-auto text-text-muted/30 mb-3" />
                <p className="text-sm text-text-muted">No shoots scheduled for your clients yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeShots.map((s) => (
                  <ShootCard key={s.id} shoot={s} onOpen={setDetailShoot} onMarkDone={onMarkShootDone} />
                ))}
              </div>
            )}
          </section>

          {detailShoot && (
            <ShootDetailModal
              shoot={detailShoot}
              clientId={detailShoot.client_id}
              clientName={detailShoot.clients?.name || detailShoot.clients?.contact_name || ''}
              onClose={() => setDetailShoot(null)}
              onUpdated={(updated) => setShoots((prev) => prev.map((s) => s.id === updated.id ? { ...s, ...updated } : s))}
            />
          )}
        </>
      )}

      {/* Assigned to Me. Projects where I'm the editor */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Scissors size={16} className="text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">Assigned to Me</h2>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{myAssignedEdits.length}</span>
        </div>
        <p className="text-xs text-text-muted mb-4">Projects you're set as the editor on. Your job to edit.</p>
        {myAssignedEdits.length === 0 ? (
          <div className="card border border-border p-8 text-center">
            <Scissors size={32} className="mx-auto text-text-muted/30 mb-3" />
            <p className="text-sm text-text-muted">No active editing projects assigned to you.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortPinned(myAssignedEdits).map((p) => (
              <EditCard
                key={p.id}
                project={p}
                revisions={revisions}
                myId={myId}
                isPinned={pinned.has(p.id)}
                onTogglePin={() => togglePin(p.id)}
                onClick={() => navigate(`/projects/${p.id}/creative`)}
                onMarkDone={async () => {
                  await supabase.from('projects').update({ stage: 'delivered' }).eq('id', p.id)
                  setEdits((prev) => prev.map((e) => e.id === p.id ? { ...e, stage: 'delivered' } : e))
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* My Clients' Projects. Everything else for my clients (not assigned to me) */}
      {clientEdits.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-1">
            <Scissors size={16} className="text-text-muted/60" />
            <h2 className="text-base font-semibold text-text-primary">My Clients' Projects</h2>
            <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{clientEdits.length}</span>
          </div>
          <p className="text-xs text-text-muted mb-4">Other active projects for your clients. Not assigned to you to edit.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortPinned(clientEdits).map((p) => (
              <EditCard
                key={p.id}
                project={p}
                revisions={revisions}
                myId={myId}
                isPinned={pinned.has(p.id)}
                onTogglePin={() => togglePin(p.id)}
                onClick={() => navigate(`/projects/${p.id}/creative`)}
                onMarkDone={async () => {
                  await supabase.from('projects').update({ stage: 'delivered' }).eq('id', p.id)
                  setEdits((prev) => prev.map((e) => e.id === p.id ? { ...e, stage: 'delivered' } : e))
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Completed section */}
      {(completedShots.length > 0 || completedEdits.length > 0) && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Check size={16} className="text-green-500" />
            <h2 className="text-base font-semibold text-text-primary">Completed</h2>
            <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{completedShots.length + completedEdits.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedShots.map((s) => (
              <ShootCard key={s.id} shoot={s} onOpen={setDetailShoot} onMarkDone={onMarkShootDone} />
            ))}
            {completedEdits.map((p) => (
              <EditCard
                key={p.id}
                project={p}
                revisions={revisions}
                myId={myId}
                onClick={() => navigate(`/projects/${p.id}/creative`)}
                onMarkDone={async () => {}}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
