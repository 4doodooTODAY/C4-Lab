import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, FolderKanban, ArrowRight, CheckCircle2, Upload, Film, X, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { uploadToR2, fmtSpeed, fmtEta } from '../../lib/r2'

function fmtBytes(bytes) {
  if (!bytes) return ''
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB'
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(1) + ' KB'
}

// ── Status helpers ────────────────────────────────────────────────────────────
function getStatusText(project, pendingRevision) {
  if (project.stage === 'delivered')
    return { text: 'Your project is complete!', emoji: '🎉' }
  if (pendingRevision?.status === 'pending_client_review') {
    const n = pendingRevision.revision_number
    return { text: n === 1 ? 'Your first cut is ready to review!' : `Revision ${n} is ready!`, emoji: '🎬' }
  }
  if (project.stage === 'production')
    return { text: 'Shoot day! Your footage is being captured.', emoji: '🎥' }
  if (project.stage === 'post_production')
    return { text: 'Your footage is in the edit.', emoji: '✂️' }
  if (project.stage === 'review' || project.stage === 'revisions') {
    if (pendingRevision?.status === 'pending_creative_review')
      return { text: 'The team is reviewing your video before sending it over.', emoji: '' }
    if (pendingRevision?.status === 'pending_editor')
      return { text: 'Your feedback is being addressed.', emoji: '' }
    return { text: 'Your video is in review.', emoji: '' }
  }
  return { text: "We're getting everything set up for your shoot.", emoji: '📋' }
}

function getStep(project, pendingRevision) {
  const stage = project.stage
  if (stage === 'delivered') return 4
  if (stage === 'review' || stage === 'revisions') {
    if (pendingRevision?.status === 'pending_client_review') return 3
    return 2
  }
  if (stage === 'post_production') return 2
  if (stage === 'production') return 1
  return 0
}

const STEPS = ['Shoot', 'Edit', 'Review', 'Done']

