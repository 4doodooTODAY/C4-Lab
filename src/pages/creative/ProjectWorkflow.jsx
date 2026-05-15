import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Upload, Check, Film, StickyNote, Send,
  Download, FileVideo, CalendarDays, MapPin,
  ChevronRight, X, MessageSquare, Users, ExternalLink,
  AlertCircle, CheckCircle2, Clock, Zap,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { uploadToR2, fmtSpeed, fmtEta } from '../../lib/r2'
import { updateProject } from '../../hooks/useProjects'
import Avatar from '../../components/ui/Avatar'
import { format, parseISO } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const STAGES = [
  { key: 'planning',       label: 'Planning' },
  { key: 'production',     label: 'Shooting' },
  { key: 'post_production',label: 'Editing' },
  { key: 'review',         label: 'In Review' },
  { key: 'revisions',      label: 'Revisions' },
  { key: 'delivered',      label: 'Delivered' },
]

// map legacy/alternate stage keys to our STAGES keys
const STAGE_KEY_MAP = {
  briefing:        'planning',
  pre_production:  'planning',
  planning:        'planning',
  production:      'production',
  post_production: 'post_production',
  review:          'review',
  revisions:       'revisions',
  delivered:       'delivered',
}

const STAGE_DESCRIPTIONS = {
  planning:        'Getting ready for the shoot.',
  production:      'Shoot day — go get those shots!',
  post_production: 'Footage uploaded — time to edit.',
  review:          'Revision is under review.',
  revisions:       'Revision sent back with feedback.',
  delivered:       'Project complete!',
}

const REVISION_STATUS_LABELS = {
  pending_creative_review: 'Needs Your Review',
  pending_client_review:   'Client Reviewing',
  pending_editor:          'Awaiting Revisions',
  approved:                'Approved',
}

