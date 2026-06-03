import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Upload, Film, Image, Check,
  ChevronRight, Plus, X, Clock, AlertCircle,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { uploadToR2, fmtSpeed, fmtEta } from '../lib/r2'
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
  const [speed,      setSpeed]      = useState('')
  const [eta,        setEta]        = useState('')
  const [error,      setError]      = useState('')

  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || [])
    setFiles(mediaType === 'video' ? picked.slice(0, 1) : picked)
  }

  const handleUpload = async () => {
    if (!files.length) return
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

      let videoUrl   = null
      let photoUrls  = []

      if (mediaType === 'video') {
        const url = await uploadToR2({
          file:        files[0],
          category:    'drafts',
          clientName:  clientName || 'client',
          projectName: projectName || 'project',
          folderType:  'video',
          onProgress:  (pct) => setProgress(pct),
          onStats:     ({ speed: spd, eta: remaining }) => {
            setSpeed(fmtSpeed(spd))
            setEta(fmtEta(remaining))
          },
        })
        videoUrl = url
      } else {
        for (let i = 0; i < files.length; i++) {
          const url = await uploadToR2({
            file:        files[i],
            category:    'drafts',
            clientName:  clientName || 'client',
            projectName: projectName || 'project',
            folderType:  'photos',
            onProgress:  (pct) => setProgress(Math.round(((i / files.length) + pct / 100 / files.length) * 100)),
            onStats:     ({ speed: spd, eta: remaining }) => {
              setSpeed(fmtSpeed(spd))
              setEta(fmtEta(remaining))
            },
          })
          photoUrls.push(url)
        }
      }

      const { error: insErr } = await supabase.from('content_draft_versions').insert({
        draft_id:     draftId,
        version_number: nextVersion,
        video_url:    videoUrl,
        photo_urls:   photoUrls.length ? photoUrls : null,
        status:       'pending_client_review',
        created_by:   profile.id,
      })
      if (insErr) throw insErr

      onUploaded()
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Upload New Draft</h2>
          <button onClick={onClose} disabled={uploading} className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-40">
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
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${mediaType === 'video' ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
              >
                <Film size={12} /> Video
              </button>
              <button
                onClick={() => { setMediaType('photos'); setFiles([]) }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${mediaType === 'photos' ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
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
            <label className={`flex flex-col items-center justify-center gap-2 w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${files.length ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-accent/30 hover:bg-surface-2'}`}>
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
                accept={mediaType === 'video' ? 'video/*' : 'image/*'}
                multiple={mediaType === 'photos'}
                onChange={handleFileChange}
                disabled={uploading}
              />
            </label>
          </div>

          {/* Progress */}
          {uploading && (
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
                  {eta && <span>~{eta} left</span>}
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
            onClick={onClose}
            disabled={uploading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-40"
          >
            Cancel
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
  const { profile, isAdmin } = useAuth()

  const [draft,       setDraft]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [showUpload,  setShowUpload]  = useState(false)

  const isCreativeOrAdmin = ['admin', 'creative', 'editor'].includes(profile?.role)
  const isClient          = profile?.role === 'client'

  const fetchDraft = useCallback(async () => {
    if (!draftId) return
    try {
      const { data, error: fetchErr } = await supabase
        .from('content_drafts')
        .select(`
          *,
          clients(name),
          content_draft_versions(
            id, version_number, video_url, photo_urls, status, created_at, notes,
            profiles!created_by(full_name)
          )
        `)
        .eq('id', draftId)
        .single()
      if (fetchErr) throw fetchErr
      // Sort versions ascending
      if (data?.content_draft_versions) {
        data.content_draft_versions.sort((a, b) => a.version_number - b.version_number)
      }
      setDraft(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [draftId])

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
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
          {isCreativeOrAdmin && (
            <button
              onClick={() => setShowUpload(true)}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              <Plus size={12} /> Upload Draft
            </button>
          )}
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
            <div className="shrink-0">
              {overallStatus !== 'no_versions' && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusConfig(overallStatus).cls}`}>
                  {statusConfig(overallStatus).label}
                </span>
              )}
            </div>
          </div>

          {/* Footage links from client */}
          {Array.isArray(draft.footage_urls) && draft.footage_urls.length > 0 && (
            <div className="pt-4 border-t border-border">
              <p className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wide">Client Footage</p>
              <div className="flex flex-wrap gap-2">
                {draft.footage_urls.map((url, i) => (
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
                onClick={() => setShowUpload(true)}
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
                  onClick={() => setShowUpload(true)}
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

        {/* Status guide for client */}
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
              <p className="text-sm font-semibold text-green-800">Draft approved!</p>
              <p className="text-xs text-green-700 mt-1">
                {isClient ? 'You approved this draft. Download the final file above.' : 'The client approved this draft.'}
              </p>
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
