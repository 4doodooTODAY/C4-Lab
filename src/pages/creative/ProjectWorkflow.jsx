import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Upload, Check, Film, StickyNote, Send,
  Download, FileVideo, CalendarDays, MapPin, Eye,
  ChevronRight, X, MessageSquare, Users, ExternalLink,
  AlertCircle, CheckCircle2, Clock, Zap, Plus, Camera,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { uploadToR2, fmtSpeed, fmtEta, forceDownload } from '../../lib/r2'
import { updateProject } from '../../hooks/useProjects'
import Avatar from '../../components/ui/Avatar'
import { format, parseISO } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────

// "Initial Cut" for the first upload; "Revision N" for subsequent client-driven rounds
function revisionLabel(n) {
  return n === 1 ? 'Initial Cut' : `Revision ${n - 1}`
}

function fmtBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const STAGES = [
  { key: 'pitch',          label: 'Pitch' },
  { key: 'production',     label: 'Shoot' },
  { key: 'post_production', label: 'Editing' },
  { key: 'review',         label: 'Review' },
  { key: 'delivered',      label: 'Delivered' },
]

// Normalize stages to canonical display key
const STAGE_KEY_MAP = {
  pitch:           'pitch',
  briefing:        'production',   // legacy — treat as pre-production
  pre_production:  'production',
  planning:        'production',
  production:      'production',
  post_production: 'post_production',
  review:          'review',
  revisions:       'review',
  ready_to_post:   'delivered',
  delivered:       'delivered',
}

const STAGE_DESCRIPTIONS = {
  pitch:           'Waiting for client approval before work begins.',
  production:      'Shoot scheduled. Upload footage after the shoot.',
  post_production: 'Footage is ready — time to edit.',
  review:          'Revision is under review.',
  delivered:       'Project complete!',
}

const REVISION_STATUS_LABELS = {
  pending_photographer_review: 'Needs Your Review',
  pending_admin_review:        'Pending Admin Approval',
  pending_creative_review:     'Needs Your Review',    // legacy
  pending_client_review:       'Client Reviewing',
  pending_editor:              'Awaiting Revisions',
  approved:                    'Approved',
}

const REVISION_STATUS_COLORS = {
  pending_photographer_review: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_admin_review:        'bg-orange-50 text-orange-700 border-orange-200',
  pending_creative_review:     'bg-amber-50 text-amber-700 border-amber-200',
  pending_client_review:       'bg-blue-50 text-blue-700 border-blue-200',
  pending_editor:              'bg-purple-50 text-purple-700 border-purple-200',
  approved:                    'bg-green-50 text-green-700 border-green-200',
}

// ── Stage Pipeline Bar ────────────────────────────────────────────────────────

function StagePipeline({ currentStage }) {
  const normalised = STAGE_KEY_MAP[currentStage] || currentStage
  const currentIdx = STAGES.findIndex((s) => s.key === normalised)

  return (
    <div className="bg-white rounded-2xl border border-border p-5 mb-4">
      {/* Pipeline bar */}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, idx) => {
          const isPast    = idx < currentIdx
          const isCurrent = idx === currentIdx
          const isLast    = idx === STAGES.length - 1

          return (
            <div key={stage.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                    isCurrent
                      ? 'bg-accent text-white ring-4 ring-accent/20'
                      : isPast
                      ? 'bg-green-500 text-white'
                      : 'bg-surface-2 text-text-muted'
                  }`}
                >
                  {isPast ? <Check size={12} /> : idx + 1}
                </div>
                <p className={`text-[10px] mt-1.5 font-medium text-center leading-tight truncate w-full px-0.5 ${
                  isCurrent ? 'text-accent' : isPast ? 'text-green-600' : 'text-text-muted'
                }`}>
                  {stage.label}
                </p>
              </div>
              {!isLast && (
                <div className={`h-0.5 flex-1 mx-1 mb-5 rounded-full ${idx < currentIdx ? 'bg-green-400' : 'bg-border'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Status line */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-sm font-bold text-text-primary">
          Currently: {STAGES.find((s) => s.key === normalised)?.label || currentStage}
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          {STAGE_DESCRIPTIONS[normalised] || ''}
        </p>
      </div>
    </div>
  )
}

// ── Who's Up ──────────────────────────────────────────────────────────────────
function WhosUpBar({ stage, editorProfile, creativeProfile }) {
  const normalised = STAGE_KEY_MAP[stage] || stage

  const config = {
    briefing:        { who: 'Admin',  msg: 'Planning — waiting for admin to begin the project.',   color: 'bg-blue-50 border-blue-200 text-blue-900',   badge: 'bg-blue-100 text-blue-700' },
    post_production: { who: editorProfile?.full_name || 'Editor', msg: 'Working on the edit.',     color: 'bg-purple-50 border-purple-200 text-purple-900', badge: 'bg-purple-100 text-purple-700' },
    review:          { who: 'Client', msg: 'Reviewing the latest cut.',                             color: 'bg-amber-50 border-amber-200 text-amber-900',  badge: 'bg-amber-100 text-amber-700' },
    ready_to_post:   { who: 'Admin',  msg: 'Client approved — admin needs to post and close out.', color: 'bg-green-50 border-green-200 text-green-900',  badge: 'bg-green-100 text-green-700' },
    delivered:       null,
  }

  const c = config[normalised]
  if (!c) return null

  return (
    <div className={`rounded-2xl border px-4 py-3 mb-4 flex items-center gap-3 ${c.color}`}>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.badge}`}>UP NEXT</span>
      <span className="text-sm font-semibold">{c.who}</span>
      <span className="text-xs opacity-60">—</span>
      <span className="text-xs opacity-75">{c.msg}</span>
    </div>
  )
}

// ── Action Banner ─────────────────────────────────────────────────────────────

function ActionBanner({ project, uploads, revisions, isCreative, isEditor, navigate }) {
  const stage           = STAGE_KEY_MAP[project.stage] || project.stage
  const latestRev       = [...revisions].sort((a, b) => b.revision_number - a.revision_number)[0]
  const hasUploads      = uploads.length > 0

  // Pitch: both creative and editor see a "pending approval" banner
  if (project.stage === 'pitch') {
    return (
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
          <Eye size={18} className="text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-800">Waiting for client approval</p>
          <p className="text-xs text-amber-600 mt-0.5">This project pitch has been submitted. The client or admin needs to approve it before work begins.</p>
        </div>
      </div>
    )
  }

  // Photographer (creative): needs to review a revision
  const pendingPhotographerReview = revisions.find(
    (r) => r.status === 'pending_photographer_review' || r.status === 'pending_creative_review'
  )

  let banner = null

  if (isCreative && !isEditor) {
    if (pendingPhotographerReview) {
      banner = {
        variant: 'accent',
        icon: <FileVideo size={18} />,
        title: `${revisionLabel(pendingPhotographerReview.revision_number)} needs your review`,
        body: 'Leave timeline notes for the client before sending it over.',
        action: {
          label: 'Review Now →',
          onClick: () => navigate(project.media_type === 'photo' ? `/projects/${project.id}/photo-revision/${pendingPhotographerReview.id}` : `/projects/${project.id}/revision/${pendingPhotographerReview.id}`),
        },
      }
    } else if (stage === 'production') {
      banner = {
        variant: 'amber',
        icon: <Upload size={18} />,
        title: 'Upload your shoot footage',
        body: 'Upload all files from the shoot, write your notes, then submit to the editor.',
      }
    } else {
      banner = {
        variant: 'green',
        icon: <CheckCircle2 size={18} />,
        title: "You're all caught up",
        body: 'Nothing needs your attention right now.',
      }
    }
  } else if (isEditor) {
    if (stage === 'post_production' && hasUploads && revisions.length === 0) {
      banner = {
        variant: 'accent',
        icon: <Upload size={18} />,
        title: 'Footage is ready — start editing',
        body: 'Upload your initial cut when done. It will go to the photographer for review first.',
      }
    } else if (latestRev?.status === 'pending_editor') {
      banner = {
        variant: 'red',
        icon: <AlertCircle size={18} />,
        title: `Client feedback received on ${revisionLabel(latestRev.revision_number)}`,
        body: "Address the accepted comments and upload a revised cut.",
        action: {
          label: 'View Feedback →',
          onClick: () => navigate(project.media_type === 'photo' ? `/projects/${project.id}/photo-revision/${latestRev.id}` : `/projects/${project.id}/revision/${latestRev.id}`),
        },
      }
    } else if (latestRev?.status === 'pending_client_review' && stage === 'post_production') {
      banner = {
        variant: 'red',
        icon: <AlertCircle size={18} />,
        title: 'Client returned your cut for edits',
        body: 'Check the comments and upload a revised cut.',
        action: {
          label: 'View Comments →',
          onClick: () => navigate(project.media_type === 'photo' ? `/projects/${project.id}/photo-revision/${latestRev.id}` : `/projects/${project.id}/revision/${latestRev.id}`),
        },
      }
    } else {
      banner = {
        variant: 'green',
        icon: <CheckCircle2 size={18} />,
        title: "You're all caught up",
        body: 'Nothing needs your attention right now.',
      }
    }
  }

  if (!banner) return null

  const variantClasses = {
    amber:  'border-amber-400 bg-amber-50',
    red:    'border-red-400 bg-red-50',
    blue:   'border-blue-400 bg-blue-50',
    accent: 'border-accent bg-accent/5',
    green:  'border-green-400 bg-green-50',
  }
  const iconClasses = {
    amber:  'text-amber-600',
    red:    'text-red-600',
    blue:   'text-blue-600',
    accent: 'text-accent',
    green:  'text-green-600',
  }
  const titleClasses = {
    amber:  'text-amber-900',
    red:    'text-red-900',
    blue:   'text-blue-900',
    accent: 'text-text-primary',
    green:  'text-green-900',
  }
  const bodyClasses = {
    amber:  'text-amber-700',
    red:    'text-red-700',
    blue:   'text-blue-700',
    accent: 'text-text-muted',
    green:  'text-green-700',
  }

  return (
    <div className={`border-l-4 rounded-xl p-4 flex items-start gap-3 mb-6 ${variantClasses[banner.variant]}`}>
      <span className={`mt-0.5 shrink-0 ${iconClasses[banner.variant]}`}>{banner.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${titleClasses[banner.variant]}`}>{banner.title}</p>
        <p className={`text-xs mt-0.5 ${bodyClasses[banner.variant]}`}>{banner.body}</p>
      </div>
      {banner.action && (
        <button
          onClick={banner.action.onClick}
          className="btn-primary shrink-0 text-xs"
        >
          {banner.action.label}
        </button>
      )}
    </div>
  )
}

