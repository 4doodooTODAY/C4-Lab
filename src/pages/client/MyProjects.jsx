import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Loader2, FolderKanban, ArrowRight, CheckCircle2, Upload,
  Film, X, Check, CalendarDays, MapPin, Users, Clock,
  Camera, Scissors, StickyNote, ThumbsUp, ThumbsDown,
  MessageSquare, Sparkles,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { uploadToR2, fmtSpeed, fmtEta } from '../../lib/r2'
import { notify, notifyAdmins } from '../../lib/notify'
import { format, parseISO, isPast, isFuture, formatDistanceToNow } from 'date-fns'
import { fmtTime } from '../../lib/time'

function fmtBytes(bytes) {
  if (!bytes) return ''
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB'
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(1) + ' KB'
}

// ── Stage config ──────────────────────────────────────────────────────────────
// Stages: pitch → pre_production → production → post_production → review → delivered
const STAGE_STEPS = ['Pitch', 'Shoot', 'Editing', 'Review', 'Done']

function getStep(stage, pendingRevision) {
  if (stage === 'delivered' || stage === 'ready_to_post') return 4
  if (stage === 'review' || stage === 'revisions') return 3
  if (stage === 'post_production') return 2
  if (stage === 'production' || stage === 'pre_production' || stage === 'briefing') return 1
  return 0 // pitch
}