function StepDots({ activeStep }) {
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-col items-center gap-1">
          <div className={`w-2.5 h-2.5 rounded-full transition-all ${
            i < activeStep ? 'bg-green-400' : i === activeStep ? 'bg-accent' : 'bg-gray-200'
          }`} />
          <span className={`text-[9px] font-semibold ${
            i === activeStep ? 'text-accent' : i < activeStep ? 'text-green-500' : 'text-gray-300'
          }`}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Inline footage uploader ───────────────────────────────────────────────────
function FootageUploader({ project, clientName, onDone }) {
  const { user } = useAuth()
  const fileInputRef = useRef()
  const [files,       setFiles]      = useState([])
  const [uploading,   setUploading]  = useState(false)
  const [progress,    setProgress]   = useState(0)
  const [stats,       setStats]      = useState(null)
  const [error,       setError]      = useState('')
  const [done,        setDone]       = useState(false)

  const handleFiles = (incoming) => {
    setFiles((prev) => [...prev, ...Array.from(incoming)])
  }

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of files) {
        setProgress(0)
        setStats(null)
        const { publicUrl } = await uploadToR2({
          file,
          category:    'client-footage',
          clientName:  clientName || '',
          projectName: project.name,
          folderType:  'shoots',
          onProgress:  setProgress,
          onStats:     setStats,
        })
        await supabase.from('shoot_uploads').insert({
          project_id:  project.id,
          file_url:    publicUrl,
          file_name:   file.name,
          file_size:   file.size,
          uploaded_by: user.id,
        })
      }
      setDone(true)
      setFiles([])
      setTimeout(() => { setDone(false); onDone?.() }, 2000)
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 font-medium py-2">
        <CheckCircle2 size={16} /> Footage uploaded! The team has been notified.
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Upload Footage</p>

      {files.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <Film size={13} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-700 truncate flex-1">{f.name}</span>
              <span className="text-xs text-gray-400">{fmtBytes(f.size)}</span>
              {!uploading && (
                <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                  <X size={12} className="text-gray-400 hover:text-red-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-all"
        >
          <Upload size={18} className="mx-auto text-gray-300 mb-1.5" />
          <p className="text-sm text-gray-400">Drop files here or <span className="text-accent font-medium">browse</span></p>
          <p className="text-xs text-gray-300 mt-0.5">Video, photo, ZIP</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*,.zip,.mov,.mp4"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploading && (
        <div className="mt-2 mb-2">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Uploading…</span>
            <div className="flex gap-2">
              {stats && <span className="font-medium text-gray-600">{fmtSpeed(stats.speed)}</span>}
              {stats?.eta != null && <span>{fmtEta(stats.eta)}</span>}
              <span>{progress}%</span>
            </div>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {files.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-3 w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-accent/90 transition-colors"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? 'Uploading…' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, revisions, clientName }) {
  const navigate = useNavigate()
  const [showUpload, setShowUpload] = useState(false)

  const pendingRevision = revisions
    .sort((a, b) => b.revision_number - a.revision_number)[0]

  const { text, emoji } = getStatusText(project, pendingRevision)
  const step = getStep(project, pendingRevision)

  const canReview  = pendingRevision?.status === 'pending_client_review'
  const isDelivered = project.stage === 'delivered'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-all">
      <h2 className="text-xl font-bold text-gray-900 mb-1">{project.name}</h2>
      <p className="text-base text-gray-500 mb-5">
        {text} {emoji && <span>{emoji}</span>}
      </p>

      <div className="mb-6">
        <StepDots activeStep={step} />
      </div>

      {/* CTAs */}
      {canReview && pendingRevision && (
        <button
          onClick={() => navigate(`/projects/${project.id}/revision/${pendingRevision.id}`)}
          className="w-full py-3 px-5 rounded-xl font-semibold text-sm text-white bg-accent hover:bg-accent/90 transition-all flex items-center justify-center gap-2 mb-3"
        >
          Review Video <ArrowRight size={16} />
        </button>
      )}

      {isDelivered && (
        <div className="w-full py-3 px-5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold text-center flex items-center justify-center gap-2 mb-3">
          <CheckCircle2 size={16} /> Project Delivered
        </div>
      )}

      {!canReview && !isDelivered && (
        <div className="w-full py-2.5 px-5 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 text-sm text-center mb-3">
          No action needed right now
        </div>
      )}

      {/* Upload footage toggle */}
      {!isDelivered && (
        <>
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="w-full text-xs text-gray-400 hover:text-accent font-medium flex items-center justify-center gap-1.5 mt-1 transition-colors"
          >
            <Upload size={12} />
            {showUpload ? 'Hide uploader' : 'Upload footage for this project'}
          </button>

          {showUpload && (
            <FootageUploader
              project={project}
              clientName={clientName}
              onDone={() => setShowUpload(false)}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MyProjects() {
  const { user } = useAuth()
  const [projects,    setProjects]    = useState([])
  const [revisions,   setRevisions]   = useState([])
  const [clientName,  setClientName]  = useState('')
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    // Use profile_id (not user_id) — that's what the invite flow sets
    supabase
      .from('clients')
      .select('id, name')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(async ({ data: client }) => {
        if (!client) { setLoading(false); return }
        setClientName(client.name || '')
        const [projRes, revRes] = await Promise.all([
          supabase
            .from('projects')
            .select('id, name, stage, revision_count')
            .eq('client_id', client.id)
            .neq('stage', 'archived')
            .order('created_at', { ascending: false }),
          supabase
            .from('project_revisions')
            .select('id, project_id, revision_number, status'),
        ])
        setProjects(projRes.data || [])
        setRevisions(revRes.data || [])
        setLoading(false)
      })
  }, [user])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-gray-300" />
    </div>
  )

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[600px] mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Your Projects</h1>
          <p className="text-gray-400 mt-2 text-base">Track the progress of your creative work.</p>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20">
            <FolderKanban size={40} className="mx-auto text-gray-200 mb-4" />
            <h2 className="text-lg font-semibold text-gray-400 mb-1">No projects yet</h2>
            <p className="text-sm text-gray-300">Your projects will appear here once they're created.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                revisions={revisions.filter((r) => r.project_id === p.id)}
                clientName={clientName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