// ── File drop zone ────────────────────────────────────────────────────────────

function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
        dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-surface-2'
      }`}
    >
      <Upload size={24} className="mx-auto text-text-muted mb-2" />
      <p className="text-sm font-medium text-text-primary">Drop footage files here</p>
      <p className="text-xs text-text-muted mt-1">or click to browse</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)) }}
      />
    </div>
  )
}

// ── Revision Comments List (for editor) ───────────────────────────────────────

function RevisionCommentsList({ revisionId }) {
  const [comments, setComments] = useState([])

  useEffect(() => {
    supabase
      .from('revision_comments')
      .select('*, profiles(full_name)')
      .eq('revision_id', revisionId)
      .eq('status', 'accepted')
      .order('timestamp_seconds')
      .then(({ data }) => setComments(data || []))
  }, [revisionId])

  if (comments.length === 0) return null

  const fmtTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
      <p className="text-xs font-semibold text-amber-800 mb-3">
        Accepted comments to address ({comments.length})
      </p>
      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
              {fmtTime(c.timestamp_seconds)}
            </span>
            <p className="text-xs text-amber-900">{c.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Project Overview Card ─────────────────────────────────────────────────────

function ProjectOverviewCard({
  project, projectShoots, creativeProfile, editorProfile,
  // optional shoot management (passed when the viewer is a creative/admin)
  canManageShoots,
  showAddShoot, setShowAddShoot,
  newShootDate, setNewShootDate,
  newShootTime, setNewShootTime,
  newShootLocation, setNewShootLocation,
  addingShoot, onAddShoot, onDeleteShoot,
}) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Project Overview</h2>

      <div className="space-y-4">
        {/* Client */}
        {project.clients && (
          <div>
            <p className="text-xs text-text-muted mb-1">Client</p>
            <p className="text-sm font-semibold text-text-primary">
              {project.clients.name}
            </p>
            {project.clients.contact_name && project.clients.contact_name !== project.clients.name && (
              <p className="text-xs text-text-muted">{project.clients.contact_name}</p>
            )}
          </div>
        )}

        {/* Shoot dates from project_shoots */}
        {(projectShoots.length > 0 || canManageShoots) && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-text-muted flex items-center gap-1">
                <CalendarDays size={11} /> Shoot Date{projectShoots.length !== 1 ? 's' : ''}
              </p>
              {canManageShoots && !showAddShoot && (
                <button
                  onClick={() => setShowAddShoot(true)}
                  className="text-[11px] text-accent hover:underline flex items-center gap-0.5"
                >
                  <Plus size={10} /> Add
                </button>
              )}
            </div>

            <div className="space-y-1">
              {projectShoots.map((shoot) => (
                <div key={shoot.id} className="flex items-center justify-between gap-2 group">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary">
                      {shoot.shoot_date ? format(parseISO(shoot.shoot_date), 'MMMM d, yyyy') : '—'}
                    </p>
                    {shoot.shoot_time && (
                      <p className="text-xs text-text-muted">at {shoot.shoot_time.slice(0, 5)}</p>
                    )}
                    {shoot.location && (
                      <p className="text-xs text-text-muted flex items-center gap-0.5">
                        <MapPin size={10} /> {shoot.location}
                      </p>
                    )}
                    {shoot.status && shoot.status !== 'scheduled' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        shoot.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                      }`}>{shoot.status}</span>
                    )}
                  </div>
                  {canManageShoots && (
                    <button
                      onClick={() => onDeleteShoot(shoot.id)}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500 transition-opacity"
                      title="Remove shoot"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Inline add shoot form */}
            {canManageShoots && showAddShoot && (
              <div className="mt-3 bg-surface-2 rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-text-muted mb-1 block">Date *</label>
                    <input
                      type="date"
                      value={newShootDate}
                      onChange={(e) => setNewShootDate(e.target.value)}
                      className="input text-xs w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted mb-1 block">Time</label>
                    <input
                      type="time"
                      value={newShootTime}
                      onChange={(e) => setNewShootTime(e.target.value)}
                      className="input text-xs w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-text-muted mb-1 block">Location</label>
                  <input
                    type="text"
                    value={newShootLocation}
                    onChange={(e) => setNewShootLocation(e.target.value)}
                    placeholder="Optional"
                    className="input text-xs w-full"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onAddShoot}
                    disabled={!newShootDate || addingShoot}
                    className="btn-primary text-xs flex-1 flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {addingShoot ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Save Shoot
                  </button>
                  <button
                    onClick={() => { setShowAddShoot(false); setNewShootDate(''); setNewShootTime(''); setNewShootLocation('') }}
                    className="btn-secondary text-xs px-3"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Location (project-level fallback) */}
        {projectShoots.length === 0 && !canManageShoots && project.location && (
          <div>
            <p className="text-xs text-text-muted flex items-center gap-1 mb-1">
              <MapPin size={11} /> Location
            </p>
            <p className="text-sm font-semibold text-text-primary">{project.location}</p>
          </div>
        )}

        {/* Admin brief */}
        {project.notes && (
          <div>
            <p className="text-xs text-text-muted mb-1">Brief from Admin</p>
            <p className="text-sm text-text-primary bg-surface-2 rounded-xl p-3 whitespace-pre-wrap leading-relaxed">
              {project.notes}
            </p>
          </div>
        )}

        {/* Team */}
        {(creativeProfile || editorProfile) && (
          <div>
            <p className="text-xs text-text-muted mb-2 flex items-center gap-1">
              <Users size={11} /> Team
            </p>
            <div className="flex gap-4">
              {creativeProfile && (
                <div className="flex items-center gap-2">
                  <Avatar profile={creativeProfile} size={28} />
                  <div>
                    <p className="text-xs font-semibold text-text-primary leading-tight">
                      {creativeProfile.full_name}
                    </p>
                    <p className="text-[10px] text-text-muted">Shooter</p>
                  </div>
                </div>
              )}
              {editorProfile && (
                <div className="flex items-center gap-2">
                  <Avatar profile={editorProfile} size={28} />
                  <div>
                    <p className="text-xs font-semibold text-text-primary leading-tight">
                      {editorProfile.full_name}
                    </p>
                    <p className="text-[10px] text-text-muted">Editor</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shoot Delivery Section (Creative only — footage + notes in one flow) ──────

function ShootDeliverySection({ project, uploads, shootNotes, onRefresh }) {
  const { profile } = useAuth()

  // Upload state
  const [open,           setOpen]         = useState(false)
  const [showFiles,      setShowFiles]    = useState(false)
  const [files,          setFiles]        = useState([])
  const [uploading,      setUploading]    = useState(false)
  const [uploadProgress, setProgress]     = useState({})
  const [uploadStats,    setUploadStats]  = useState(null)
  const [uploadError,    setUploadError]  = useState('')

  // Note state
  const [noteContent, setNoteContent] = useState('')
  const [savingNote,  setSavingNote]  = useState(false)
  const [noteSaved,   setNoteSaved]   = useState(false)

  // Send to editor state
  const [sending,   setSending]   = useState(false)
  const [sendError, setSendError] = useState('')

  const stage      = STAGE_KEY_MAP[project.stage] || project.stage
  const hasUploads = uploads.length > 0
  const totalSize  = uploads.reduce((acc, f) => acc + (f.file_size || 0), 0)
  const alreadySent = stage !== 'production'  // once moved past production, footage is sent

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    const progressMap = {}
    files.forEach((f) => { progressMap[f.name] = 0 })
    setProgress({ ...progressMap })

    try {
      // Upload all files in parallel for maximum speed
      await Promise.all(files.map(async (file) => {
        const { publicUrl } = await uploadToR2({
          file,
          category:    'footage',
          clientName:  project.clients?.name || '',
          projectName: project.name,
          folderType:  'shoots',
          shootDate:   project.shoot_date || null,
          onProgress: (pct) => setProgress((p) => ({ ...p, [file.name]: pct })),
          onStats:    (s)   => setUploadStats(s),
        })
        // Run in Supabase SQL Editor if creative uploads fail:
        // create policy "creatives can insert shoot_uploads" on shoot_uploads
        //   for insert to authenticated
        //   with check (
        //     exists(select 1 from profiles where id = auth.uid() and role in ('admin','creative'))
        //   );
        await supabase.from('shoot_uploads').insert({
          project_id:  project.id,
          file_url:    publicUrl,
          file_name:   file.name,
          file_size:   file.size,
          uploaded_by: profile.id,
        })
        setProgress((p) => ({ ...p, [file.name]: 100 }))
      }))
      setFiles([])
      setUploadStats(null)
      onRefresh()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSaveNote = async () => {
    if (!noteContent.trim()) return
    setSavingNote(true)
    try {
      await supabase.from('shoot_notes').insert({
        project_id: project.id,
        author_id:  profile.id,
        content:    noteContent.trim(),
      })
      setNoteContent('')
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2500)
      onRefresh()
    } catch {}
    finally { setSavingNote(false) }
  }

  const handleSendToEditor = async () => {
    setSending(true)
    setSendError('')
    try {
      await updateProject(project.id, { stage: 'post_production' })

      // Notify the editor that footage is ready
      if (project.editor_id) {
        const { notify: notifyFn } = await import('../../lib/notify')
        await notifyFn({
          profileId: project.editor_id,
          actorId:   profile.id,
          type:      'footage_uploaded',
          title:     `Footage ready for "${project.name}"`,
          body:      `${uploads.length} file${uploads.length !== 1 ? 's' : ''} uploaded. Start editing when ready.`,
          link:      `/projects/${project.id}`,
        })
      }

      // Notify admins too
      const { notifyAdmins: notifyAdminsFn } = await import('../../lib/notify')
      await notifyAdminsFn({
        actorId: profile.id,
        type:    'footage_uploaded',
        title:   `Footage submitted for "${project.name}"`,
        body:    `${profile.full_name} uploaded shoot footage. Editor has been notified.`,
        link:    `/projects/${project.id}`,
      })

      onRefresh()
    } catch (err) {
      setSendError(err.message || 'Failed to send — check permissions.')
    } finally {
      setSending(false)
    }
  }

  // ── Gate: not started yet ──────────────────────────────────────────────────
  if (!hasUploads && !open) {
    return (
      <div className="bg-white rounded-2xl border border-border p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <Upload size={22} className="text-accent" />
        </div>
        <h2 className="text-sm font-bold text-text-primary mb-1">Ready to deliver footage?</h2>
        <p className="text-xs text-text-muted mb-4">
          Upload your files, add notes for the editor, then send it over.
        </p>
        <button onClick={() => setOpen(true)} className="btn-primary">
          Begin Upload Process
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-5">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        <Upload size={14} className="text-text-muted" /> Shoot Delivery
      </h2>

      {/* ── Uploaded files summary ─────────────────────────────────────────── */}
      {hasUploads && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-green-600" />
              <span className="text-sm font-semibold text-green-800">
                {uploads.length} file{uploads.length !== 1 ? 's' : ''} uploaded
              </span>
              <span className="text-xs text-green-600">· {fmtBytes(totalSize)}</span>
            </div>
            <button
              onClick={() => setShowFiles((v) => !v)}
              className="text-xs text-green-700 hover:text-green-900 font-medium transition-colors"
            >
              {showFiles ? 'Hide' : 'Show files'}
            </button>
          </div>
          {showFiles && (
            <div className="mt-3 space-y-1.5 border-t border-green-200 pt-3">
              {uploads.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Film size={12} className="text-green-600 shrink-0" />
                  <span className="text-xs text-green-900 truncate flex-1">{f.file_name}</span>
                  <span className="text-xs text-green-600">{fmtBytes(f.file_size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upload zone (visible while open or no uploads yet) ─────────────── */}
      {!alreadySent && (
        <div>
          {files.length > 0 ? (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-3 py-2 border border-border rounded-xl px-3">
                  <Film size={14} className="text-text-muted shrink-0" />
                  <span className="text-sm text-text-primary truncate flex-1">{f.name}</span>
                  <span className="text-xs text-text-muted">{fmtBytes(f.size)}</span>
                  {uploadProgress[f.name] === 100 ? (
                    <Check size={13} className="text-green-500" />
                  ) : uploading ? (
                    <Loader2 size={13} className="animate-spin text-text-muted" />
                  ) : (
                    <button onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}>
                      <X size={13} className="text-text-muted hover:text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <DropZone onFiles={(f) => setFiles((prev) => [...prev, ...f])} />
          )}

          {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}

          {uploading && uploadStats && (
            <div className="mt-3 flex items-center gap-3 text-xs text-text-muted">
              <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                {(() => {
                  const cur = files.find((f) => (uploadProgress[f.name] || 0) < 100 && (uploadProgress[f.name] || 0) > 0) || files[0]
                  const pct = cur ? (uploadProgress[cur.name] || 0) : 0
                  return <div className="h-full bg-accent rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
                })()}
              </div>
              <span className="shrink-0 font-medium text-text-secondary">{fmtSpeed(uploadStats.speed)}</span>
              {uploadStats.eta != null && <span className="shrink-0">{fmtEta(uploadStats.eta)}</span>}
            </div>
          )}

          {files.length > 0 && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="btn-primary mt-3 flex items-center gap-2 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Uploading…' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      {(hasUploads || open) && (
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1">
            <StickyNote size={12} /> Notes for editor
          </p>

          {shootNotes.length > 0 && (
            <div className="space-y-2 mb-3">
              {shootNotes.map((n) => (
                <div key={n.id} className="bg-surface-2 rounded-xl p-3">
                  <p className="text-xs text-text-muted mb-1">{format(new Date(n.created_at), 'MMM d, h:mm a')}</p>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
          )}

          {!alreadySent && (
            <div className="flex gap-2">
              <textarea
                className="input flex-1 min-h-[80px] resize-none text-sm"
                placeholder="Key moments, what to cut, style notes, timestamps…"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
              />
              <button
                onClick={handleSaveNote}
                disabled={savingNote || !noteContent.trim()}
                className="btn-primary shrink-0 self-end disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingNote ? <Loader2 size={14} className="animate-spin" /> : noteSaved ? <Check size={14} /> : <Send size={14} />}
                {!savingNote && !noteSaved && 'Send'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Send to Editor CTA ─────────────────────────────────────────────── */}
      {hasUploads && stage === 'production' && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={handleSendToEditor}
            disabled={sending}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {sending ? 'Sending…' : 'Send to Editor →'}
          </button>
          {sendError && (
            <p className="text-xs text-red-500 text-center mt-2">{sendError}</p>
          )}
          <p className="text-xs text-text-muted text-center mt-2">
            This will notify the editor that footage is ready.
          </p>
        </div>
      )}

      {alreadySent && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2">
          <CheckCircle2 size={13} />
          Footage delivered to editor.
        </div>
      )}
    </div>
  )
}

// ── Source Footage Section (Editor only) ──────────────────────────────────────

function FileList({ files, accent = false }) {
  return (
    <div className={`mt-2 rounded-xl divide-y ${accent ? 'border border-blue-100 divide-blue-50' : 'border border-border divide-border'}`}>
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
          <Film size={13} className={accent ? 'text-blue-300 shrink-0' : 'text-text-muted shrink-0'} />
          <span className={`text-sm truncate flex-1 ${accent ? 'text-blue-900' : 'text-text-primary'}`}>{f.file_name}</span>
          <span className={`text-xs ${accent ? 'text-blue-400' : 'text-text-muted'}`}>{fmtBytes(f.file_size)}{f.created_at && ` · ${new Date(f.created_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} EST`}</span>
          {f.file_url && (
            <button onClick={() => forceDownload(f.file_url, f.file_name)}
              className={`transition-colors shrink-0 ${accent ? 'text-blue-500 hover:text-blue-700' : 'text-accent hover:text-accent/80'}`}>
              <Download size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

async function downloadFiles(files, setDownloading) {
  setDownloading(true)
  for (const f of files) {
    if (f.file_url) {
      await forceDownload(f.file_url, f.file_name)
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  setDownloading(false)
}

function SourceFootageSection({ uploads, shootNotes }) {
  const [showTeam,         setShowTeam]         = useState(false)
  const [showClient,       setShowClient]        = useState(false)
  const [dlTeam,           setDlTeam]           = useState(false)
  const [dlClient,         setDlClient]         = useState(false)

  const teamUploads   = uploads.filter((f) => f.profiles?.role !== 'client')
  const clientUploads = uploads.filter((f) => f.profiles?.role === 'client')

  const teamSize   = teamUploads.reduce((acc, f) => acc + (f.file_size || 0), 0)
  const clientSize = clientUploads.reduce((acc, f) => acc + (f.file_size || 0), 0)

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-5">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        <Film size={14} className="text-text-muted" /> Source Footage
      </h2>

      {/* ── Client Assets ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Client Assets</span>
          {clientUploads.length > 0 && (
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {clientUploads.length}
            </span>
          )}
        </div>

        {clientUploads.length === 0 ? (
          <p className="text-xs text-text-muted italic">No files uploaded by the client yet.</p>
        ) : (
          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1">
                <p className="text-sm font-bold text-blue-900">
                  {clientUploads.length} file{clientUploads.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-blue-500">{fmtBytes(clientSize)} total</p>
              </div>
              <button onClick={() => setShowClient((v) => !v)} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                {showClient ? 'Hide' : 'Show files'}
              </button>
              <button
                onClick={() => downloadFiles(clientUploads, setDlClient)}
                disabled={dlClient}
                className="text-xs flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-colors"
              >
                {dlClient ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                {dlClient ? 'Downloading…' : 'Download All'}
              </button>
            </div>
            {showClient && <FileList files={clientUploads} accent />}
          </div>
        )}
      </div>

      {/* ── Shoot Footage (from creative) ──────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Shoot Footage</span>
          {teamUploads.length > 0 && (
            <span className="text-[10px] font-bold bg-surface-2 text-text-muted px-1.5 py-0.5 rounded-full">
              {teamUploads.length}
            </span>
          )}
        </div>

        {teamUploads.length === 0 ? (
          <p className="text-xs text-text-muted italic">Waiting on the shooter to upload footage.</p>
        ) : (
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1">
                <p className="text-sm font-bold text-text-primary">
                  {teamUploads.length} file{teamUploads.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-text-muted">{fmtBytes(teamSize)} total</p>
              </div>
              <button onClick={() => setShowTeam((v) => !v)} className="btn-secondary text-xs">
                {showTeam ? 'Hide' : 'Show files'}
              </button>
              <button
                onClick={() => downloadFiles(teamUploads, setDlTeam)}
                disabled={dlTeam}
                className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {dlTeam ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {dlTeam ? 'Downloading…' : 'Download All'}
              </button>
            </div>
            {showTeam && <FileList files={teamUploads} />}
          </div>
        )}
      </div>

      {/* ── Shooter notes ─────────────────────────────────────────────────── */}
      {shootNotes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1">
            <StickyNote size={12} /> Notes from Shooter
          </p>
          <div className="space-y-2">
            {shootNotes.map((n) => (
              <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs text-text-muted mb-1">{format(new Date(n.created_at), 'MMM d, h:mm a')}</p>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{n.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Footage Uploads Section (admin + creative — upload any files to the project) ─

function ProjectMediaSection({ project, uploads, onRefresh }) {
  const { profile } = useAuth()
  const fileInputRef = useRef()

  const [files,       setFiles]       = useState([])
  const [uploading,   setUploading]   = useState(false)
  const [uploadStats, setUploadStats] = useState(null)
  const [progress,    setProgress]    = useState({})
  const [error,       setError]       = useState('')
  const [showAll,     setShowAll]     = useState(false)
  const [dragging,    setDragging]    = useState(false)

  const addFiles = (incoming) => setFiles((prev) => [...prev, ...Array.from(incoming)])

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    setError('')
    const prog = {}
    files.forEach((f) => { prog[f.name] = 0 })
    setProgress({ ...prog })

    try {
      for (const file of files) {
        const { publicUrl } = await uploadToR2({
          file,
          category:    'footage',
          clientName:  project.clients?.name || '',
          projectName: project.name,
          folderType:  'projects',
          onProgress:  (p) => setProgress((prev) => ({ ...prev, [file.name]: p })),
          onStats:     (s) => setUploadStats(s),
        })
        const { error: dbErr } = await supabase.from('shoot_uploads').insert({
          project_id:  project.id,
          file_name:   file.name,
          file_url:    publicUrl,
          file_size:   file.size,
          uploaded_by: profile.id,
        })
        if (dbErr) throw new Error(dbErr.message)
        setProgress((prev) => ({ ...prev, [file.name]: 100 }))
      }
      setFiles([])
      setUploadStats(null)
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const totalSize = uploads.reduce((acc, f) => acc + (f.file_size || 0), 0)
  const visible   = showAll ? uploads : uploads.slice(0, 3)

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Upload size={14} className="text-text-muted" /> Footage Uploads
        </h2>
        <span className="text-xs text-text-muted">{uploads.length} file{uploads.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Drop zone — always visible */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
          uploading
            ? 'opacity-50 cursor-not-allowed border-border'
            : dragging
            ? 'border-accent bg-accent/5 cursor-copy'
            : 'border-border hover:border-accent/50 hover:bg-surface-2/50 cursor-pointer'
        }`}
      >
        <Upload size={20} className="mx-auto text-text-muted mb-1.5" />
        <p className="text-sm font-medium text-text-primary">
          Drop files here or <span className="text-accent">click to browse</span>
        </p>
        <p className="text-xs text-text-muted mt-0.5">Videos, photos, and more from your computer or camera roll</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,image/*,.mov,.mp4,.avi,.mkv,.raw,.cr2,.arw,.zip"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* Staged files + upload button */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-surface-2/60 rounded-lg px-3 py-2">
              <Film size={12} className="text-text-muted shrink-0" />
              <span className="flex-1 truncate text-text-primary">{f.name}</span>
              <span className="text-text-muted shrink-0">{fmtBytes(f.size)}</span>
              {progress[f.name] > 0 && progress[f.name] < 100 && (
                <span className="text-accent font-medium shrink-0">{progress[f.name]}%</span>
              )}
              {progress[f.name] === 100 && <Check size={12} className="text-green-500 shrink-0" />}
              {!uploading && (
                <button onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, j) => j !== i)) }}>
                  <X size={12} className="text-text-muted hover:text-red-500" />
                </button>
              )}
            </div>
          ))}

          {uploading && uploadStats && (
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-200"
                  style={{ width: `${Math.min(...files.map((f) => progress[f.name] || 0))}%` }} />
              </div>
              <span className="shrink-0 font-medium">{fmtSpeed(uploadStats.speed)}</span>
              {uploadStats.eta != null && <span className="shrink-0">{fmtEta(uploadStats.eta)}</span>}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
              : <><Upload size={14} /> Upload {files.length} file{files.length !== 1 ? 's' : ''}</>
            }
          </button>
        </div>
      )}

      {/* Existing uploads */}
      {uploads.length === 0 && files.length === 0 && (
        <p className="text-xs text-text-muted italic">No footage uploaded yet.</p>
      )}
      {uploads.length > 0 && (
        <div>
          {uploads.length > 3 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-accent hover:text-accent/80 font-medium transition-colors mb-2"
            >
              {showAll ? 'Show less' : `Show all ${uploads.length} files`}
            </button>
          )}
          <div className="rounded-xl border border-border divide-y divide-border">
            {visible.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <Film size={13} className="text-text-muted shrink-0" />
                <span className="text-sm truncate flex-1 text-text-primary">{f.file_name}</span>
                <span className="text-xs text-text-muted shrink-0">{fmtBytes(f.file_size)}</span>
                {f.file_url && (
                  <button
                    onClick={() => forceDownload(f.file_url, f.file_name)}
                    className="text-text-muted hover:text-accent transition-colors shrink-0"
                    title="Download"
                  >
                    <Download size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Admin Review Section ──────────────────────────────────────────────────────

function AdminReviewSection({ revision, project, onRefresh }) {
  const { profile } = useAuth()
  const [feedback,    setFeedback]   = useState('')
  const [showReject,  setShowReject]  = useState(false)
  const [loading,     setLoading]    = useState(false)
  const [error,       setError]      = useState('')

  const handleApprove = async () => {
    setLoading(true)
    setError('')
    try {
      const { error: e } = await supabase.from('project_revisions')
        .update({ status: 'pending_client_review', admin_reviewed: true })
        .eq('id', revision.id)
      if (e) throw new Error(e.message)
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!feedback.trim()) return
    setLoading(true)
    setError('')
    try {
      // Save feedback as a revision comment so the editor sees it
      const { error: ce } = await supabase.from('revision_comments').insert({
        revision_id:       revision.id,
        author_id:         profile.id,
        content:           feedback.trim(),
        timestamp_seconds: 0,
      })
      if (ce) throw new Error(ce.message)

      const { error: re } = await supabase.from('project_revisions')
        .update({ status: 'pending_editor', admin_reviewed: true })
        .eq('id', revision.id)
      if (re) throw new Error(re.message)

      setFeedback('')
      setShowReject(false)
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-orange-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
          <Eye size={16} className="text-orange-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Admin Review — First Edit</h2>
          <p className="text-xs text-text-muted">Review before it reaches the client</p>
        </div>
      </div>

      {/* Video */}
      <div className="rounded-xl overflow-hidden bg-black aspect-video">
        <video
          src={revision.video_url}
          controls
          className="w-full h-full"
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {/* Reject panel */}
      {showReject && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary">Feedback for the editor</p>
          <textarea
            className="input w-full resize-none text-sm"
            rows={3}
            placeholder="Describe what needs to be changed before this goes to the client…"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {showReject ? (
          <>
            <button
              onClick={() => { setShowReject(false); setFeedback('') }}
              className="btn-secondary flex-1 text-sm"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={!feedback.trim() || loading}
              className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              Send Back to Editor
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setShowReject(true)}
              className="btn-secondary flex-1 text-sm text-red-600 hover:text-red-700"
              disabled={loading}
            >
              Request Changes
            </button>
            <button
              onClick={handleApprove}
              disabled={loading}
              className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Approve — Send to Client
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Upload Revision Section (Editor only) ─────────────────────────────────────

// ── Photo revision upload (for photo projects) ────────────────────────────────

function UploadPhotoRevisionSection({ project, revisions, onRefresh }) {
  const { profile } = useAuth()
  const fileInputRef = useRef()

  const [open,      setOpen]     = useState(false)
  const [photos,    setPhotos]   = useState([])  // File[]
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [editorNote, setEditorNote] = useState('')

  const stage     = STAGE_KEY_MAP[project.stage] || project.stage
  const latestRev = [...revisions].sort((a, b) => b.revision_number - a.revision_number)[0]
  const nextRevNum = latestRev ? latestRev.revision_number + 1 : 1
  const canUpload = stage === 'post_production' || (latestRev && latestRev.status === 'pending_editor')
  const pendingAdminRev = revisions.find((r) => r.status === 'pending_admin_review')
  if (!canUpload || pendingAdminRev) return null

  const handleUpload = async () => {
    if (photos.length === 0) return
    setUploading(true)
    setUploadError('')
    try {
      // Upload each photo to R2 and collect URLs
      const photoUrls = []
      for (const file of photos) {
        const { publicUrl } = await uploadToR2({
          file,
          category:    'revisions',
          clientName:  project.clients?.name || '',
          projectName: project.name,
          folderType:  'shoots',
          shootDate:   project.shoot_date || null,
        })
        photoUrls.push(publicUrl)
      }

      const { error: e } = await supabase.from('project_revisions').insert({
        project_id:      project.id,
        revision_number: nextRevNum,
        photo_urls:      photoUrls,
        status:          'pending_client_review',
        uploaded_by:     profile.id,
        media_type:      'photo',
      })
      if (e) throw new Error(e.message)

      await updateProject(project.id, { stage: 'review', revision_count: nextRevNum })

      const { notifyAdmins: notifyAdminsFn } = await import('../../lib/notify')
      await notifyAdminsFn({
        actorId: profile.id,
        type:    'revision_uploaded',
        title:   `${nextRevNum === 1 ? 'Initial Photos' : `Revision ${nextRevNum - 1}`} uploaded for "${project.name}"`,
        body:    'Photos are ready for client review.',
        link:    `/projects/${project.id}`,
      })

      if (editorNote.trim()) {
        await supabase.from('shoot_notes').insert({
          project_id: project.id,
          author_id:  profile.id,
          content:    `[Photo Revision ${nextRevNum} note] ${editorNote.trim()}`,
        })
      }

      setPhotos([])
      setEditorNote('')
      setOpen(false)
      onRefresh()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  if (!open) {
    return (
      <div className="bg-white rounded-2xl border border-border p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <Camera size={22} className="text-accent" />
        </div>
        <h2 className="text-sm font-bold text-text-primary mb-1">
          {nextRevNum === 1 ? 'Ready to submit your photos?' : `Ready to upload Revision ${nextRevNum - 1}?`}
        </h2>
        <p className="text-xs text-text-muted mb-4">Upload the edited photos — clients can leave pinpoint comments on each one.</p>
        <button onClick={() => setOpen(true)} className="btn-primary">
          {nextRevNum === 1 ? 'Upload Initial Photos' : `Upload Revision ${nextRevNum - 1}`}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        <Camera size={14} className="text-text-muted" />
        Upload Photos — {nextRevNum === 1 ? 'Initial Set' : `Revision ${nextRevNum - 1}`}
      </h2>

      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          photos.length > 0 ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
        }`}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <Camera size={22} className="mx-auto text-text-muted mb-2" />
        {photos.length > 0 ? (
          <p className="text-sm font-semibold text-text-primary">{photos.length} photo{photos.length !== 1 ? 's' : ''} selected</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-text-primary">Click to select photos</p>
            <p className="text-xs text-text-muted mt-1">JPG, PNG, WEBP — multiple files allowed</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => setPhotos(Array.from(e.target.files || []))}
        />
      </div>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((f, i) => (
            <span key={i} className="text-xs bg-surface-2 px-2 py-1 rounded-lg text-text-secondary truncate max-w-[160px]">{f.name}</span>
          ))}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1.5">Notes <span className="font-normal text-text-muted">(optional)</span></label>
        <textarea
          className="input w-full min-h-[70px] resize-none text-sm"
          placeholder="Any context or notes for the client…"
          value={editorNote}
          onChange={(e) => setEditorNote(e.target.value)}
          disabled={uploading}
        />
      </div>

      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="btn-secondary" disabled={uploading}>Cancel</button>
        <button
          onClick={handleUpload}
          disabled={photos.length === 0 || uploading}
          className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? 'Uploading…' : `Submit Photos →`}
        </button>
      </div>
    </div>
  )
}

function UploadRevisionSection({ project, revisions, onRefresh }) {
  const { profile }  = useAuth()
  const fileInputRef = useRef()

  const [open,         setOpen]        = useState(false)
  const [revisionFile, setRevisionFile] = useState(null)
  const [uploading,    setUploading]   = useState(false)
  const [uploadStats,  setUploadStats] = useState(null)
  const [uploadPct,    setUploadPct]   = useState(0)
  const [editorNote,   setEditorNote]  = useState('')
  const [uploadError,  setUploadError] = useState('')

  const stage      = STAGE_KEY_MAP[project.stage] || project.stage
  const latestRev  = [...revisions].sort((a, b) => b.revision_number - a.revision_number)[0]

  // "Rework" = admin rejected and editor is fixing it — update same revision, skip to client
  const isAdminRework = latestRev?.status === 'pending_editor' && latestRev?.admin_reviewed === true
  const nextRevNum    = isAdminRework
    ? latestRev.revision_number  // same number — not a new client revision
    : (latestRev ? latestRev.revision_number + 1 : 1)

  const canUpload = stage === 'post_production' || (latestRev && latestRev.status === 'pending_editor')
  // Don't show upload while awaiting admin review
  const pendingAdminRev = revisions.find((r) => r.status === 'pending_admin_review')
  if (!canUpload || pendingAdminRev) return null

  const handleUploadRevision = async () => {
    if (!revisionFile) return
    setUploading(true)
    setUploadError('')
    setUploadPct(0)
    setUploadStats(null)
    try {
      const { publicUrl } = await uploadToR2({
        file:        revisionFile,
        category:    'revisions',
        clientName:  project.clients?.name || '',
        projectName: project.name,
        folderType:  'shoots',
        shootDate:   project.shoot_date || null,
        onProgress:  setUploadPct,
        onStats:     setUploadStats,
      })

      if (isAdminRework) {
        // Admin already reviewed — send straight to client
        const { error: e } = await supabase.from('project_revisions')
          .update({ video_url: publicUrl, status: 'pending_client_review' })
          .eq('id', latestRev.id)
        if (e) throw new Error(e.message)
      } else {
        // New revision → goes to photographer first for review, then client
        const { error: e } = await supabase.from('project_revisions').insert({
          project_id:      project.id,
          revision_number: nextRevNum,
          video_url:       publicUrl,
          status:          'pending_photographer_review',
          uploaded_by:     profile.id,
        })
        if (e) throw new Error(e.message)

        await updateProject(project.id, { stage: 'review', revision_count: nextRevNum })

        // Notify photographer and admins
        const revLabel = nextRevNum === 1 ? 'Initial Cut' : `Revision ${nextRevNum - 1}`
        const { notify: notifyFn, notifyAdmins: notifyAdminsFn } = await import('../../lib/notify')
        if (project.creative_id) {
          await notifyFn({
            profileId: project.creative_id,
            actorId:   profile.id,
            type:      'revision_uploaded',
            title:     `${revLabel} ready for your review — "${project.name}"`,
            body:      'Leave your timeline notes before the client sees it.',
            link:      `/projects/${project.id}`,
          })
        }
        await notifyAdminsFn({
          actorId: profile.id,
          type:    'revision_uploaded',
          title:   `${revLabel} uploaded for "${project.name}"`,
          body:    'Photographer review is next.',
          link:    `/projects/${project.id}`,
        })
      }

      // Save editor note
      if (editorNote.trim()) {
        await supabase.from('shoot_notes').insert({
          project_id: project.id,
          author_id:  profile.id,
          content:    `[Revision ${nextRevNum} note] ${editorNote.trim()}`,
        })
      }

      setRevisionFile(null)
      setEditorNote('')
      setOpen(false)
      onRefresh()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Gate ───────────────────────────────────────────────────────────────────
  // Contextual copy based on situation
  const gateTitle = isAdminRework
    ? 'Address admin feedback and submit to client'
    : nextRevNum === 1
    ? (project.admin_review_required ? 'Ready to submit your initial cut?' : 'Ready to submit your initial cut?')
    : `Ready to upload ${revisionLabel(nextRevNum)}?`

  const gateBody = isAdminRework
    ? 'Admin requested changes. Fix them and upload — it will go straight to the client (no extra revision count).'
    : nextRevNum > 1
    ? `Address the client's feedback on the initial cut and upload your revised cut.`
    : project.admin_review_required
    ? 'Your cut will go to admin for approval before the client sees it.'
    : 'Upload your initial cut for the creative team to review.'

  if (!open) {
    return (
      <div className="bg-white rounded-2xl border border-border p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <FileVideo size={22} className="text-accent" />
        </div>
        <h2 className="text-sm font-bold text-text-primary mb-1">{gateTitle}</h2>
        <p className="text-xs text-text-muted mb-4">{gateBody}</p>
        {latestRev && latestRev.status === 'pending_editor' && (
          <div className="mb-4">
            <RevisionCommentsList revisionId={latestRev.id} />
          </div>
        )}
        <button onClick={() => setOpen(true)} className="btn-primary">
          {isAdminRework ? 'Upload Corrected Edit' : `Upload ${revisionLabel(nextRevNum)}`}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        <FileVideo size={14} className="text-text-muted" /> Upload {revisionLabel(nextRevNum)}
      </h2>

      {/* Accepted comments */}
      {latestRev && latestRev.status === 'pending_editor' && (
        <RevisionCommentsList revisionId={latestRev.id} />
      )}

      {/* File picker */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          revisionFile ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
        }`}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <FileVideo size={22} className="mx-auto text-text-muted mb-2" />
        {revisionFile ? (
          <>
            <p className="text-sm font-semibold text-text-primary">{revisionFile.name}</p>
            <p className="text-xs text-text-muted">{fmtBytes(revisionFile.size)}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-text-primary">Select revision video</p>
            <p className="text-xs text-text-muted mt-1">MP4, MOV, or any video file</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => setRevisionFile(e.target.files?.[0] || null)}
        />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div>
          <div className="flex items-center justify-between mb-1 text-xs text-text-muted">
            <span>Uploading…</span>
            <div className="flex items-center gap-2">
              {uploadStats && <span className="font-medium text-text-secondary">{fmtSpeed(uploadStats.speed)}</span>}
              {uploadStats?.eta != null && <span>{fmtEta(uploadStats.eta)}</span>}
              <span>{uploadPct}%</span>
            </div>
          </div>
          <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-200" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      )}

      {/* Notes for creative */}
      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1.5 flex items-center gap-1">
          <StickyNote size={12} /> Notes for creative team <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <textarea
          className="input w-full min-h-[80px] resize-none text-sm"
          placeholder="What changed, any context, things to look out for…"
          value={editorNote}
          onChange={(e) => setEditorNote(e.target.value)}
          disabled={uploading}
        />
      </div>

      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="btn-secondary"
          disabled={uploading}
        >
          Cancel
        </button>
        <button
          onClick={handleUploadRevision}
          disabled={!revisionFile || uploading}
          className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? 'Uploading…' : `Submit ${revisionLabel(nextRevNum)} →`}
        </button>
      </div>
    </div>
  )
}

// ── Revisions Card (Right column) ─────────────────────────────────────────────

function RevisionsCard({ project, revisions, commentCounts, navigate }) {
  const sorted = [...revisions].sort((a, b) => b.revision_number - a.revision_number)

  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
        <FileVideo size={14} className="text-text-muted" /> Revisions
      </h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-text-muted italic">No revisions yet.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => {
            const count = commentCounts[r.id] ?? 0
            return (
              <div key={r.id} className="border border-border rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-text-primary">
                    {revisionLabel(r.revision_number)}
                  </p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    REVISION_STATUS_COLORS[r.status] || 'bg-surface-2 text-text-muted border-border'
                  }`}>
                    {REVISION_STATUS_LABELS[r.status] || r.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted mb-3">
                  {r.created_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {format(new Date(r.created_at), 'MMM d, yyyy')}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MessageSquare size={10} />
                    {count} comment{count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(project.media_type === 'photo' ? `/projects/${project.id}/photo-revision/${r.id}` : `/projects/${project.id}/revision/${r.id}`)}
                    className="btn-secondary text-xs flex items-center gap-1 flex-1 justify-center"
                  >
                    View & Comment <ChevronRight size={12} />
                  </button>
                  {r.video_url && (
                    <button onClick={() => forceDownload(r.video_url, `revision-${r.revision_number}.mp4`)}
                      
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 transition-colors" title="Download full quality">
                      <Download size={12} /> Download
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-text-muted mt-4 pt-3 border-t border-border">
        Client gets up to 3 revisions total.
      </p>
    </div>
  )
}

// ── Quick Actions Card (Right column) ─────────────────────────────────────────

function QuickActionsCard({ projectId, isAdmin }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-3">Quick Actions</h2>
      <div className="space-y-2">
        {isAdmin && (
          <Link
            to={`/projects/${projectId}`}
            className="flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors font-medium"
          >
            <ExternalLink size={13} /> View in Admin
          </Link>
        )}
        <Link
          to="/messages"
          className="flex items-center gap-2 text-sm text-text-primary hover:text-accent transition-colors font-medium"
        >
          <MessageSquare size={13} /> Messages
        </Link>
        <Link
          to="/projects"
          className="flex items-center gap-2 text-sm text-text-primary hover:text-accent transition-colors font-medium"
        >
          <ArrowLeft size={13} /> Back to My Projects
        </Link>
      </div>
    </div>
  )
}

// ── Project Status Card (Right column) ────────────────────────────────────────

function ProjectStatusCard({ project, revisions, creativeProfile, editorProfile }) {
  const stage     = STAGE_KEY_MAP[project.stage] || project.stage
  const latestRev = [...(revisions || [])].sort((a, b) => b.revision_number - a.revision_number)[0]

  // For the review stage, branch on the actual revision status
  const reviewCurrent = (() => {
    if (stage !== 'review') return null
    const s = latestRev?.status
    if (s === 'pending_client_review')
      return { label: 'Client', detail: 'Watching and giving feedback.' }
    if (s === 'pending_editor')
      return { label: editorProfile?.full_name || 'Editor', detail: 'Addressing revision feedback.' }
    if (s === 'pending_admin_review')
      return { label: 'Admin', detail: 'Reviewing the edit before the client sees it.' }
    // pending_creative_review or unknown
    return { label: creativeProfile?.full_name || 'Creative', detail: 'Reviewing the edit before client sees it.' }
  })()

  const controlMap = {
    post_production: { label: editorProfile?.full_name || 'Editor', detail: 'Working on the edit.' },
    delivered:       { label: 'Complete', detail: 'Project has been delivered.' },
  }

  const current = reviewCurrent || controlMap[stage] || { label: stage, detail: '' }

  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-3">Who's Up</h2>
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0 animate-pulse" />
        <div>
          <p className="text-sm font-bold text-text-primary">{current.label}</p>
          <p className="text-xs text-text-muted mt-0.5">{current.detail}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProjectWorkflow() {
  const { id }      = useParams()
  const { profile, isAdmin } = useAuth()
  const navigate    = useNavigate()

  const [project,        setProject]        = useState(null)
  const [projectShoots,  setProjectShoots]  = useState([])
  const [uploads,        setUploads]        = useState([])
  const [shootNotes,     setShootNotes]     = useState([])
  const [revisions,      setRevisions]      = useState([])
  const [commentCounts,  setCommentCounts]  = useState({})
  const [creativeProfile, setCreativeProfile] = useState(null)
  const [editorProfile,   setEditorProfile]   = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')

  // Shoot scheduling (creative can add/delete shoots for their project)
  const [showAddShoot,     setShowAddShoot]     = useState(false)
  const [newShootDate,     setNewShootDate]     = useState('')
  const [newShootTime,     setNewShootTime]     = useState('')
  const [newShootLocation, setNewShootLocation] = useState('')
  const [addingShoot,      setAddingShoot]      = useState(false)

  const fetchAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      // 1. Fetch project base data
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('id, name, stage, shoot_date, shoot_id, location, creative_id, editor_id, revision_count, notes, clients(id, name, contact_name)')
        .eq('id', id)
        .single()
      if (projErr) throw projErr

      // 2. Fetch everything else in parallel
      const [shootsRes, uploadsRes, shootUploadsRes, notesRes, revsRes] = await Promise.all([
        supabase.from('project_shoots').select('*').eq('project_id', id).order('shoot_date'),
        supabase.from('shoot_uploads').select('*, profiles(id, full_name, role)').eq('project_id', id).order('created_at'),
        projData.shoot_id
          ? supabase.from('shoot_uploads').select('*, profiles(id, full_name, role)').eq('shoot_id', projData.shoot_id).order('created_at')
          : Promise.resolve({ data: [] }),
        supabase.from('shoot_notes').select('*').eq('project_id', id).order('created_at'),
        supabase.from('project_revisions').select('*').eq('project_id', id).order('revision_number'),
      ])

      const revData = revsRes.data || []

      // 3. Fetch creative + editor profiles separately (avoid tricky double join)
      const profileIds = [projData.creative_id, projData.editor_id].filter(Boolean)
      let creativePro = null
      let editorPro   = null
      if (profileIds.length) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', profileIds)
        if (profilesData) {
          creativePro = profilesData.find((p) => p.id === projData.creative_id) || null
          editorPro   = profilesData.find((p) => p.id === projData.editor_id)   || null
        }
      }

      // 4. Fetch comment counts per revision
      const counts = {}
      if (revData.length) {
        await Promise.all(
          revData.map(async (rev) => {
            const { count } = await supabase
              .from('revision_comments')
              .select('id', { count: 'exact', head: true })
              .eq('revision_id', rev.id)
            counts[rev.id] = count ?? 0
          })
        )
      }

      const allUploads = [
        ...(uploadsRes.data || []),
        ...(shootUploadsRes.data || []),
      ]
      const seen = new Set()
      const dedupedUploads = allUploads.filter((u) => {
        if (seen.has(u.id)) return false
        seen.add(u.id)
        return true
      })

      setProject(projData)
      setProjectShoots(shootsRes.data || [])
      setUploads(dedupedUploads)
      setShootNotes(notesRes.data || [])
      setRevisions(revData)
      setCommentCounts(counts)
      setCreativeProfile(creativePro)
      setEditorProfile(editorPro)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [id])

  const fetchShoots = () =>
    supabase.from('project_shoots').select('*').eq('project_id', id).order('shoot_date')
      .then(({ data }) => setProjectShoots(data || []))

  const handleAddShoot = async () => {
    if (!newShootDate || !project) return
    setAddingShoot(true)
    try {
      const shootTitle = `${project.name} — Shoot`
      const timeStr    = newShootTime || '09:00'
      const startAt    = new Date(`${newShootDate}T${timeStr}:00`)
      const endAt      = new Date(startAt.getTime() + 2 * 60 * 60 * 1000)

      // 1. Create calendar event
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: evtData } = await supabase.from('calendar_events').insert({
        title:      shootTitle,
        event_type: 'in_person',
        start_at:   startAt.toISOString(),
        end_at:     endAt.toISOString(),
        all_day:    false,
        location:   newShootLocation || null,
        created_by: authUser.id,
      }).select().single()

      // 2. Insert the project shoot, linking back to the calendar event
      await supabase.from('project_shoots').insert({
        project_id:        id,
        shoot_date:        newShootDate,
        shoot_time:        newShootTime  || null,
        location:          newShootLocation || null,
        title:             shootTitle,
        status:            'scheduled',
        calendar_event_id: evtData?.id || null,
      })

      // 3. Add creative, editor, and client to calendar_event_members
      if (evtData) {
        const memberIds = [project.creative_id, project.editor_id].filter(Boolean)

        if (project.clients?.id) {
          const { data: clientRow } = await supabase
            .from('clients')
            .select('profile_id')
            .eq('id', project.clients.id)
            .maybeSingle()
          if (clientRow?.profile_id) memberIds.push(clientRow.profile_id)
        }

        if (memberIds.length) {
          await supabase.from('calendar_event_members').insert(
            memberIds.map((profile_id) => ({ event_id: evtData.id, profile_id }))
          )
        }
      }

      setNewShootDate('')
      setNewShootTime('')
      setNewShootLocation('')
      setShowAddShoot(false)
      fetchShoots()
    } finally {
      setAddingShoot(false)
    }
  }

  const handleDeleteShoot = async (shootId) => {
    const { data: shootRow } = await supabase
      .from('project_shoots')
      .select('calendar_event_id')
      .eq('id', shootId)
      .maybeSingle()

    await supabase.from('project_shoots').delete().eq('id', shootId)

    if (shootRow?.calendar_event_id) {
      await supabase.from('calendar_events').delete().eq('id', shootRow.calendar_event_id)
    }

    fetchShoots()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={22} className="animate-spin text-text-muted" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="p-8">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6"
        >
          <ArrowLeft size={14} /> Back to Projects
        </Link>
        <p className="text-sm text-text-muted">{error || 'Project not found.'}</p>
      </div>
    )
  }

  const isCreative = profile?.role === 'creative' || project.creative_id === profile?.id || isAdmin
  const isEditor   = project.editor_id   === profile?.id || isAdmin
  return (
    <div className="p-8 max-w-4xl">
      {/* Back link */}
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-5 transition-colors"
      >
        <ArrowLeft size={14} /> My Projects
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
            {project.clients && (
              <p className="text-sm text-text-muted mt-0.5">
                {project.clients.contact_name || project.clients.name}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {isCreative && !isEditor && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 font-semibold px-2.5 py-0.5 rounded-full">
                Creative
              </span>
            )}
            {isEditor && !isCreative && (
              <span className="text-xs bg-green-50 text-green-700 border border-green-200 font-semibold px-2.5 py-0.5 rounded-full">
                Editor
              </span>
            )}
            {isCreative && isEditor && project.creative_id === profile?.id && project.editor_id === profile?.id && (
              <span className="text-xs bg-accent/10 text-accent border border-accent/20 font-semibold px-2.5 py-0.5 rounded-full">
                Creative &amp; Editor
              </span>
            )}
            {isAdmin && (
              <span className="text-xs bg-surface-2 text-text-muted border border-border font-semibold px-2.5 py-0.5 rounded-full">
                Admin View
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stage pipeline */}
      <StagePipeline currentStage={project.stage} />

      {/* Who's Up */}
      <WhosUpBar stage={project.stage} editorProfile={editorProfile} creativeProfile={creativeProfile} />

      {/* Action banner */}
      <ActionBanner
        project={project}
        uploads={uploads}
        revisions={revisions}
        isCreative={isCreative}
        isEditor={isEditor}
        navigate={navigate}
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN — 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Project Overview */}
          <ProjectOverviewCard
            project={project}
            projectShoots={projectShoots}
            creativeProfile={creativeProfile}
            editorProfile={editorProfile}
            canManageShoots={isCreative}
            showAddShoot={showAddShoot}
            setShowAddShoot={setShowAddShoot}
            newShootDate={newShootDate}
            setNewShootDate={setNewShootDate}
            newShootTime={newShootTime}
            setNewShootTime={setNewShootTime}
            newShootLocation={newShootLocation}
            setNewShootLocation={setNewShootLocation}
            addingShoot={addingShoot}
            onAddShoot={handleAddShoot}
            onDeleteShoot={handleDeleteShoot}
          />

          {/* Admin Review Gate — shown to admin when first edit is pending their approval */}
          {isAdmin && (() => {
            const pendingAdminRev = revisions.find((r) => r.status === 'pending_admin_review')
            return pendingAdminRev ? (
              <AdminReviewSection
                revision={pendingAdminRev}
                project={project}
                onRefresh={fetchAll}
              />
            ) : null
          })()}

          {/* Project Media — upload any videos/photos directly to the project */}
          {isCreative && (
            <ProjectMediaSection
              project={project}
              uploads={uploads.filter((u) => !u.shoot_id)}
              onRefresh={fetchAll}
            />
          )}

          {/* 3a. Source Footage — visible to any editor role (incl. creative+editor combo) */}
          {isEditor && (
            <SourceFootageSection
              uploads={uploads}
              shootNotes={shootNotes}
            />
          )}

          {/* 3b. Upload Revision — visible to any editor role */}
          {isEditor && project?.media_type === 'photo' ? (
            <UploadPhotoRevisionSection
              project={project}
              revisions={revisions}
              onRefresh={fetchAll}
            />
          ) : isEditor ? (
            <UploadRevisionSection
              project={project}
              revisions={revisions}
              onRefresh={fetchAll}
            />
          ) : null}
        </div>

        {/* RIGHT COLUMN — 1/3 width */}
        <div className="space-y-6">
          {/* 1. Revisions */}
          <RevisionsCard
            project={project}
            revisions={revisions}
            commentCounts={commentCounts}
            navigate={navigate}
          />

          {/* 2. Quick Actions */}
          <QuickActionsCard
            projectId={project.id}
            isAdmin={isAdmin}
          />

          {/* 3. Who's Up */}
          <ProjectStatusCard
            project={project}
            revisions={revisions}
            creativeProfile={creativeProfile}
            editorProfile={editorProfile}
          />
        </div>
      </div>
    </div>
  )
}