function getStatusInfo(stage, pendingRevision) {
  const revStatus = pendingRevision?.status

  if (stage === 'delivered')
    return { text: 'Your project is complete!', sub: 'Posted online ✅', color: 'text-green-600', emoji: '🎉' }
  if (stage === 'ready_to_post')
    return { text: 'Approved — coming soon!', sub: "We're preparing to post this.", color: 'text-blue-600', emoji: '🚀' }

  if (stage === 'review' || stage === 'revisions') {
    if (revStatus === 'pending_client_review') {
      const n = pendingRevision.revision_number
      return { text: n === 1 ? 'Your first cut is ready!' : `Revision ${n - 1} is ready!`, sub: 'Watch and leave your feedback.', color: 'text-accent', emoji: '🎬' }
    }
    if (revStatus === 'pending_photographer_review' || revStatus === 'pending_creative_review')
      return { text: 'Under review', sub: 'The photographer is reviewing before sending it to you.', color: 'text-purple-600', emoji: '🔍' }
    if (revStatus === 'pending_editor')
      return { text: 'Revisions in progress', sub: 'Your feedback is being addressed.', color: 'text-orange-600', emoji: '✂️' }
    return { text: 'Under review', sub: 'Your team is reviewing.', color: 'text-gray-600', emoji: '' }
  }

  if (stage === 'post_production')
    return { text: 'In the edit', sub: 'Your editor is cutting the footage.', color: 'text-purple-600', emoji: '✂️' }
  if (stage === 'production')
    return { text: 'Footage being uploaded', sub: 'The photographer is submitting the shoot files.', color: 'text-amber-600', emoji: '🎥' }
  if (stage === 'pre_production' || stage === 'briefing')
    return { text: 'Shoot being planned', sub: "We're scheduling everything for your project.", color: 'text-blue-600', emoji: '📅' }
  if (stage === 'pitch')
    return { text: 'Waiting for your approval', sub: 'Review the project brief and approve to get started.', color: 'text-accent', emoji: '✨' }

  return { text: 'Getting set up', sub: "We're planning everything.", color: 'text-gray-500', emoji: '📋' }
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ stage, pendingRevision }) {
  const step = getStep(stage, pendingRevision)
  return (
    <div className="flex items-center w-full">
      {STAGE_STEPS.map((label, i) => {
        const done    = i < step
        const current = i === step
        const isLast  = i === STAGE_STEPS.length - 1
        return (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                done ? 'bg-green-500 text-white' : current ? 'bg-accent text-white ring-4 ring-accent/20' : 'bg-gray-100 text-gray-400'
              }`}>
                {done ? <Check size={10} /> : i + 1}
              </div>
              <p className={`text-[9px] mt-1 font-semibold text-center truncate w-full px-0.5 ${
                done ? 'text-green-500' : current ? 'text-accent' : 'text-gray-300'
              }`}>{label}</p>
            </div>
            {!isLast && <div className={`h-0.5 flex-1 mx-0.5 mb-3 ${done ? 'bg-green-400' : 'bg-gray-100'}`} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Team pill ─────────────────────────────────────────────────────────────────
function TeamPill({ label, name, icon: Icon, color }) {
  if (!name) return null
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center shrink-0`}>
        <Icon size={9} className="text-white" />
      </div>
      <div>
        <p className="text-[9px] text-gray-400 leading-none">{label}</p>
        <p className="text-xs font-medium text-gray-700 leading-tight">{name}</p>
      </div>
    </div>
  )
}

// ── Footage uploader ──────────────────────────────────────────────────────────
function FootageUploader({ project, clientName, onDone }) {
  const { user } = useAuth()
  const fileInputRef = useRef()
  const [files,     setFiles]    = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [fileIdx,   setFileIdx]   = useState(0)
  const [stats,     setStats]     = useState(null)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)
  const [dragOver,  setDragOver]  = useState(false)

  const addFiles = (incoming) => setFiles((prev) => [...prev, ...Array.from(incoming)])

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true); setError('')
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setFileIdx(i); setProgress(0); setStats(null)
        const { publicUrl } = await uploadToR2({
          file, category: 'client-footage', clientName: clientName || '',
          projectName: project.name, folderType: 'shoots',
          onProgress: setProgress, onStats: setStats,
        })
        const { error: dbErr } = await supabase.from('shoot_uploads').insert({
          project_id: project.id, file_url: publicUrl,
          file_name: file.name, file_size: file.size, uploaded_by: user.id,
        })
        if (dbErr) throw new Error(dbErr.message)
      }
      setDone(true); setFiles([])
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  if (done) return (
    <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
      <CheckCircle2 size={20} className="mx-auto text-green-500 mb-1.5" />
      <p className="text-sm font-semibold text-green-800">Footage sent to your team!</p>
      <div className="flex gap-2 mt-2">
        <button onClick={() => setDone(false)} className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-green-300 text-green-700 hover:bg-green-100 transition-colors">Upload more</button>
        <button onClick={() => { setDone(false); onDone?.() }} className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">Done</button>
      </div>
    </div>
  )

  return (
    <div className="mt-3 space-y-2">
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <Film size={11} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-700 truncate flex-1">{f.name}</span>
              <span className="text-xs text-gray-400">{fmtBytes(f.size)}</span>
              {!uploading && <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><X size={11} className="text-gray-300 hover:text-red-400" /></button>}
            </div>
          ))}
        </div>
      )}
      {!uploading && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${dragOver ? 'border-accent bg-accent/5' : files.length ? 'border-gray-100 py-2.5 hover:border-accent/40' : 'border-gray-200 hover:border-accent/50'}`}
        >
          <Upload size={files.length ? 13 : 18} className="mx-auto mb-1 text-gray-300" />
          <p className={`text-gray-400 ${files.length ? 'text-xs' : 'text-sm'}`}>
            {files.length ? 'Add more files' : <><span className="text-accent font-medium">Browse</span> or drop files here</>}
          </p>
          {!files.length && <p className="text-xs text-gray-300 mt-0.5">Video, photo, ZIP</p>}
        </div>
      )}
      <input ref={fileInputRef} type="file" multiple accept="video/*,image/*,.zip,.mov,.mp4,.avi,.mkv" className="hidden" onChange={(e) => addFiles(e.target.files)} />
      {uploading && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{files.length > 1 ? `File ${fileIdx + 1} of ${files.length}…` : 'Uploading…'}</span>
            <div className="flex gap-1.5">
              {stats && <span className="font-medium text-gray-600">{fmtSpeed(stats.speed)}</span>}
              {stats?.eta != null && <span>{fmtEta(stats.eta)}</span>}
              <span>{progress}%</span>
            </div>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {files.length > 0 && (
        <button onClick={handleUpload} disabled={uploading} className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-accent/90 transition-colors">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Uploading…' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ── Pitch approval panel ───────────────────────────────────────────────────────
function PitchPanel({ project, clientId, userId, onApproved }) {
  const [approving,  setApproving]  = useState(false)
  const [declining,  setDeclining]  = useState(false)
  const [notes,      setNotes]      = useState('')
  const [showNotes,  setShowNotes]  = useState(false)
  const [error,      setError]      = useState('')

  const handleApprove = async () => {
    setApproving(true); setError('')
    try {
      const { error: e } = await supabase.from('projects')
        .update({ stage: 'pre_production', pitch_approved_by: userId, pitch_approved_at: new Date().toISOString() })
        .eq('id', project.id)
      if (e) throw new Error(e.message)

      // Notify admin + creative
      const targets = [project.creative_id].filter(Boolean)
      await notifyAdmins({
        actorId: userId, type: 'pitch_approved',
        title: `"${project.name}" approved by client`,
        body: 'The client approved the project pitch. Shoot can now be scheduled.',
        link: `/projects/${project.id}`,
      })
      for (const profileId of targets) {
        await notify({
          profileId, actorId: userId, type: 'pitch_approved',
          title: `"${project.name}" has been approved!`,
          body: 'The client approved your project pitch.',
          link: `/projects/${project.id}`,
        })
      }
      onApproved()
    } catch (err) {
      setError(err.message)
    } finally {
      setApproving(false)
    }
  }

  const handleRequestChanges = async () => {
    if (!notes.trim()) { setShowNotes(true); return }
    setDeclining(true); setError('')
    try {
      const { error: e } = await supabase.from('projects')
        .update({ pitch_notes: notes.trim() })
        .eq('id', project.id)
      if (e) throw new Error(e.message)

      await notifyAdmins({
        actorId: userId, type: 'pitch_changes_requested',
        title: `"${project.name}" — client requested changes`,
        body: notes.trim(),
        link: `/projects/${project.id}`,
      })
      setShowNotes(false)
      onApproved() // refresh
    } catch (err) {
      setError(err.message)
    } finally {
      setDeclining(false)
    }
  }

  return (
    <div className="bg-gradient-to-br from-accent/5 to-purple-50 border border-accent/20 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-accent" />
        <h3 className="text-sm font-bold text-gray-900">New Project Pitch</h3>
      </div>

      {project.concept && (
        <div className="bg-white rounded-xl px-4 py-3 mb-4 border border-accent/10">
          <p className="text-xs text-gray-400 font-medium mb-1">Project Brief</p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.concept}</p>
        </div>
      )}

      {project.notes && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs text-amber-500 font-medium mb-1">Note from your team</p>
          <p className="text-sm text-gray-700 leading-relaxed">{project.notes}</p>
        </div>
      )}

      {project.pitch_notes && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs text-orange-500 font-medium mb-1">Your previous feedback</p>
          <p className="text-sm text-gray-700 leading-relaxed">{project.pitch_notes}</p>
        </div>
      )}

      {showNotes && (
        <div className="mb-3">
          <label className="text-xs text-gray-500 font-medium mb-1 block">What needs to change?</label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 min-h-[80px]"
            placeholder="Describe what you'd like changed…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={approving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50"
        >
          {approving ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
          Approve & Start
        </button>
        <button
          onClick={showNotes ? handleRequestChanges : () => setShowNotes(true)}
          disabled={declining}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
        >
          {declining ? <Loader2 size={13} className="animate-spin" /> : <ThumbsDown size={13} />}
          {showNotes ? 'Send Feedback' : 'Request Changes'}
        </button>
      </div>
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, revisions, clientId, userId, onRefresh }) {
  const navigate    = useNavigate()
  const [showUpload, setShowUpload] = useState(false)

  const sortedRevs = [...revisions].sort((a, b) => b.revision_number - a.revision_number)
  const pendingRevision = sortedRevs[0]

  const { text, sub, color, emoji } = getStatusInfo(project.stage, pendingRevision)
  const isPitch      = project.stage === 'pitch'
  const canReview    = pendingRevision?.status === 'pending_client_review'
  const isDelivered  = project.stage === 'delivered'
  const isReadyToPost = project.stage === 'ready_to_post'

  const revisionCount  = revisions.length
  const revisionLimit  = project.max_revisions || 3
  const revisionsLeft  = Math.max(0, revisionLimit - revisionCount)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all">
      {/* Stage color bar */}
      <div className={`h-1.5 ${
        isPitch             ? 'bg-accent' :
        isDelivered         ? 'bg-green-400' :
        isReadyToPost       ? 'bg-blue-400' :
        project.stage === 'review' || project.stage === 'revisions' ? 'bg-accent' :
        project.stage === 'post_production' ? 'bg-purple-400' :
        project.stage === 'production'      ? 'bg-amber-400' :
        'bg-gray-200'
      }`} />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{project.name}</h2>
            <p className={`text-sm font-medium mt-0.5 ${color}`}>
              {emoji && <span className="mr-1">{emoji}</span>}{text}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          {isDelivered && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold border border-green-200">
              <Check size={10} /> Delivered
            </span>
          )}
          {isReadyToPost && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
              🚀 Coming Soon
            </span>
          )}
        </div>

        {/* Progress bar (hidden on pitch, not yet started) */}
        {!isPitch && (
          <div className="mb-5">
            <ProgressBar stage={project.stage} pendingRevision={pendingRevision} />
          </div>
        )}

        {/* Pitch approval panel */}
        {isPitch && (
          <div className="mb-4">
            <PitchPanel
              project={project}
              clientId={clientId}
              userId={userId}
              onApproved={onRefresh}
            />
          </div>
        )}

        {/* Info grid */}
        {!isPitch && (
          <div className="grid grid-cols-1 gap-2 mb-4">
            {/* Shoot date */}
            {project.shoot_date && (
              <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
                <Camera size={13} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Shoot</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {format(parseISO(project.shoot_date), 'EEEE, MMMM d, yyyy')}
                  </p>
                  {project.location && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={9} /> {project.location}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Target delivery */}
            {project.target_date && (
              <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
                <Clock size={13} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Target Delivery</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {format(parseISO(project.target_date), 'MMMM d, yyyy')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {isFuture(parseISO(project.target_date))
                      ? `In ${formatDistanceToNow(parseISO(project.target_date))}`
                      : 'Past due date'}
                  </p>
                </div>
              </div>
            )}

            {/* Team */}
            {(project.creative?.full_name || project.editor?.full_name) && (
              <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
                <Users size={13} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">Your Team</p>
                  <div className="flex flex-wrap gap-3">
                    <TeamPill label="Photographer" name={project.creative?.full_name} icon={Camera}   color="bg-purple-400" />
                    <TeamPill label="Editor"       name={project.editor?.full_name}   icon={Scissors} color="bg-blue-400" />
                  </div>
                </div>
              </div>
            )}

            {/* Notes from team */}
            {project.notes && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <StickyNote size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wide">Note from your team</p>
                  <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{project.notes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Revision stats */}
        {!isPitch && revisions.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-gray-400 mb-4 pb-4 border-b border-gray-100">
            <span className="flex items-center gap-1">
              {project.media_type === 'photo'
                ? <><Camera size={10} /> {revisions.length} photo set{revisions.length !== 1 ? 's' : ''} submitted</>
                : <><Film size={10} /> {revisions.length} cut{revisions.length !== 1 ? 's' : ''} submitted</>
              }
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={10} /> {revisionsLeft} revision{revisionsLeft !== 1 ? 's' : ''} remaining
            </span>
          </div>
        )}

        {/* Revision status — whose turn it is */}
        {!isPitch && !isDelivered && pendingRevision && (
          <div className={`w-full px-4 py-3 rounded-xl border mb-3 ${
            pendingRevision.status === 'pending_client_review'
              ? 'bg-blue-50 border-blue-200'
              : pendingRevision.status === 'pending_editor'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-gray-50 border-gray-100'
          }`}>
            {pendingRevision.status === 'pending_client_review' && (
              <div className="flex items-start gap-2">
                <span className="text-base leading-none">📸</span>
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    {project.editor?.full_name ? `${project.editor.full_name} sent you ` : 'Your editor sent '}
                    {project.media_type === 'photo' ? 'photos' : 'a video'} to review
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">It's your turn — tap below to leave feedback or approve.</p>
                </div>
              </div>
            )}
            {pendingRevision.status === 'pending_editor' && (
              <div className="flex items-start gap-2">
                <span className="text-base leading-none">⏳</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    Your feedback is with {project.editor?.full_name || 'your editor'}
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">They're working on the changes. You'll be notified when a new version is ready.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Primary CTA */}
        {canReview && pendingRevision && (
          <button
            onClick={() => {
              const isPhoto = project.media_type === 'photo' || pendingRevision.media_type === 'photo'
              navigate(isPhoto
                ? `/projects/${project.id}/photo-revision/${pendingRevision.id}`
                : `/projects/${project.id}/revision/${pendingRevision.id}`
              )
            }}
            className="w-full py-3 px-5 rounded-xl font-semibold text-sm text-white bg-accent hover:bg-accent/90 transition-all flex items-center justify-center gap-2 mb-3 shadow-sm shadow-accent/20"
          >
            {project.media_type === 'photo' ? 'Review Photos' : 'Watch & Review'} <ArrowRight size={15} />
          </button>
        )}

        {isDelivered && (
          <div className="w-full py-3 px-5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold text-center flex items-center justify-center gap-2 mb-3">
            <CheckCircle2 size={15} /> Project Complete 🎉
          </div>
        )}

        {!isPitch && !canReview && !isDelivered && !isReadyToPost && !pendingRevision && (
          <div className="w-full py-2.5 px-5 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 text-sm text-center mb-3 flex items-center justify-center gap-2">
            <Clock size={13} /> Your team is on it — we'll notify you when action is needed
          </div>
        )}

        {/* Footage upload */}
        {!isPitch && !isDelivered && (
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-accent font-medium transition-colors"
          >
            <Upload size={11} />
            {showUpload ? 'Hide uploader' : 'Send footage to your team'}
          </button>
        )}
        {showUpload && !isDelivered && (
          <FootageUploader project={project} clientName="" onDone={() => setShowUpload(false)} />
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MyProjects() {
  const { user } = useAuth()
  const [projects,   setProjects]   = useState([])
  const [revisions,  setRevisions]  = useState([])
  const [clientId,   setClientId]   = useState(null)
  const [loading,    setLoading]    = useState(true)

  const loadAll = async () => {
    if (!user?.id) return
    setLoading(true)

    // Try finding client by profile_id first, then fall back to client_creatives
    let { data: client } = await supabase
      .from('clients').select('id, name').eq('profile_id', user.id).maybeSingle()

    if (!client) {
      // Fallback: find via client_creatives (team member assigned to a client)
      const { data: ccRows } = await supabase
        .from('client_creatives').select('client_id').eq('profile_id', user.id).limit(1)
      if (ccRows?.length) {
        const { data: c } = await supabase
          .from('clients').select('id, name').eq('id', ccRows[0].client_id).maybeSingle()
        client = c
      }
    }

    if (!client) {
      console.warn('MyProjects: no client found for user', user.id)
      setLoading(false)
      return
    }
    setClientId(client.id)

    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .select(`
        id, name, stage, status, concept, notes, pitch_notes,
        target_date, due_date, shoot_date, location, max_revisions,
        creative_id, editor_id, media_type
      `)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })

    if (projErr) console.error('MyProjects: projects fetch error', projErr)

    const projects = projData || []
    const projectIds = projects.map((p) => p.id)
    const profileIds = [...new Set(projects.flatMap((p) => [p.creative_id, p.editor_id].filter(Boolean)))]

    const [revRes, profilesRes] = await Promise.all([
      projectIds.length
        ? supabase.from('project_revisions').select('id, project_id, revision_number, status, media_type').in('project_id', projectIds)
        : Promise.resolve({ data: [] }),
      profileIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', profileIds)
        : Promise.resolve({ data: [] }),
    ])

    const profileMap = {}
    ;(profilesRes.data || []).forEach((p) => { profileMap[p.id] = p })

    setProjects(projects.map((p) => ({
      ...p,
      creative: p.creative_id ? profileMap[p.creative_id] : null,
      editor:   p.editor_id   ? profileMap[p.editor_id]   : null,
    })))
    setRevisions(revRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [user])

  const pitchProjects   = projects.filter((p) => p.stage === 'pitch')
  const activeProjects  = projects.filter((p) => p.stage !== 'pitch' && p.stage !== 'delivered' && p.stage !== 'ready_to_post')
  const doneProjects    = projects.filter((p) => p.stage === 'delivered' || p.stage === 'ready_to_post')

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-gray-200" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50/40">
      <div className="max-w-[640px] mx-auto px-6 py-12">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Your Projects</h1>
          <p className="text-gray-400 mt-1.5">Track the progress of your creative work.</p>
        </div>

        {/* Quick stats */}
        {projects.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: 'Active',     value: activeProjects.length, color: 'text-accent' },
              { label: 'Delivered',  value: doneProjects.length,   color: 'text-green-500' },
              { label: 'Total',      value: projects.length,       color: 'text-gray-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center shadow-sm">
            <FolderKanban size={40} className="mx-auto text-gray-200 mb-4" />
            <h2 className="text-lg font-semibold text-gray-400 mb-1">No projects yet</h2>
            <p className="text-sm text-gray-300">Your projects will appear here once your team creates them.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Pitches awaiting approval */}
            {pitchProjects.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={14} className="text-accent" />
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Awaiting Your Approval</h2>
                </div>
                <div className="space-y-5">
                  {pitchProjects.map((p) => (
                    <ProjectCard key={p.id} project={p} revisions={[]} clientId={clientId} userId={user?.id} onRefresh={loadAll} />
                  ))}
                </div>
              </div>
            )}

            {/* Active projects */}
            {activeProjects.length > 0 && (
              <div>
                {pitchProjects.length > 0 && <div className="flex items-center gap-2 mb-4"><h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">In Progress</h2></div>}
                <div className="space-y-5">
                  {activeProjects.map((p) => (
                    <ProjectCard key={p.id} project={p} revisions={revisions.filter((r) => r.project_id === p.id)} clientId={clientId} userId={user?.id} onRefresh={loadAll} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed */}
            {doneProjects.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Completed</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="space-y-5">
                  {doneProjects.map((p) => (
                    <ProjectCard key={p.id} project={p} revisions={revisions.filter((r) => r.project_id === p.id)} clientId={clientId} userId={user?.id} onRefresh={loadAll} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex gap-3 justify-center">
          <Link to="/client/calendar" className="text-xs text-gray-400 hover:text-accent transition-colors">
            See calendar →
          </Link>
        </div>
      </div>
    </div>
  )
}
