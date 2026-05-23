import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Film, Plus, Trash2, Loader2, ChevronRight, X, Upload,
  Link2, FolderOpen, FolderKanban,
} from 'lucide-react'
import { useMedia, uploadMediaFile } from '../hooks/useMedia'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
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

        {/* Mode selector */}
        <div className="flex gap-2 mb-5">
          {[['upload', Upload, 'Upload file'], ['drive', Link2, 'Google Drive link']].map(([m, Icon, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                mode === m ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-muted hover:text-text-primary'
              }`}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'upload' ? (
            <div
              onClick={() => document.getElementById('vl-file')?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}
            >
              <input id="vl-file" type="file" accept={ACCEPTED} className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
              {file ? <p className="text-sm font-medium text-text-primary">{file.name}</p> : (
                <><Upload size={20} className="mx-auto text-text-muted mb-2" /><p className="text-sm text-text-muted">Drop a video or click to browse</p></>
              )}
            </div>
          ) : (
            <div>
              <label className="label">Google Drive URL</label>
              <input type="url" className="input" placeholder="https://drive.google.com/..." value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} />
            </div>
          )}

          <div>
            <label className="label">Title</label>
            <input type="text" className="input" placeholder="e.g. First Cut - Wedding" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="label">Description <span className="text-text-muted font-normal">(optional)</span></label>
            <input type="text" className="input" placeholder="Brief note for the reviewer" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
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

// ─── Single media row ─────────────────────────────────────────────────────────
function MediaRow({ item, onDelete }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 group hover:bg-surface-2/40 transition-colors rounded-xl border border-border bg-white">
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
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
          item.status === 'approved'          ? 'bg-green-50 text-green-700' :
          item.status === 'changes_requested' ? 'bg-amber-50 text-amber-700' :
          'bg-surface-2 text-text-muted'
        }`}>
          {item.status?.replace(/_/g, ' ') || 'pending'}
        </span>
        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 btn-ghost p-2 text-text-muted hover:text-red-500 transition-all"
        >
          <Trash2 size={15} />
        </button>
        <Link to={`/video/${item.id}`} className="btn-primary flex items-center gap-1.5 text-xs">
          Review <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  )
}

// ─── Admin stacked view — all projects + their media at once ──────────────────
function AdminStackedView() {
  const [groups, setGroups] = useState([])     // [{ project, media[] }]
  const [loading, setLoading] = useState(true)
  const [addingTo, setAddingTo] = useState(null) // project being added to

  const fetchAll = async () => {
    setLoading(true)
    // Fetch all media with project info
    const { data } = await supabase
      .from('media')
      .select('*, media_projects(id, title)')
      .order('created_at', { ascending: false })

    // Also fetch all projects that may have no media yet
    const { data: projs } = await supabase
      .from('media_projects')
      .select('id, title')
      .order('created_at', { ascending: false })

    const projectMap = {}
    ;(projs || []).forEach((p) => { projectMap[p.id] = { project: p, media: [] } })
    ;(data || []).forEach((m) => {
      const pid = m.media_projects?.id || m.project_id
      if (pid && projectMap[pid]) projectMap[pid].media.push(m)
      else if (pid) projectMap[pid] = { project: m.media_projects || { id: pid, title: 'Unknown' }, media: [m] }
    })

    setGroups(Object.values(projectMap))
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const handleDelete = async (mediaId) => {
    await supabase.from('media').delete().eq('id', mediaId)
    setGroups((prev) => prev.map((g) => ({ ...g, media: g.media.filter((m) => m.id !== mediaId) })))
  }

  const handleAdd = async ({ title, description, media_url }, projectId) => {
    const { data } = await supabase
      .from('media')
      .insert([{ title, description, media_url, media_type: 'video', project_id: projectId }])
      .select('*, media_projects(id, title)')
      .single()
    if (data) {
      setGroups((prev) => prev.map((g) =>
        g.project.id === projectId ? { ...g, media: [data, ...g.media] } : g
      ))
    }
    setAddingTo(null)
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 size={22} className="animate-spin text-text-muted" /></div>

  if (groups.length === 0) return (
    <div className="card p-12 text-center">
      <FolderOpen size={36} className="mx-auto text-surface-3 mb-3" />
      <h3 className="text-sm font-semibold text-text-primary mb-1">No video review projects yet</h3>
      <p className="text-sm text-text-muted">They'll show up here once created.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {groups.map(({ project, media }) => (
        <div key={project.id} className="bg-white rounded-2xl border border-border overflow-hidden">
          {/* Project header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface-2/40">
            <div className="flex items-center gap-2">
              <FolderKanban size={15} className="text-text-muted" />
              <p className="text-sm font-semibold text-text-primary">{project.title}</p>
              <span className="text-xs text-text-muted bg-surface-2 px-1.5 py-0.5 rounded-full">
                {media.length} video{media.length !== 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={() => setAddingTo(project.id)}
              className="btn-primary text-xs flex items-center gap-1"
            >
              <Plus size={12} /> Add Video
            </button>
          </div>

          {/* Media rows */}
          {media.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8 italic">No videos yet</p>
          ) : (
            <div className="p-3 space-y-2">
              {media.map((item) => (
                <MediaRow key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      ))}

      {addingTo && (
        <AddMediaModal
          projectId={addingTo}
          onAdd={(data) => handleAdd(data, addingTo)}
          onClose={() => setAddingTo(null)}
        />
      )}
    </div>
  )
}

// ─── Non-admin tabbed view ────────────────────────────────────────────────────
function TabbedView() {
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [showAddMedia, setShowAddMedia] = useState(false)

  useEffect(() => {
    supabase.from('media_projects').select('id, title').order('created_at', { ascending: false })
      .then(({ data }) => {
        setProjects(data || [])
        if (data?.length) setSelectedProjectId(data[0].id)
        setProjectsLoading(false)
      })
  }, [])

  const activeProjectId = selectedProjectId || projects[0]?.id || null
  const { media, loading: mediaLoading, addMedia, deleteMedia } = useMedia(activeProjectId)
  const activeProject = projects.find((p) => p.id === activeProjectId)

  if (projectsLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-text-muted" /></div>

  if (projects.length === 0) return (
    <div className="card p-12 text-center">
      <FolderOpen size={36} className="mx-auto text-surface-3 mb-3" />
      <h3 className="text-sm font-semibold text-text-primary mb-1">No projects yet</h3>
      <p className="text-sm text-text-muted">Your assigned projects will appear here.</p>
    </div>
  )

  return (
    <>
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

      {mediaLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : media.length === 0 ? (
        <div className="card p-12 text-center">
          <Film size={36} className="mx-auto text-surface-3 mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">No videos in {activeProject?.title}</h3>
          <p className="text-sm text-text-muted mb-4">Upload a video to get started</p>
          <button onClick={() => setShowAddMedia(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={14} /> Add Video
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {media.map((item) => (
            <MediaRow key={item.id} item={item} onDelete={deleteMedia} />
          ))}
        </div>
      )}

      {showAddMedia && activeProjectId && (
        <AddMediaModal projectId={activeProjectId} onAdd={addMedia} onClose={() => setShowAddMedia(false)} />
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VideoList() {
  const { isAdmin } = useAuth()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Video Review</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {isAdmin ? 'All video review projects across your team' : 'Upload videos and leave timestamped feedback'}
          </p>
        </div>
      </div>

      {isAdmin ? <AdminStackedView /> : <TabbedView />}
    </div>
  )
}
