import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Send, Check, X, Plus,
  Image, ChevronLeft, ChevronRight, MessageSquare,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Avatar from '../components/ui/Avatar'
import DownloadButton from '../components/ui/DownloadButton'
import { formatDistanceToNow } from 'date-fns'

// ── Pin dot ───────────────────────────────────────────────────────────────────
function Pin({ pin, index, selected, onClick, status }) {
  const colors = {
    pending:  'bg-amber-400 border-amber-600',
    accepted: 'bg-green-500 border-green-700',
    declined: 'bg-red-500 border-red-700',
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(pin) }}
      className={`absolute z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center text-white text-[10px] font-bold shadow-lg transition-transform hover:scale-110 ${colors[status] || colors.pending} ${selected ? 'ring-2 ring-white scale-110' : ''}`}
      style={{ left: `calc(${pin.pin_x}% - 12px)`, top: `calc(${pin.pin_y}% - 12px)` }}
    >
      {index + 1}
    </button>
  )
}

// ── Comment card ──────────────────────────────────────────────────────────────
function CommentCard({ comment, index, selected, onSelect, canAct, onAccept, onDecline, updating }) {
  const statusColors = {
    pending:  'border-amber-200 bg-amber-50',
    accepted: 'border-green-200 bg-green-50',
    declined: 'border-red-200 bg-red-50',
  }
  const statusLabel = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined' }

  return (
    <div
      onClick={() => onSelect(comment)}
      className={`p-3 rounded-xl border cursor-pointer transition-all ${selected ? 'ring-2 ring-blue-400 ' : ''}${statusColors[comment.status] || statusColors.pending}`}
    >
      <div className="flex items-start gap-2">
        <span className="w-5 h-5 rounded-full bg-white border border-current flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-text-primary">{comment.profiles?.full_name || 'Unknown'}</p>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{comment.content}</p>
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[10px] font-semibold ${comment.status === 'accepted' ? 'text-green-600' : comment.status === 'declined' ? 'text-red-600' : 'text-amber-600'}`}>
              {statusLabel[comment.status] || 'Pending'}
            </span>
            <span className="text-[10px] text-text-muted">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
      {canAct && comment.status === 'pending' && (
        <div className="flex gap-1.5 mt-2 ml-7">
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(comment.id) }}
            disabled={updating === comment.id}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-[11px] font-semibold transition-colors disabled:opacity-50"
          >
            {updating === comment.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Accept
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDecline(comment.id) }}
            disabled={updating === comment.id}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-semibold transition-colors disabled:opacity-50"
          >
            <X size={11} /> Decline
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DraftPhotoReview() {
  const { draftId, versionId } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()

  const imgRef = useRef(null)

  const [version,     setVersion]     = useState(null)
  const [comments,    setComments]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [actionError, setActionError] = useState('')
  const [saving,      setSaving]      = useState(false)

  const [photoIndex,  setPhotoIndex]  = useState(0)
  const [selectedPin, setSelectedPin] = useState(null)
  const [pendingPin,  setPendingPin]  = useState(null)
  const [newComment,  setNewComment]  = useState('')
  const [updatingComment, setUpdatingComment] = useState(null)

  const isClient          = profile?.role === 'client'
  const isCreativeOrAdmin = ['admin', 'creative', 'editor'].includes(profile?.role)

  const fetchAll = useCallback(async () => {
    if (!versionId) return
    try {
      const [vRes, cRes] = await Promise.all([
        supabase
          .from('content_draft_versions')
          .select('*, content_drafts(id, title, type, client_id, clients(name))')
          .eq('id', versionId)
          .single(),
        supabase
          .from('draft_version_comments')
          .select('*, profiles(id, full_name, avatar_url, role)')
          .eq('version_id', versionId)
          .not('pin_x', 'is', null)
          .order('created_at'),
      ])
      if (vRes.error) throw vRes.error
      if (cRes.error) console.warn('Comments fetch error:', cRes.error.message)
      setVersion(vRes.data)
      setComments(cRes.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [versionId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const photoUrls = version?.photo_urls || []
  const currentUrl = photoUrls[photoIndex]
  const commentsOnCurrentPhoto = comments.filter((c) => c.photo_index === photoIndex)

  const canAddPins     = isClient && version?.status === 'pending_client_review'
  const canActOnPins   = isCreativeOrAdmin && version?.status === 'pending_editor'

  const handlePhotoClick = (e) => {
    if (!canAddPins || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const pin_x = ((e.clientX - rect.left) / rect.width) * 100
    const pin_y = ((e.clientY - rect.top)  / rect.height) * 100
    setPendingPin({ pin_x, pin_y })
    setSelectedPin(null)
    setNewComment('')
  }

  const handleSavePin = async () => {
    if (!pendingPin || !newComment.trim()) return
    setSaving(true)
    try {
      const { data, error: insErr } = await supabase
        .from('draft_version_comments')
        .insert({
          version_id:  versionId,
          author_id:   profile.id,
          pin_x:       parseFloat(pendingPin.pin_x.toFixed(2)),
          pin_y:       parseFloat(pendingPin.pin_y.toFixed(2)),
          photo_index: photoIndex,
          content:     newComment.trim(),
          status:      'pending',
        })
        .select('*, profiles(id, full_name, avatar_url, role)')
        .single()
      if (insErr) { setActionError(insErr.message); return }
      if (data) setComments((prev) => [...prev, data])
      setPendingPin(null)
      setNewComment('')
    } finally {
      setSaving(false)
    }
  }

  const handleAccept = async (commentId) => {
    setUpdatingComment(commentId)
    await supabase.from('draft_version_comments').update({ status: 'accepted' }).eq('id', commentId)
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, status: 'accepted' } : c))
    setUpdatingComment(null)
  }

  const handleDecline = async (commentId) => {
    setUpdatingComment(commentId)
    await supabase.from('draft_version_comments').update({ status: 'declined' }).eq('id', commentId)
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, status: 'declined' } : c))
    setUpdatingComment(null)
  }

  const handleApprove = async () => {
    setSubmitting(true)
    setActionError('')
    try {
      const [r1, r2] = await Promise.all([
        supabase.from('content_draft_versions').update({ status: 'approved' }).eq('id', versionId),
        supabase.from('content_drafts').update({ status: 'approved' }).eq('id', draftId),
      ])
      if (r1.error) throw r1.error
      if (r2.error) throw r2.error
      setVersion((v) => ({ ...v, status: 'approved' }))
    } catch (e) {
      setActionError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendFeedback = async () => {
    setSubmitting(true)
    setActionError('')
    try {
      const { error: upErr } = await supabase
        .from('content_draft_versions')
        .update({ status: 'pending_editor' })
        .eq('id', versionId)
      if (upErr) throw upErr
      setVersion((v) => ({ ...v, status: 'pending_editor' }))
    } catch (e) {
      setActionError(e.message)
    } finally {
      setSubmitting(false)
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

  const draft      = version?.content_drafts
  const status     = version?.status
  const versionNum = version?.version_number

  const statusBadge = {
    pending_client_review: { label: 'Awaiting Client Review', cls: 'bg-blue-50 text-blue-700' },
    pending_editor:        { label: 'Client Reviewed',        cls: 'bg-amber-50 text-amber-700' },
    approved:              { label: 'Approved',               cls: 'bg-green-50 text-green-700' },
  }[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3.5 bg-white border-b border-border shrink-0">
        <button
          onClick={() => navigate(`/drafts/${draftId}`)}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <Image size={14} className="text-text-muted" />
        <span className="text-sm font-semibold text-text-primary">{draft?.title || 'Photo Review'}</span>
        {draft?.clients?.name && (
          <>
            <span className="text-text-muted">·</span>
            <span className="text-xs text-text-muted">{draft.clients.name}</span>
          </>
        )}
        <span className="text-text-muted">·</span>
        <span className="text-xs font-medium text-text-secondary bg-surface-2 px-2 py-0.5 rounded-full">
          Draft {versionNum}
        </span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Photo area */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden bg-gray-100">
          {photoUrls.length === 0 ? (
            <div className="text-center">
              <Image size={48} className="mx-auto text-text-muted/30 mb-3" />
              <p className="text-sm text-text-muted">No photos uploaded yet</p>
            </div>
          ) : (
            <>
              <div className="relative max-w-full max-h-full" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                <img
                  ref={imgRef}
                  src={currentUrl}
                  alt={`Photo ${photoIndex + 1}`}
                  className={`max-w-full max-h-full object-contain rounded-xl shadow-md select-none ${canAddPins ? 'cursor-crosshair' : 'cursor-default'}`}
                  onClick={handlePhotoClick}
                  draggable={false}
                />
                {/* Existing pins */}
                {commentsOnCurrentPhoto.map((c, i) => (
                  <Pin
                    key={c.id}
                    pin={c}
                    index={i}
                    selected={selectedPin?.id === c.id}
                    onClick={setSelectedPin}
                    status={c.status}
                  />
                ))}
                {/* Pending pin */}
                {pendingPin && (
                  <div
                    className="absolute z-20 w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center shadow-lg animate-pulse"
                    style={{ left: `calc(${pendingPin.pin_x}% - 12px)`, top: `calc(${pendingPin.pin_y}% - 12px)` }}
                  >
                    <Plus size={12} className="text-white" />
                  </div>
                )}
              </div>

              {/* Photo navigation */}
              {photoUrls.length > 1 && (
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => { setPhotoIndex((i) => Math.max(0, i - 1)); setPendingPin(null); setSelectedPin(null) }}
                    disabled={photoIndex === 0}
                    className="p-1.5 rounded-lg hover:bg-white border border-border disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={16} className="text-text-secondary" />
                  </button>
                  <span className="text-xs text-text-muted font-medium">
                    {photoIndex + 1} / {photoUrls.length}
                  </span>
                  <button
                    onClick={() => { setPhotoIndex((i) => Math.min(photoUrls.length - 1, i + 1)); setPendingPin(null); setSelectedPin(null) }}
                    disabled={photoIndex === photoUrls.length - 1}
                    className="p-1.5 rounded-lg hover:bg-white border border-border disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={16} className="text-text-secondary" />
                  </button>
                </div>
              )}

              {canAddPins && (
                <p className="text-xs text-text-muted mt-2">Click anywhere on the photo to pin a comment</p>
              )}
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-white border-l border-border flex flex-col shrink-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border shrink-0">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Comments — Photo {photoIndex + 1}
              {commentsOnCurrentPhoto.length > 0 && (
                <span className="ml-1.5 bg-surface-2 text-text-muted px-1.5 py-0.5 rounded-full text-[10px]">
                  {commentsOnCurrentPhoto.length}
                </span>
              )}
            </p>
          </div>

          {actionError && (
            <div className="mx-3 mt-2 p-2 rounded-lg bg-red-50 border border-red-200 shrink-0">
              <p className="text-xs text-red-600">{actionError}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {commentsOnCurrentPhoto.length === 0 && !pendingPin ? (
              <p className="text-xs text-text-muted text-center mt-8">
                {canAddPins ? 'Click the photo to pin a comment' : 'No comments on this photo yet'}
              </p>
            ) : commentsOnCurrentPhoto.map((c, i) => (
              <CommentCard
                key={c.id}
                comment={c}
                index={i}
                selected={selectedPin?.id === c.id}
                onSelect={setSelectedPin}
                canAct={canActOnPins}
                onAccept={handleAccept}
                onDecline={handleDecline}
                updating={updatingComment}
              />
            ))}
          </div>

          {/* Pending pin input */}
          {pendingPin && canAddPins && (
            <div className="p-3 border-t border-border shrink-0">
              <p className="text-xs font-semibold text-text-primary mb-2">Add your comment</p>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="What needs to change here?"
                rows={3}
                className="input w-full text-xs resize-none"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { setPendingPin(null); setNewComment('') }}
                  className="btn-ghost text-xs px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePin}
                  disabled={!newComment.trim() || saving}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                  Pin Comment
                </button>
              </div>
            </div>
          )}

          {/* Approved downloads */}
          {isClient && status === 'approved' && photoUrls.length > 0 && (
            <div className="p-3 border-t border-border shrink-0 space-y-1.5">
              <p className="text-[10px] text-text-muted text-center font-medium uppercase tracking-wide mb-2">
                Download Approved Photos
              </p>
              {photoUrls.map((url, i) => (
                <DownloadButton
                  key={i}
                  url={url}
                  label={photoUrls.length === 1 ? 'Download Photo' : `Photo ${i + 1}`}
                  className="w-full py-2 px-3 rounded-lg bg-accent text-white text-xs hover:bg-accent/90"
                />
              ))}
            </div>
          )}

          {/* Client action panel */}
          {isClient && status === 'pending_client_review' && !pendingPin && (
            <div className="p-3 border-t border-border shrink-0 space-y-2">
              {comments.filter((c) => c.status === 'pending').length > 0 ? (
                <>
                  <p className="text-[11px] text-text-muted text-center">
                    {comments.filter((c) => c.status === 'pending').length} pending comment{comments.filter((c) => c.status === 'pending').length !== 1 ? 's' : ''} across all photos
                  </p>
                  <button
                    onClick={handleSendFeedback}
                    disabled={submitting}
                    className="w-full btn-primary text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={11} className="animate-spin" /> : <MessageSquare size={11} />}
                    Send Feedback
                  </button>
                </>
              ) : (
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="w-full btn-primary text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />}
                  Approve Photos
                </button>
              )}
            </div>
          )}

          {/* Editor/creative sees client feedback prompt */}
          {isCreativeOrAdmin && status === 'pending_editor' && (
            <div className="p-3 border-t border-border shrink-0">
              <p className="text-xs text-text-muted flex items-start gap-2">
                <MessageSquare size={13} className="text-amber-500 shrink-0 mt-0.5" />
                Review the client's pin comments above, then upload a new version from the drafts page.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
