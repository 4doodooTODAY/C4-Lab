import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Film, Plus, Trash2, Loader2, ChevronRight, X, Upload, Link2, FolderOpen } from 'lucide-react'
import { useMedia, uploadMediaFile } from '../hooks/useMedia'
import { useProjects } from '../hooks/useProjects'
import { formatDistanceToNow } from 'date-fns'

const ACCEPTED = 'video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska'

// ─── Add Media Modal ──────────────────────────────────────────────────────────

function AddMediaModal({ projectId, onAdd, onClose }) {
  const [mode, setMode] = useState('upload')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('video/')) { setError('Please select a video file.'); return }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
    setError('')
  }

  const canSubmit = title.trim() && (mode === 'upload' ? file : driveUrl.trim())

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setUploading(true)
    setError('')
    try {
      const media_url = mode === 'upload' ? await uploadMediaFile(file) : driveUrl.trim()
      await onAdd({ title: title.trim(), description: description.trim(), media_url })
      onClose()
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-text-primary">Add Video</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Brand Film Draft 1" className="input" autoFocus required />
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {[['upload', Upload, 'Upload File'], ['drive', Link2, 'Google Drive']].map(([m, Icon, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 font-medium transition-colors ${
                  mode === m ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-2'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>

          {/* Upload zone */}
          {mode === 'upload' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => document.getElementById('media-file-input').click()}
              className={`flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                dragging ? 'border-accent bg-accent/5' : file
                  ? 'border-green-400 bg-green-50' : 'border-border hover:border-accent/50 hover:bg-surface-2'}`}
            >
              <input id="media-file-input" type="file" accept={ACCEPTED} className="hidden"
                onChange={(e) => handleFile(e.target.files[0])} />
              {file ? (
                <>
                  <Film size={24} className="text-green-500" />
                  <p className="text-sm font-medium text-text-primary text-center px-4 truncate max-w-full">{file.name}</p>
                  <p className="text-xs text-text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</p>
                </>
              ) : (
                <>
                  <Upload size={24} className="text-text-muted" />
                  <p className="text-sm font-medium text-text-primary">Drop a video here</p>
                  <p className="text-xs text-text-muted">or click to browse · MP4, MOV, WebM</p>
                </>
              )}
            </div>
          )}

          {/* Drive URL */}
          {mode === 'drive' && (
            <div>
              <input type="url" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/…" className="input font-mono text-xs" />
              <p className="text-xs text-text-muted mt-1">
                File must be shared as "Anyone with the link can view". Best for files under 100 MB.
              </p>
            </div>
          )}

          <div>
            <label className="label">Notes <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about this video…" rows={2} className="input resize-none" />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          {uploading && mode === 'upload' && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 size={13} className="animate-spin shrink-0" />
              Uploading… this may take a moment for large files
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={uploading}>Cancel</button>
            <button type="submit" disabled={!canSubmit || uploading}
              className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {uploading ? 'Uploading…' : 'Add Video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── New Project Modal ────────────────────────────────────────────────────────

function NewProjectModal({ onAdd, onClose }) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await onAdd(title.trim())
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create project')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-text-primary">New Project</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Project Name</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Nike Summer Campaign" className="input" autoFocus required />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={!title.trim() || saving}
              className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VideoList() {
  const { projects, loading: projectsLoading, addProject } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [showAddMedia, setShowAddMedia] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)

  const activeProjectId = selectedProjectId || projects[0]?.id || null
  const { media, loading: mediaLoading, addMedia, deleteMedia } = useMedia(activeProjectId)

  // Auto-select first project when loaded
  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Video Review</h1>
          <p className="text-sm text-text-secondary mt-0.5">Upload videos and leave timestamped feedback</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNewProject(true)} className="btn-secondary flex items-center gap-2">
            <FolderOpen size={15} /> New Project
          </button>
          {activeProjectId && (
            <button onClick={() => setShowAddMedia(true)} className="btn-primary flex items-center gap-2">
              <Plus size={15} /> Add Video
            </button>
          )}
        </div>
      </div>

      {/* Project tabs */}
      {projectsLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderOpen size={36} className="mx-auto text-surface-3 mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">No projects yet</h3>
          <p className="text-sm text-text-muted mb-4">Create a project to start organizing your video reviews</p>
          <button onClick={() => setShowNewProject(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={14} /> Create Project
          </button>
        </div>
      ) : (
        <>
          {/* Project selector */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  p.id === activeProjectId
                    ? 'bg-accent text-white'
                    : 'bg-white border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {p.title}
              </button>
            ))}
          </div>

          {/* Media list */}
          {mediaLoading ? (
            <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
          ) : media.length === 0 ? (
            <div className="card p-12 text-center">
              <Film size={36} className="mx-auto text-surface-3 mb-3" />
              <h3 className="text-sm font-semibold text-text-primary mb-1">No videos in {activeProject?.title}</h3>
              <p className="text-sm text-text-muted mb-4">Upload a video or paste a Google Drive link to get started</p>
              <button onClick={() => setShowAddMedia(true)} className="btn-primary inline-flex items-center gap-2">
                <Plus size={14} /> Add Video
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {media.map((item) => (
                <div key={item.id} className="card flex items-center gap-4 px-4 py-3 group hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Film size={18} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{item.title}</p>
                    {item.description && <p className="text-xs text-text-muted truncate">{item.description}</p>}
                    <p className="text-xs text-text-muted/70 mt-0.5">
                      Added {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => deleteMedia(item.id)}
                      className="opacity-0 group-hover:opacity-100 btn-ghost p-2 text-text-muted hover:text-red-500 transition-all">
                      <Trash2 size={15} />
                    </button>
                    <Link to={`/video/${item.id}`} className="btn-primary flex items-center gap-1.5">
                      Review <ChevronRight size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showAddMedia && activeProjectId && (
        <AddMediaModal projectId={activeProjectId} onAdd={addMedia} onClose={() => setShowAddMedia(false)} />
      )}
      {showNewProject && (
        <NewProjectModal onAdd={addProject} onClose={() => setShowNewProject(false)} />
      )}
    </div>
  )
}
