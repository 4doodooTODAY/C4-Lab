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
  if (stage === 'delivered') return 5
  if (stage === 'review' || stage === 'revisions') {
    if (pendingRevision?.status === 'pending_client_review') return 4
    return 3
  }
  if (stage === 'post_production') return 3
  if (stage === 'production') return 2
  if (stage === 'pre_production') return 1
  return 0 // briefing / planning
}

const STEPS = ['Planning', 'Shoot', 'Edit', 'Review', 'Done']

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
  const [files,     setFiles]    = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)   // 0-100, tracks current file
  const [fileIdx,   setFileIdx]   = useState(0)   // which file is uploading
  const [stats,     setStats]     = useState(null)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)
  const [dragOver,  setDragOver]  = useState(false)

  const addFiles = (incoming) =>
    setFiles((prev) => [...prev, ...Array.from(incoming)])

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    setError('')

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setFileIdx(i)
        setProgress(0)
        setStats(null)

        // 1. Upload to R2
        const { publicUrl } = await uploadToR2({
          file,
          category:    'client-footage',
          clientName:  clientName || '',
          projectName: project.name,
          folderType:  'shoots',
          onProgress:  setProgress,
          onStats:     setStats,
        })

        // 2. Save to DB — check for errors (was silently swallowed before)
        const { error: dbErr } = await supabase.from('shoot_uploads').insert({
          project_id:  project.id,
          file_url:    publicUrl,
          file_name:   file.name,
          file_size:   file.size,
          uploaded_by: user.id,
        })
        if (dbErr) throw new Error(dbErr.message)
      }

      setDone(true)
      setFiles([])
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <CheckCircle2 size={24} className="mx-auto text-green-500 mb-2" />
          <p className="text-sm font-semibold text-green-800">Footage uploaded!</p>
          <p className="text-xs text-green-600 mt-1">Your team has been notified and will start working on it.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setDone(false)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold border border-green-300 text-green-700 hover:bg-green-100 transition-colors"
            >
              Upload more
            </button>
            <button
              onClick={() => { setDone(false); onDone?.() }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Uploader ──────────────────────────────────────────────────────────────
  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Upload Footage</p>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <Film size={13} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-700 truncate flex-1">{f.name}</span>
              <span className="text-xs text-gray-400">{fmtBytes(f.size)}</span>
              {!uploading && (
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-gray-300 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone — always visible so you can add more files */}
      {!uploading && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            addFiles(e.dataTransfer.files)
          }}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-accent bg-accent/5'
              : files.length > 0
              ? 'border-gray-100 py-2.5 hover:border-accent/40'
              : 'border-gray-200 hover:border-accent/50 hover:bg-accent/5'
          }`}
        >
          <Upload size={files.length > 0 ? 13 : 18} className={`mx-auto mb-1 ${files.length > 0 ? 'text-gray-300' : 'text-gray-300'}`} />
          <p className={`text-gray-400 ${files.length > 0 ? 'text-xs' : 'text-sm'}`}>
            {files.length > 0 ? 'Add more files' : <>Drop files here or <span className="text-accent font-medium">browse</span></>}
          </p>
          {files.length === 0 && <p className="text-xs text-gray-300 mt-0.5">Video, photo, ZIP</p>}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*,.zip,.mov,.mp4,.avi,.mkv"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {/* Progress bar */}
      {uploading && (
        <div className="mt-2 mb-2">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>
              {files.length > 1
                ? `Uploading file ${fileIdx + 1} of ${files.length}…`
                : 'Uploading…'}
            </span>
            <div className="flex gap-2">
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

      {error && (
        <p className="text-xs text-red-500 mt-2 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {files.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-3 w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-accent/90 transition-colors"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading
            ? 'Uploading…'
            : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ── Shoot files list (client view) ────────────────────────────────────────────
function ShootFilesList({ project }) {
  const [files,   setFiles]   = useState([])
  const [loading, setLoading] = useState(true)
  const [open,    setOpen]    = useState(false)

  useEffect(() => {
    if (!project?.id) return
    // Load uploads linked to this project OR its shoot
    const queries = [
      supabase.from('shoot_uploads').select('id, file_name, file_url, file_size, created_at').eq('project_id', project.id),
    ]
    if (project.shoot_id) {
      queries.push(supabase.from('shoot_uploads').select('id, file_name, file_url, file_size, created_at').eq('shoot_id', project.shoot_id))
    }
    Promise.all(queries).then((results) => {
      const all = results.flatMap((r) => r.data || [])
      const seen = new Set()
      setFiles(all.filter((f) => { if (seen.has(f.id)) return false; seen.add(f.id); return true }))
      setLoading(false)
    })
  }, [project?.id, project?.shoot_id])

  if (loading || !files.length) return null

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-accent transition-colors font-medium w-full"
      >
        <Film size={12} />
        {files.length} footage file{files.length !== 1 ? 's' : ''} available
        <span className="ml-auto text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {files.map((f) => {
            const ext = f.file_name?.split('.').pop()?.toLowerCase()
            const isVideo = ['mp4','mov','avi','mkv','webm'].includes(ext)
            return (
              <div key={f.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                {isVideo ? <Film size={12} className="text-blue-400 shrink-0" /> : <Film size={12} className="text-gray-300 shrink-0" />}
                <span className="text-xs text-gray-600 truncate flex-1">{f.file_name}</span>
                {f.file_url && (
                  <a href={f.file_url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline shrink-0">
                    View
                  </a>
                )}
              </div>
            )
          })}
        </div>
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

      <ShootFilesList project={project} />
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
        const projRes = await supabase
          .from('projects')
          .select('id, name, stage, revision_count, shoot_id')
          .eq('client_id', client.id)
          .neq('stage', 'archived')
          .order('created_at', { ascending: false })

        const projectIds = (projRes.data || []).map((p) => p.id)

        const revRes = projectIds.length
          ? await supabase
              .from('project_revisions')
              .select('id, project_id, revision_number, status')
              .in('project_id', projectIds)
          : { data: [] }

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
