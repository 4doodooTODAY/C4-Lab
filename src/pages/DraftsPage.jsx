import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Upload, Film, Image, Check,
  ChevronRight, Plus, X, Clock, AlertCircle, Globe, User,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { uploadToR2, fmtSpeed, fmtEta, warmUp } from '../lib/r2'
import DownloadButton from '../components/ui/DownloadButton'
import { formatDistanceToNow } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusConfig(status) {
  switch (status) {
    case 'pending_client_review': return { label: 'Awaiting Client',  cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'pending_editor':        return { label: 'Client Reviewed',  cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'approved':              return { label: 'Approved',         cls: 'bg-green-50 text-green-700 border-green-200' }
    default:                      return { label: status || 'Unknown', cls: 'bg-gray-100 text-gray-600 border-gray-200' }
  }
}

// ── Version Card ──────────────────────────────────────────────────────────────
function VersionCard({ version, onReview }) {
  const { label, cls } = statusConfig(version.status)
  const hasVideo  = !!version.video_url
  const hasPhotos = Array.isArray(version.photo_urls) && version.photo_urls.length > 0
  const Icon = hasVideo ? Film : Image

  return (
    <div className="bg-white rounded-2xl border border-border p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <Icon size={16} className="text-text-secondary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Draft {version.version_number}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {hasVideo ? 'Video' : hasPhotos ? `${version.photo_urls.length} photo${version.photo_urls.length !== 1 ? 's' : ''}` : 'No media'}
            </p>
          </div>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cls} shrink-0`}>
          {version.status === 'approved' ? '✓ ' : ''}{label}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          {version.profiles?.full_name ? `Uploaded by ${version.profiles.full_name}` : 'Uploaded'}
        </span>
        <span>{formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onReview(version)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          Review
          <ChevronRight size={13} />
        </button>
        {version.status === 'approved' && hasVideo && (
          <DownloadButton
            url={version.video_url}
            label="Download"
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-surface-2 text-text-secondary transition-colors"
          />
        )}
        {version.status === 'approved' && hasPhotos && version.photo_urls.map((url, i) => (
          <DownloadButton
            key={i}
            url={url}
            label={version.photo_urls.length === 1 ? 'Download' : `Photo ${i + 1}`}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-surface-2 text-text-secondary transition-colors"
          />
        ))}
      </div>
    </div>
  )
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ draftId, clientName, projectName, onClose, onUploaded }) {
  const { profile } = useAuth()
  const [mediaType,  setMediaType]  = useState('video') // 'video' | 'photos'
  const [files,      setFiles]      = useState([])
  const [uploading,  setUploading]  = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [converting, setConverting] = useState(null) // { stage, pct } while transcoding HEVC
  const [speed,      setSpeed]      = useState('')
  const [eta,        setEta]        = useState('')
  const [error,      setError]      = useState('')
  const abortCtrlRef = useRef(null)

  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || [])
    setFiles(mediaType === 'video' ? picked.slice(0, 1) : picked)
  }

  const handleCancel = () => {
    if (uploading && abortCtrlRef.current) {
      abortCtrlRef.current.abort()
      setUploading(false)
      setProgress(0)
      setSpeed('')
      setEta('')
      setError('')
    } else {
      onClose()
    }
  }

  const handleUpload = async () => {
    if (!files.length) return
    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl

    setUploading(true)
    setError('')
    setProgress(0)

    try {
      // Determine next version number
      const { data: existingVersions } = await supabase
        .from('content_draft_versions')
        .select('version_number')
        .eq('draft_id', draftId)
        .order('version_number', { ascending: false })
        .limit(1)
      const nextVersion = (existingVersions?.[0]?.version_number || 0) + 1

      let videoUrl  = null
      let photoUrls = []

      if (mediaType === 'video') {
        const result = await uploadToR2({
          file:        files[0],
          category:    'drafts',
          clientName:  clientName || 'client',
          projectName: projectName || 'project',
          folderType:  'video',
          signal:      ctrl.signal,
          normalizeVideo: true,
          onConvert:   (c) => setConverting(c.stage && c.stage !== 'done' ? c : null),
          onProgress:  (pct) => setProgress(pct),
          onStats:     ({ speed: spd, eta: remaining }) => {
            setSpeed(fmtSpeed(spd))
            setEta(fmtEta(remaining))
          },
        })
        videoUrl = result.publicUrl
      } else {
        // Upload ALL photos in parallel — much faster than sequential
        const totalFiles = files.length
        const perFilePct = new Array(totalFiles).fill(0)

        const results = await Promise.all(
          Array.from(files).map((file, i) =>
            uploadToR2({
              file,
              category:    'drafts',
              clientName:  clientName || 'client',
              projectName: projectName || 'project',
              folderType:  'photos',
              signal:      ctrl.signal,
              onProgress:  (pct) => {
                perFilePct[i] = pct
                const overall = Math.round(perFilePct.reduce((a, b) => a + b, 0) / totalFiles)
                setProgress(overall)
              },
              onStats: ({ speed: spd, eta: remaining }) => {
                setSpeed(fmtSpeed(spd))
                setEta(fmtEta(remaining))
              },
            })
          )
        )
        photoUrls = results.map((r) => r.publicUrl)
      }

      const { error: insErr } = await supabase.from('content_draft_versions').insert({
        draft_id:       draftId,
        version_number: nextVersion,
        video_url:      videoUrl,
        photo_urls:     photoUrls.length ? photoUrls : null,
        status:         'pending_client_review',
        created_by:     profile.id,
      })
      if (insErr) throw insErr

      onUploaded()
    } catch (e) {
      if (e.name === 'AbortError') return // user cancelled — just close
      setError(e.message)
      setUploading(false)
    } finally {
      if (!ctrl.signal.aborted) setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Upload New Draft</h2>
          <button onClick={handleCancel} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Media type toggle */}
          <div>
            <p className="text-xs font-semibold text-text-muted mb-2">Media Type</p>
            <div className="flex rounded-xl bg-surface-2 p-1 gap-1">
              <button
                onClick={() => { setMediaType('video'); setFiles([]) }}
                disabled={uploading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${mediaType === 'video' ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
              >
                <Film size={12} /> Video
              </button>
              <button
                onClick={() => { setMediaType('photos'); setFiles([]) }}
                disabled={uploading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${mediaType === 'photos' ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
              >
                <Image size={12} /> Photos
              </button>
            </div>
          </div>

          {/* File input */}
          <div>
            <p className="text-xs font-semibold text-text-muted mb-2">
              {mediaType === 'video' ? 'Select Video File' : 'Select Photos'}
            </p>
            <label className={`flex flex-col items-center justify-center gap-2 w-full h-32 border-2 border-dashed rounded-xl transition-colors ${uploading ? 'cursor-default opacity-50' : 'cursor-pointer'} ${files.length ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-accent/30 hover:bg-surface-2'}`}>
              <Upload size={20} className="text-text-muted" />
              <p className="text-xs text-text-muted">
                {files.length
                  ? mediaType === 'video'
                    ? files[0].name
                    : `${files.length} photo${files.length !== 1 ? 's' : ''} selected`
                  : `Click to choose ${mediaType === 'video' ? 'a video' : 'photos'}`}
              </p>
              <input
                type="file"
                className="sr-only"
                multiple={mediaType === 'photos'}
                onChange={handleFileChange}
                disabled={uploading}
              />
            </label>
          </div>

          {/* HEVC → H.264 conversion (so clients never get a black video) */}
          {uploading && converting && (
            <div className="space-y-1.5 mb-2">
              <div className="flex justify-between text-[11px] text-text-muted">
                <span>Optimizing video for web playback…</span>
                <span>{converting.stage === 'converting' && converting.pct != null ? `${converting.pct}%` : ''}</span>
              </div>
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${converting.stage === 'converting' && converting.pct != null ? converting.pct : 8}%` }} />
              </div>
              <p className="text-[10px] text-text-muted">This video is in a format clients can't play, so we're converting it first.</p>
            </div>
          )}

          {/* Progress */}
          {uploading && !converting && (
            <div className="space-y-2">
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-text-muted">
                <span>{progress}%</span>
                <span className="flex items-center gap-2">
                  {speed && <span>{speed}</span>}
                  {eta && <span>{eta}</span>}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-text-secondary hover:bg-surface-2 transition-colors"
          >
            {uploading ? 'Cancel Upload' : 'Cancel'}
          </button>
          <button
            onClick={handleUpload}
            disabled={!files.length || uploading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Uploading…' : 'Upload Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DraftsPage() {
  const { draftId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [draft,          setDraft]          = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [showUpload,     setShowUpload]     = useState(false)
  const [assignedEditor, setAssignedEditor] = useState(null)  // { id, full_name }
  const [allEditors,     setAllEditors]     = useState([])    // for admin picker
  const [publishing,     setPublishing]     = useState(false)
  const [published,      setPublished]      = useState(false)

  const isAdmin           = profile?.role === 'admin'
  const isCreativeOrAdmin = ['admin', 'creative', 'editor'].includes(profile?.role)
  const isClient          = profile?.role === 'client'
  // Admin, editors, and creatives can publish an approved draft.
  const canPublish        = ['admin', 'editor', 'creative'].includes(profile?.role)

  const fetchDraft = useCallback(async () => {
    if (!draftId) return
    try {
      const { data, error: fetchErr } = await supabase
        .from('content_drafts')
        .select(`
          *,
          clients(id, name),
          assigned_editor:profiles!assigned_editor_id(id, full_name),
          content_draft_versions(
            id, version_number, video_url, photo_urls, status, created_at, notes,
            profiles!created_by(full_name)
          )
        `)
        .eq('id', draftId)
        .single()
      if (fetchErr) throw fetchErr
      if (data?.content_draft_versions) {
        data.content_draft_versions.sort((a, b) => a.version_number - b.version_number)
      }
      setDraft(data)
      setPublished(!!data?.published_at)
      // Pre-fill assigned editor state
      if (data?.assigned_editor) setAssignedEditor(data.assigned_editor)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [draftId])

  // Load client team for editor auto-assign
  useEffect(() => {
    if (!draft?.clients?.id) return
    const clientId = draft.clients.id

    // Fetch all editors/creatives assigned to this client
    supabase
      .from('client_creatives')
      .select('profiles(id, full_name, role)')
      .eq('client_id', clientId)
      .then(({ data }) => {
        const members = (data || []).map((d) => d.profiles).filter(Boolean)
        setAllEditors(members)

        // Auto-assign: if current user is editor/creative for this client and no editor set yet
        if (!draft.assigned_editor_id && profile?.role !== 'admin') {
          const me = members.find((m) => m.id === profile?.id)
          if (me) {
            setAssignedEditor(me)
            // Persist auto-assignment
            supabase.from('content_drafts').update({ assigned_editor_id: me.id }).eq('id', draftId)
          }
        }
      })
  }, [draft?.clients?.id, draft?.assigned_editor_id, draftId, profile])

  useEffect(() => { fetchDraft() }, [fetchDraft])

  const handleReview = (version) => {
    const hasVideo  = !!version.video_url
    const hasPhotos = Array.isArray(version.photo_urls) && version.photo_urls.length > 0
    if (hasVideo) {
      navigate(`/drafts/${draftId}/video-review/${version.id}`)
    } else if (hasPhotos) {
      navigate(`/drafts/${draftId}/photo-review/${version.id}`)
    }
  }

  const handleUploaded = () => {
    setShowUpload(false)
    fetchDraft()
  }

  const handleChangeEditor = async (editorId) => {
    const editor = allEditors.find((e) => e.id === editorId) || null
    setAssignedEditor(editor)
    await supabase.from('content_drafts').update({ assigned_editor_id: editorId || null }).eq('id', draftId)
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const { error: pubErr } = await supabase
        .from('content_drafts')
        .update({ published_at: new Date().toISOString() })
        .eq('id', draftId)
      if (pubErr) throw pubErr
      setPublished(true)
    } catch (e) {
      alert('Publish failed: ' + e.message)
    } finally {
      setPublishing(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )
  if (error) return (
    <div className="p-8"><p className="text-red-500">{error}</p></div>
  )
  if (!draft) return (
    <div className="p-8"><p className="text-text-muted text-sm">Draft not found.</p></div>
  )

  const versions = draft.content_draft_versions || []
  const clientName = draft.clients?.name

  // Draft type badge
  const typeBadge = {
    reel:  { label: 'Reel',  cls: 'bg-purple-50 text-purple-700', icon: Film },
    post:  { label: 'Post',  cls: 'bg-blue-50 text-blue-700',     icon: Image },
    photo: { label: 'Photo', cls: 'bg-amber-50 text-amber-700',   icon: Image },
  }[draft.type] || { label: draft.type, cls: 'bg-surface-2 text-text-muted', icon: Film }

  const TypeIcon = typeBadge.icon

  const overallStatus = (() => {
    if (versions.some((v) => v.status === 'approved')) return 'approved'
    if (versions.some((v) => v.status === 'pending_editor')) return 'pending_editor'
    if (versions.some((v) => v.status === 'pending_client_review')) return 'pending_client_review'
    return 'no_versions'
  })()

  const approvedVersion = versions.find((v) => v.status === 'approved')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate(-1)}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <TypeIcon size={14} className="text-text-muted" />
          <h1 className="text-sm font-semibold text-text-primary">{draft.title}</h1>
          {clientName && (
            <>
              <span className="text-text-muted">·</span>
              <span className="text-xs text-text-muted">{clientName}</span>
            </>
          )}
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${typeBadge.cls} ml-1`}>
            {typeBadge.label}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {/* Publish button — admin/editor/creative, after approved */}
            {canPublish && overallStatus === 'approved' && (
              published ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                  <Globe size={11} /> Published
                </span>
              ) : (
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {publishing ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                  Publish
                </button>
              )
            )}
            {isCreativeOrAdmin && (
              <button
                onClick={() => { warmUp(); setShowUpload(true) }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                <Plus size={12} /> Upload Draft
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Draft info */}
        <div className="bg-white rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-text-primary">{draft.title}</h2>
              {clientName && (
                <p className="text-sm text-text-muted mt-0.5">Client: {clientName}</p>
              )}
              {draft.concept && (
                <p className="text-sm text-text-secondary mt-3 leading-relaxed">{draft.concept}</p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              {overallStatus !== 'no_versions' && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusConfig(overallStatus).cls}`}>
                  {statusConfig(overallStatus).label}
                </span>
              )}
              {published && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <Globe size={9} /> Published
                </span>
              )}
            </div>
          </div>

          {/* Assigned editor — shown to all team, editable by admin */}
          {isCreativeOrAdmin && (
            <div className="pt-4 border-t border-border flex items-center gap-3">
              <User size={13} className="text-text-muted shrink-0" />
              <span className="text-xs text-text-muted font-medium">Assigned Editor:</span>
              {isAdmin ? (
                <select
                  value={assignedEditor?.id || ''}
                  onChange={(e) => handleChangeEditor(e.target.value || null)}
                  className="flex-1 text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="">— Unassigned —</option>
                  {allEditors.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-text-primary font-medium">
                  {assignedEditor?.full_name || 'Unassigned'}
                </span>
              )}
            </div>
          )}

          {/* Footage links from client */}
          {Array.isArray(draft.client_footage_links) && draft.client_footage_links.length > 0 && (
            <div className="pt-4 border-t border-border">
              <p className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wide">Client Footage</p>
              <div className="flex flex-wrap gap-2">
                {draft.client_footage_links.map((url, i) => (
                  <DownloadButton
                    key={i}
                    url={url}
                    label={`Footage ${i + 1}`}
                    className="px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-surface-2 text-text-secondary transition-colors"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Versions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Drafts
              {versions.length > 0 && (
                <span className="ml-2 text-xs text-text-muted font-normal">{versions.length} version{versions.length !== 1 ? 's' : ''}</span>
              )}
            </h3>
            {isCreativeOrAdmin && (
              <button
                onClick={() => { warmUp(); setShowUpload(true) }}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Upload size={11} /> Upload new draft
              </button>
            )}
          </div>

          {versions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-border p-10 text-center">
              <Upload size={32} className="mx-auto text-text-muted/30 mb-3" />
              <p className="text-sm font-medium text-text-muted">No drafts uploaded yet</p>
              {isCreativeOrAdmin && (
                <button
                  onClick={() => { warmUp(); setShowUpload(true) }}
                  className="mt-4 px-5 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors"
                >
                  Upload First Draft
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {versions.map((v) => (
                <VersionCard key={v.id} version={v} onReview={handleReview} />
              ))}
            </div>
          )}
        </div>

        {/* Status callouts */}
        {isClient && overallStatus === 'pending_client_review' && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-start gap-3">
            <Clock size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Ready for your review</p>
              <p className="text-xs text-blue-700 mt-1">
                The creative team has uploaded a draft for you to review. Click "Review" on the draft card to leave feedback or approve.
              </p>
            </div>
          </div>
        )}

        {isClient && overallStatus === 'pending_editor' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
            <Clock size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Your feedback is being reviewed</p>
              <p className="text-xs text-amber-700 mt-1">
                The creative team is working on the next draft based on your feedback. You'll see a new version here when it's ready.
              </p>
            </div>
          </div>
        )}

        {overallStatus === 'approved' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-start gap-3">
            <Check size={16} className="text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                {published ? 'Draft approved and published!' : 'Draft approved!'}
              </p>
              <p className="text-xs text-green-700 mt-1">
                {isClient
                  ? 'You approved this draft. Download the final file above.'
                  : published
                    ? 'This draft has been approved by the client and marked as published.'
                    : canPublish
                      ? 'The client approved this draft. Use the Publish button above to mark it as published.'
                      : 'The client approved this draft.'}
              </p>
              {canPublish && !published && approvedVersion && (
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {publishing ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                  Mark as Published
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          draftId={draftId}
          clientName={clientName}
          projectName={draft.title}
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  )
}