const REVISION_STATUS_COLORS = {
  pending_creative_review: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_client_review:   'bg-blue-50 text-blue-700 border-blue-200',
  pending_editor:          'bg-purple-50 text-purple-700 border-purple-200',
  approved:                'bg-green-50 text-green-700 border-green-200',
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

// ── Action Banner ─────────────────────────────────────────────────────────────

function ActionBanner({ project, uploads, revisions, isCreative, isEditor, navigate }) {
  const stage        = STAGE_KEY_MAP[project.stage] || project.stage
  const pendingReview = revisions.find((r) => r.status === 'pending_creative_review')
  const latestRev     = [...revisions].sort((a, b) => b.revision_number - a.revision_number)[0]
  const hasUploads    = uploads.length > 0

  let banner = null

  if (isCreative) {
    if (stage === 'production') {
      banner = {
        variant: 'amber',
        icon: <Zap size={18} />,
        title: 'Shoot day!',
        body: 'Upload your footage when you\'re done shooting.',
      }
    } else if (stage === 'post_production' && !hasUploads) {
      banner = {
        variant: 'red',
        icon: <AlertCircle size={18} />,
        title: 'Footage needed',
        body: 'Upload your footage to get started with editing.',
      }
    } else if (stage === 'post_production' && hasUploads && !project._shootNotes?.length) {
      banner = {
        variant: 'blue',
        icon: <StickyNote size={18} />,
        title: 'Add shoot notes',
        body: 'Leave notes for the editor — what to keep, key moments, any context.',
      }
    } else if (pendingReview) {
      banner = {
        variant: 'accent',
        icon: <FileVideo size={18} />,
        title: `Revision ${pendingReview.revision_number} is ready for your review`,
        body: 'Leave comments before sending to the client.',
        action: {
          label: 'Review Now →',
          onClick: () => navigate(`/projects/${project.id}/revision/${pendingReview.id}`),
        },
      }
    } else {
      banner = {
        variant: 'green',
        icon: <CheckCircle2 size={18} />,
        title: 'You\'re all caught up',
        body: 'Nothing needs your attention right now.',
      }
    }
  } else if (isEditor) {
    if (stage === 'post_production' && hasUploads && revisions.length === 0) {
      banner = {
        variant: 'accent',
        icon: <Upload size={18} />,
        title: 'Footage is ready',
        body: 'Upload your first edit when you\'re done.',
      }
    } else if (latestRev && latestRev.status === 'pending_editor') {
      banner = {
        variant: 'red',
        icon: <AlertCircle size={18} />,
        title: `Revision ${latestRev.revision_number} sent back with feedback`,
        body: 'Address the accepted comments and upload a revised cut.',
        action: {
          label: 'View Feedback →',
          onClick: () => navigate(`/projects/${project.id}/revision/${latestRev.id}`),
        },
      }
    } else {
      banner = {
        variant: 'green',
        icon: <CheckCircle2 size={18} />,
        title: 'You\'re all caught up',
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

function ProjectOverviewCard({ project, projectShoots, creativeProfile, editorProfile }) {
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
        {projectShoots.length > 0 && (
          <div>
            <p className="text-xs text-text-muted flex items-center gap-1 mb-1">
              <CalendarDays size={11} /> Shoot Date{projectShoots.length > 1 ? 's' : ''}
            </p>
            <div className="space-y-1">
              {projectShoots.map((shoot) => (
                <div key={shoot.id} className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    {shoot.shoot_date
                      ? format(parseISO(shoot.shoot_date), 'MMMM d, yyyy')
                      : '—'}
                  </p>
                  {shoot.location && (
                    <p className="text-xs text-text-muted flex items-center gap-0.5">
                      <MapPin size={10} /> {shoot.location}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Location (project-level fallback) */}
        {projectShoots.length === 0 && project.location && (
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

function SourceFootageSection({ uploads, shootNotes }) {
  const [showFiles,        setShowFiles]        = useState(false)
  const [showClientFiles,  setShowClientFiles]  = useState(false)
  const [downloadingAll,   setDownloadingAll]   = useState(false)

  const teamUploads   = uploads.filter((f) => f.profiles?.role !== 'client')
  const clientUploads = uploads.filter((f) => f.profiles?.role === 'client')
  const totalSize = teamUploads.reduce((acc, f) => acc + (f.file_size || 0), 0)

  const handleDownloadAll = async () => {
    setDownloadingAll(true)
    for (const f of uploads) {
      if (f.file_url) {
        const a = document.createElement('a')
        a.href = f.file_url
        a.download = f.file_name
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        await new Promise((r) => setTimeout(r, 400))
      }
    }
    setDownloadingAll(false)
  }

  if (uploads.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Film size={14} className="text-text-muted" /> Source Footage
        </h2>
        <p className="text-sm text-text-muted italic">
          Waiting on the shooter to upload footage.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        <Film size={14} className="text-text-muted" /> Source Footage
      </h2>

      {/* Team footage */}
      {teamUploads.length > 0 && (
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1">
              <p className="text-sm font-bold text-text-primary">
                {teamUploads.length} file{teamUploads.length !== 1 ? 's' : ''} from team
              </p>
              <p className="text-xs text-text-muted">{fmtBytes(totalSize)} total</p>
            </div>
            <button onClick={() => setShowFiles((v) => !v)} className="btn-secondary text-xs">
              {showFiles ? 'Hide' : 'Show files'}
            </button>
            <button
              onClick={handleDownloadAll}
              disabled={downloadingAll}
              className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {downloadingAll ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {downloadingAll ? 'Downloading…' : 'Download All'}
            </button>
          </div>
          {showFiles && (
            <div className="mt-2 border border-border rounded-xl divide-y divide-border">
              {teamUploads.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Film size={13} className="text-text-muted shrink-0" />
                  <span className="text-sm text-text-primary truncate flex-1">{f.file_name}</span>
                  <span className="text-xs text-text-muted">{fmtBytes(f.file_size)}</span>
                  {f.file_url && (
                    <a href={f.file_url} download={f.file_name} target="_blank" rel="noreferrer"
                      className="text-accent hover:text-accent/80 transition-colors shrink-0">
                      <Download size={13} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Client footage */}
      {clientUploads.length > 0 && (
        <div className="border border-blue-100 rounded-xl p-3 bg-blue-50/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
              <Film size={12} /> Client Uploaded · {clientUploads.length} file{clientUploads.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setShowClientFiles((v) => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {showClientFiles ? 'Hide' : 'Show'}
            </button>
          </div>
          {showClientFiles && (
            <div className="space-y-1.5">
              {clientUploads.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Film size={12} className="text-blue-400 shrink-0" />
                  <span className="text-xs text-blue-900 truncate flex-1">{f.file_name}</span>
                  <span className="text-xs text-blue-400">{fmtBytes(f.file_size)}</span>
                  {f.file_url && (
                    <a href={f.file_url} download={f.file_name} target="_blank" rel="noreferrer"
                      className="text-blue-500 hover:text-blue-700">
                      <Download size={12} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shoot notes from creative */}
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

// ── Upload Revision Section (Editor only) ─────────────────────────────────────

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
  const nextRevNum = latestRev ? latestRev.revision_number + 1 : 1
  const canUpload  = stage === 'post_production' || (latestRev && latestRev.status === 'pending_editor')

  if (!canUpload) return null

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

      await supabase.from('project_revisions').insert({
        project_id:      project.id,
        revision_number: nextRevNum,
        video_url:       publicUrl,
        status:          'pending_creative_review',
        uploaded_by:     profile.id,
      })

      // Save editor note as a shoot note tagged for this revision
      if (editorNote.trim()) {
        await supabase.from('shoot_notes').insert({
          project_id: project.id,
          author_id:  profile.id,
          content:    `[Revision ${nextRevNum} note] ${editorNote.trim()}`,
        })
      }

      await updateProject(project.id, { stage: 'review', revision_count: nextRevNum })

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
  if (!open) {
    return (
      <div className="bg-white rounded-2xl border border-border p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <FileVideo size={22} className="text-accent" />
        </div>
        <h2 className="text-sm font-bold text-text-primary mb-1">
          {nextRevNum === 1 ? 'Ready to submit your edit?' : `Ready to upload Revision ${nextRevNum}?`}
        </h2>
        <p className="text-xs text-text-muted mb-4">
          {nextRevNum > 1
            ? `Address the feedback from Revision ${nextRevNum - 1} and upload your new cut.`
            : 'Upload the first edit for the creative team to review.'}
        </p>
        {latestRev && latestRev.status === 'pending_editor' && (
          <div className="mb-4">
            <RevisionCommentsList revisionId={latestRev.id} />
          </div>
        )}
        <button onClick={() => setOpen(true)} className="btn-primary">
          Begin Revision {nextRevNum} Upload
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        <FileVideo size={14} className="text-text-muted" /> Upload Revision {nextRevNum}
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
          {uploading ? 'Uploading…' : `Submit Revision ${nextRevNum} →`}
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
                    Revision {r.revision_number}
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
                <button
                  onClick={() => navigate(`/projects/${project.id}/revision/${r.id}`)}
                  className="btn-secondary text-xs flex items-center gap-1 w-full justify-center"
                >
                  View & Comment <ChevronRight size={12} />
                </button>
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

function ProjectStatusCard({ project, creativeProfile, editorProfile }) {
  const stage = STAGE_KEY_MAP[project.stage] || project.stage

  const controlMap = {
    planning:        { label: 'Admin is in control', detail: 'Waiting for shoot setup.' },
    production:      { label: creativeProfile?.full_name || 'Shooter', detail: 'Out on the shoot.' },
    post_production: { label: editorProfile?.full_name || 'Editor', detail: 'Working on the edit.' },
    review:          { label: 'Creative is reviewing', detail: 'Reviewing the edit before client sees it.' },
    revisions:       { label: editorProfile?.full_name || 'Editor', detail: 'Addressing revision feedback.' },
    delivered:       { label: 'Complete', detail: 'Project has been delivered.' },
  }

  const current = controlMap[stage] || { label: stage, detail: '' }

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
  const { profile } = useAuth()
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

  const fetchAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      // 1. Fetch project base data
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('id, name, stage, shoot_date, location, creative_id, editor_id, revision_count, notes, clients(id, name, contact_name)')
        .eq('id', id)
        .single()
      if (projErr) throw projErr

      // 2. Fetch everything else in parallel
      const [shootsRes, uploadsRes, notesRes, revsRes] = await Promise.all([
        supabase.from('project_shoots').select('*').eq('project_id', id).order('shoot_date'),
        supabase.from('shoot_uploads').select('*, profiles(id, full_name, role)').eq('project_id', id).order('created_at'),
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

      setProject(projData)
      setProjectShoots(shootsRes.data || [])
      setUploads(uploadsRes.data || [])
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

  const isAdmin    = profile?.role === 'admin'
  const isCreative = project.creative_id === profile?.id || isAdmin
  const isEditor   = project.editor_id   === profile?.id || isAdmin
  // Pure editor: only editor assigned, not also creative
  const pureEditor = isEditor && project.editor_id === profile?.id && project.creative_id !== profile?.id && !isAdmin

  // Attach shootNotes count to project for ActionBanner heuristic
  const projectWithMeta = { ...project, _shootNotes: shootNotes }

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
            {isCreative && !pureEditor && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 font-semibold px-2.5 py-0.5 rounded-full">
                Shooter
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

      {/* Action banner */}
      <ActionBanner
        project={projectWithMeta}
        uploads={uploads}
        revisions={revisions}
        isCreative={isCreative && !pureEditor}
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
          />

          {/* 2. Shoot Delivery — creative (footage + notes in one flow) */}
          {isCreative && !pureEditor && (
            <ShootDeliverySection
              project={project}
              uploads={uploads}
              shootNotes={shootNotes}
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
          {isEditor && (
            <UploadRevisionSection
              project={project}
              revisions={revisions}
              onRefresh={fetchAll}
            />
          )}
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
            creativeProfile={creativeProfile}
            editorProfile={editorProfile}
          />
        </div>
      </div>
    </div>
  )
}
