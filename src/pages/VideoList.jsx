import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Film, Plus, Trash2, Loader2, ChevronRight, X, Upload,
  Link2, FolderOpen, FolderKanban, ShieldCheck, UserCheck, Clock, ArrowRight, Camera,
} from 'lucide-react'
import { useMedia, uploadMediaFile } from '../hooks/useMedia'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDistanceToNow } from 'date-fns'


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
              <input id="vl-file" type="file" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
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

// ─── Admin "Projects in Review" — split by who's holding it ───────────────────
// A project sits in review until its latest revision is approved. We bucket by
// the latest revision's status: waiting on admin approval vs. in the client's
// hands. Anything still being edited internally shows in a muted third group so
// nothing in flight disappears; approved/delivered projects drop off entirely.
function ReviewProjectRow({ project, latest }) {
  const navigate = useNavigate()
  const clientName = project.clients?.contact_name || project.clients?.name || '—'
  const isPhoto = project.media_type === 'photo'
  const TypeIcon = isPhoto ? Camera : Film

  // Where to send the admin: if a cut has been uploaded, open the revision
  // review screen directly. If we're still waiting on the editor's first cut
  // (pending_editor) there's nothing to review yet — open the project workflow.
  const hasCut = latest && latest.status !== 'pending_editor'
  const open = () => {
    if (hasCut && project.stage !== 'delivered') {
      navigate(isPhoto
        ? `/projects/${project.id}/photo-revision/${latest.id}`
        : `/projects/${project.id}/revision/${latest.id}`)
    } else {
      navigate(`/projects/${project.id}/creative`)
    }
  }

  const isFirstCut = latest && latest.revision_number === 1
  const revLabel = latest
    ? (isFirstCut ? 'First Cut' : `Revision ${latest.revision_number}`)
    : '—'

  return (
    <div className="flex items-center gap-4 px-4 py-3 group hover:bg-surface-2/40 transition-colors rounded-xl border border-border bg-white">
      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
        <TypeIcon size={18} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate">{project.name}</p>
        <p className="text-xs text-text-muted truncate">{clientName}</p>
      </div>
      {/* Prominent cut / revision indicator */}
      <span className={`shrink-0 text-sm font-bold px-3 py-1.5 rounded-lg ${
        isFirstCut ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
      }`}>
        {revLabel}
      </span>
      <button onClick={open} className="btn-primary flex items-center gap-1.5 text-xs shrink-0">
        Open <ArrowRight size={13} />
      </button>
    </div>
  )
}

function ReviewSection({ icon: Icon, iconClass, title, subtitle, items, emptyText }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={iconClass} />
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      <p className="text-xs text-text-muted mb-4">{subtitle}</p>
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8 text-center">
          <p className="text-sm text-text-muted">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(({ project, latest }) => (
            <ReviewProjectRow key={project.id} project={project} latest={latest} />
          ))}
        </div>
      )}
    </section>
  )
}

function AdminReviewView() {
  const [adminHands,  setAdminHands]  = useState([])
  const [clientHands, setClientHands] = useState([])
  const [teamHands,   setTeamHands]   = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const [{ data: projs }, { data: revs }] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, media_type, stage, status, clients(name, contact_name)')
          .neq('status', 'archived'),
        supabase
          .from('project_revisions')
          .select('id, project_id, revision_number, status'),
      ])

      // Latest revision per project
      const latestByProject = {}
      ;(revs || []).forEach((r) => {
        const cur = latestByProject[r.project_id]
        if (!cur || r.revision_number > cur.revision_number) latestByProject[r.project_id] = r
      })

      const admin = [], client = [], team = []
      ;(projs || []).forEach((project) => {
        const latest = latestByProject[project.id]
        if (!latest) return
        switch (latest.status) {
          // A cut has been uploaded and is not yet with the client — admin needs
          // to check it before it goes out (includes internal creative review).
          case 'pending_admin_review':
          case 'pending_photographer_review':
          case 'pending_creative_review':
            admin.push({ project, latest }); break
          // Sent to the client — waiting on their comments or approval.
          case 'pending_client_review':
            client.push({ project, latest }); break
          // In the editor's hands — waiting on an upload (first cut OR a new
          // revision after client feedback).
          case 'pending_editor':
            team.push({ project, latest }); break
          default:
            // approved / other → no longer in review, drop it
            break
        }
      })

      setAdminHands(admin)
      setClientHands(client)
      setTeamHands(team)
      setLoading(false)
    }
    run()
  }, [])

  if (loading) return (
    <div className="flex justify-center py-24"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
  )

  const totalInReview = adminHands.length + clientHands.length + teamHands.length
  if (totalInReview === 0) return (
    <div className="card p-12 text-center">
      <ShieldCheck size={36} className="mx-auto text-surface-3 mb-3" />
      <h3 className="text-sm font-semibold text-text-primary mb-1">Nothing in review right now</h3>
      <p className="text-sm text-text-muted">Projects waiting on approval will appear here.</p>
    </div>
  )

  return (
    <div>
      <ReviewSection
        icon={ShieldCheck}
        iconClass="text-orange-500"
        title="Needs your review before the client"
        subtitle="A cut has been uploaded — check and approve it before it goes to the client."
        items={adminHands}
        emptyText="Nothing waiting on your approval."
      />
      <ReviewSection
        icon={UserCheck}
        iconClass="text-blue-500"
        title="In the client's hands"
        subtitle="Sent to the client — waiting on their revision comments or approval."
        items={clientHands}
        emptyText="Nothing with clients right now."
      />
      {teamHands.length > 0 && (
        <ReviewSection
          icon={Clock}
          iconClass="text-text-muted"
          title="Waiting on the editor"
          subtitle="In the editor's hands — waiting on a cut to be uploaded, whether it's the first cut or a new revision."
          items={teamHands}
          emptyText="Nothing in progress."
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VideoList() {
  const { isAdmin } = useAuth()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Review</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {isAdmin ? 'Every project currently in review — grouped by who needs to act next' : 'Upload videos and leave timestamped feedback'}
          </p>
        </div>
      </div>

      {isAdmin ? <AdminReviewView /> : <TabbedView />}
    </div>
  )
}
