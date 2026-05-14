import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Upload, Check, Film, StickyNote,
  Download, Play, FileVideo, AlertCircle, CalendarDays, MapPin,
  ChevronRight, X
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { updateProject } from '../../hooks/useProjects'
import Avatar from '../../components/ui/Avatar'
import { format, parseISO } from 'date-fns'

function fmtBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const REVISION_STATUS_LABELS = {
  pending_creative_review: 'Needs Your Review',
  pending_client_review:   'Client Reviewing',
  pending_editor:          'Awaiting Revisions',
  approved:                'Approved',
}

const REVISION_STATUS_COLORS = {
  pending_creative_review: 'bg-amber-50 text-amber-700',
  pending_client_review:   'bg-blue-50 text-blue-700',
  pending_editor:          'bg-purple-50 text-purple-700',
  approved:                'bg-green-50 text-green-700',
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

// ── Creative shooter view ─────────────────────────────────────────────────────
function CreativeShooterView({ project, uploads, shootNotes, revisions, onRefresh }) {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [files,       setFiles]       = useState([])
  const [uploading,   setUploading]   = useState(false)
  const [uploadProgress, setProgress] = useState({})
  const [uploadError, setUploadError] = useState('')
  const [markingDone, setMarkingDone] = useState(false)

  const [noteContent, setNoteContent] = useState('')
  const [savingNote,  setSavingNote]  = useState(false)
  const [noteSaved,   setNoteSaved]   = useState(false)

  const stage = project.stage
  const pendingReview = revisions.find((r) => r.status === 'pending_creative_review')

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    const progressMap = {}
    files.forEach((f) => { progressMap[f.name] = 0 })
    setProgress({ ...progressMap })

    try {
      for (const file of files) {
        const path = `${project.id}/${Date.now()}-${file.name}`
        const { error: storageErr } = await supabase.storage
          .from('shoot-footage')
          .upload(path, file, { upsert: true })

        if (storageErr) throw storageErr

        const { data: urlData } = supabase.storage
          .from('shoot-footage')
          .getPublicUrl(path)

        await supabase.from('shoot_uploads').insert({
          project_id:  project.id,
          file_url:    urlData?.publicUrl || path,
          file_name:   file.name,
          file_size:   file.size,
          uploaded_by: profile.id,
        })

        setProgress((p) => ({ ...p, [file.name]: 100 }))
      }
      setFiles([])
      onRefresh()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleMarkDone = async () => {
    setMarkingDone(true)
    try {
      await updateProject(project.id, { stage: 'post_production' })
      onRefresh()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setMarkingDone(false)
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
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Shoot Info */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Shoot Info</h2>
        <div className="grid grid-cols-2 gap-4">
          {project.shoot_date && (
            <div>
              <p className="text-xs text-text-muted flex items-center gap-1 mb-1"><CalendarDays size={11} /> Shoot Date</p>
              <p className="text-sm font-semibold text-text-primary">
                {format(parseISO(project.shoot_date), 'MMMM d, yyyy')}
              </p>
            </div>
          )}
          {project.location && (
            <div>
              <p className="text-xs text-text-muted flex items-center gap-1 mb-1"><MapPin size={11} /> Location</p>
              <p className="text-sm font-semibold text-text-primary">{project.location}</p>
            </div>
          )}
          {project.clients && (
            <div>
              <p className="text-xs text-text-muted mb-1">Client</p>
              <p className="text-sm font-semibold text-text-primary">
                {project.clients.contact_name || project.clients.name}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Revision ready for review */}
      {pendingReview && (
        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Revision {pendingReview.revision_number} is ready for your review
              </p>
              <p className="text-xs text-text-muted mt-1">
                Review the video and leave timestamped comments before sending to the client.
              </p>
            </div>
            <button
              onClick={() => navigate(`/projects/${project.id}/revision/${pendingReview.id}`)}
              className="btn-primary shrink-0 flex items-center gap-2"
            >
              Review Revision <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Upload Footage */}
      {(stage === 'production' || stage === 'post_production') && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Upload size={14} className="text-text-muted" /> Upload Footage
          </h2>

          {uploads.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-xs text-text-muted font-medium">{uploads.length} file{uploads.length !== 1 ? 's' : ''} uploaded</p>
              {uploads.map((f) => (
                <div key={f.id} className="flex items-center gap-3 py-1.5">
                  <Film size={14} className="text-text-muted shrink-0" />
                  <span className="text-sm text-text-primary truncate flex-1">{f.file_name}</span>
                  <span className="text-xs text-text-muted">{fmtBytes(f.file_size)}</span>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 ? (
            <div className="space-y-2 mb-4">
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

          {uploadError && (
            <p className="text-xs text-red-500 mt-2">{uploadError}</p>
          )}

          <div className="flex gap-2 mt-4">
            {files.length > 0 && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading…' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
              </button>
            )}
            {uploads.length > 0 && stage === 'production' && (
              <button
                onClick={handleMarkDone}
                disabled={markingDone}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
              >
                {markingDone ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Mark Footage as Uploaded
              </button>
            )}
          </div>
        </div>
      )}

      {/* Shoot Notes */}
      {(stage === 'post_production' || uploads.length > 0) && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <StickyNote size={14} className="text-text-muted" /> Shoot Notes
          </h2>

          {shootNotes.length > 0 && (
            <div className="space-y-3 mb-4">
              {shootNotes.map((n) => (
                <div key={n.id} className="bg-surface-2 rounded-xl p-3">
                  <p className="text-xs text-text-muted mb-1">
                    {format(new Date(n.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
          )}

          <textarea
            className="input w-full min-h-[120px] resize-y"
            placeholder="Write your shoot recap, notes, anything the editor should know…"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
          />
          <button
            onClick={handleSaveNote}
            disabled={savingNote || !noteContent.trim()}
            className="btn-primary mt-3 flex items-center gap-2 disabled:opacity-50"
          >
            {savingNote ? <Loader2 size={14} className="animate-spin" /> : noteSaved ? <Check size={14} /> : <StickyNote size={14} />}
            {noteSaved ? 'Saved!' : 'Save Note'}
          </button>
        </div>
      )}

      {/* Previous revisions */}
      {revisions.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <FileVideo size={14} className="text-text-muted" /> Revisions
          </h2>
          <div className="space-y-3">
            {revisions.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                <FileVideo size={16} className="text-text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Revision {r.revision_number}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${REVISION_STATUS_COLORS[r.status] || 'bg-surface-2 text-text-muted'}`}>
                    {REVISION_STATUS_LABELS[r.status] || r.status}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/projects/${project.id}/revision/${r.id}`)}
                  className="btn-secondary text-xs flex items-center gap-1"
                >
                  View <ChevronRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Editor view ───────────────────────────────────────────────────────────────
function EditorView({ project, uploads, shootNotes, revisions, onRefresh }) {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [revisionFile,    setRevisionFile]    = useState(null)
  const [uploading,       setUploading]       = useState(false)
  const [uploadError,     setUploadError]     = useState('')
  const fileInputRef = useRef()

  const stage       = project.stage
  const latestRev   = revisions.sort((a, b) => b.revision_number - a.revision_number)[0]
  const nextRevNum  = latestRev ? latestRev.revision_number + 1 : 1
  const canUpload   = stage === 'post_production' || (latestRev && latestRev.status === 'pending_editor')
  const acceptedComments = [] // fetched when needed per revision

  const handleUploadRevision = async () => {
    if (!revisionFile) return
    setUploading(true)
    setUploadError('')
    try {
      const path = `${project.id}/revision-${nextRevNum}.mp4`
      const { error: storageErr } = await supabase.storage
        .from('revision-videos')
        .upload(path, revisionFile, { upsert: true })
      if (storageErr) throw storageErr

      const { data: urlData } = supabase.storage
        .from('revision-videos')
        .getPublicUrl(path)

      await supabase.from('project_revisions').insert({
        project_id:      project.id,
        revision_number: nextRevNum,
        video_url:       urlData?.publicUrl || path,
        status:          'pending_creative_review',
        uploaded_by:     profile.id,
      })

      // Update project stage — advance to review when editor uploads a revision
      await updateProject(project.id, { stage: 'review', revision_count: nextRevNum })

      setRevisionFile(null)
      onRefresh()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Shoot Info */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Project Info</h2>
        <div className="grid grid-cols-2 gap-4">
          {project.shoot_date && (
            <div>
              <p className="text-xs text-text-muted flex items-center gap-1 mb-1"><CalendarDays size={11} /> Shoot Date</p>
              <p className="text-sm font-semibold text-text-primary">
                {format(parseISO(project.shoot_date), 'MMMM d, yyyy')}
              </p>
            </div>
          )}
          {project.clients && (
            <div>
              <p className="text-xs text-text-muted mb-1">Client</p>
              <p className="text-sm font-semibold text-text-primary">
                {project.clients.contact_name || project.clients.name}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footage & Notes */}
      {uploads.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Film size={14} className="text-text-muted" /> Source Footage
          </h2>
          <div className="space-y-2 mb-4">
            {uploads.map((f) => (
              <div key={f.id} className="flex items-center gap-3 py-1.5">
                <Film size={14} className="text-text-muted shrink-0" />
                <span className="text-sm text-text-primary truncate flex-1">{f.file_name}</span>
                <span className="text-xs text-text-muted">{fmtBytes(f.file_size)}</span>
                {f.file_url && (
                  <a
                    href={f.file_url}
                    download
                    className="text-accent hover:text-accent/80 transition-colors"
                    title="Download"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>

          {shootNotes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted mb-2">Shoot Notes from Creative</p>
              {shootNotes.map((n) => (
                <div key={n.id} className="bg-surface-2 rounded-xl p-3 mb-2">
                  <p className="text-xs text-text-muted mb-1">{format(new Date(n.created_at), 'MMM d, yyyy')}</p>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Revision */}
      {canUpload && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
            <FileVideo size={14} className="text-text-muted" /> Upload Revision {nextRevNum}
          </h2>
          <p className="text-xs text-text-muted mb-4">
            {nextRevNum > 1 ? `Address the accepted comments from Revision ${nextRevNum - 1} and upload the new cut.` : 'Upload the first edit for creative review.'}
          </p>

          {latestRev && latestRev.status === 'pending_editor' && (
            <RevisionCommentsList revisionId={latestRev.id} />
          )}

          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-4 ${
              revisionFile ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileVideo size={24} className="mx-auto text-text-muted mb-2" />
            {revisionFile ? (
              <>
                <p className="text-sm font-medium text-text-primary">{revisionFile.name}</p>
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

          {uploadError && (
            <p className="text-xs text-red-500 mb-3">{uploadError}</p>
          )}

          <button
            onClick={handleUploadRevision}
            disabled={!revisionFile || uploading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Uploading…' : `Upload Revision ${nextRevNum}`}
          </button>
        </div>
      )}

      {/* Previous Revisions */}
      {revisions.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <FileVideo size={14} className="text-text-muted" /> All Revisions
          </h2>
          <div className="space-y-3">
            {revisions.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                <FileVideo size={16} className="text-text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Revision {r.revision_number}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${REVISION_STATUS_COLORS[r.status] || 'bg-surface-2 text-text-muted'}`}>
                    {REVISION_STATUS_LABELS[r.status] || r.status}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/projects/${project.id}/revision/${r.id}`)}
                  className="btn-secondary text-xs flex items-center gap-1"
                >
                  View <ChevronRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Accepted comments list for editor ─────────────────────────────────────────
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
      <p className="text-xs font-semibold text-amber-800 mb-3">Accepted comments to address ({comments.length})</p>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProjectWorkflow() {
  const { id } = useParams()
  const { profile } = useAuth()

  const [project,    setProject]    = useState(null)
  const [uploads,    setUploads]    = useState([])
  const [shootNotes, setShootNotes] = useState([])
  const [revisions,  setRevisions]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  const fetchAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [projRes, uploadsRes, notesRes, revsRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, stage, shoot_date, location, creative_id, editor_id, revision_count, clients(name, contact_name)')
          .eq('id', id)
          .single(),
        supabase.from('shoot_uploads').select('*').eq('project_id', id).order('created_at'),
        supabase.from('shoot_notes').select('*').eq('project_id', id).order('created_at'),
        supabase.from('project_revisions').select('*').eq('project_id', id).order('revision_number'),
      ])
      if (projRes.error) throw projRes.error
      setProject(projRes.data)
      setUploads(uploadsRes.data || [])
      setShootNotes(notesRes.data || [])
      setRevisions(revsRes.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [id])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  if (error || !project) return (
    <div className="p-8">
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6">
        <ArrowLeft size={14} /> Back to Projects
      </Link>
      <p className="text-sm text-text-muted">{error || 'Project not found.'}</p>
    </div>
  )

  const isCreative = project.creative_id === profile?.id
  const isEditor   = project.editor_id === profile?.id

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-5 transition-colors">
        <ArrowLeft size={14} /> My Projects
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
        {project.clients && (
          <p className="text-sm text-text-muted mt-1">
            {project.clients.contact_name || project.clients.name}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          {isCreative && isEditor && (
            <span className="text-xs bg-accent/10 text-accent font-semibold px-2.5 py-0.5 rounded-full">Creative & Editor</span>
          )}
          {isCreative && !isEditor && (
            <span className="text-xs bg-amber-50 text-amber-700 font-semibold px-2.5 py-0.5 rounded-full">Creative / Shooter</span>
          )}
          {isEditor && !isCreative && (
            <span className="text-xs bg-green-50 text-green-700 font-semibold px-2.5 py-0.5 rounded-full">Editor</span>
          )}
        </div>
      </div>

      {isEditor && !isCreative ? (
        <EditorView
          project={project}
          uploads={uploads}
          shootNotes={shootNotes}
          revisions={revisions}
          onRefresh={fetchAll}
        />
      ) : (
        <CreativeShooterView
          project={project}
          uploads={uploads}
          shootNotes={shootNotes}
          revisions={revisions}
          onRefresh={fetchAll}
        />
      )}
    </div>
  )
}
