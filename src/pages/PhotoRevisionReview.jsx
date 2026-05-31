import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Send, Check, X, Plus, Image, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Avatar from '../components/ui/Avatar'
import DownloadButton from '../components/ui/DownloadButton'
import { formatDistanceToNow } from 'date-fns'

// ── Pin dot on the photo ───────────────────────────────────────────────────────
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
      style={{ left: `calc(${pin.x_pct}% - 12px)`, top: `calc(${pin.y_pct}% - 12px)` }}
    >
      {index + 1}
    </button>
  )
}

// ── Comment card in the side panel ────────────────────────────────────────────
function CommentCard({ comment, index, selected, onSelect, canAct, onAccept, onDecline }) {
  const statusColors = {
    pending:  'border-amber-200 bg-amber-50',
    accepted: 'border-green-200 bg-green-50',
    declined: 'border-red-200 bg-red-50',
  }
  const statusLabel = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined' }

  return (
    <div
      onClick={() => onSelect(comment)}
      className={`p-3 rounded-xl border cursor-pointer transition-all ${selected ? 'ring-2 ring-accent ' : ''}${statusColors[comment.status] || statusColors.pending}`}
    >
      <div className="flex items-start gap-2">
        <span className="w-5 h-5 rounded-full bg-white border border-current flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-text-primary">{comment.profiles?.full_name || 'Unknown'}</p>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{comment.body}</p>
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[10px] font-semibold ${comment.status === 'accepted' ? 'text-green-600' : comment.status === 'declined' ? 'text-red-600' : 'text-amber-600'}`}>
              {statusLabel[comment.status]}
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
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-[11px] font-semibold transition-colors"
          >
            <Check size={11} /> Accept
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDecline(comment.id) }}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-semibold transition-colors"
          >
            <X size={11} /> Decline
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PhotoRevisionReview() {
  const { revisionId } = useParams()
  const { profile, isAdmin } = useAuth()
  const myId   = profile?.id
  const myRole = profile?.role

  const [revision,        setRevision]        = useState(null)
  const [project,         setProject]         = useState(null)
  const [comments,        setComments]        = useState([])
  const [projectEditorIds,setProjectEditorIds]= useState([])
  const [editorName,      setEditorName]      = useState('')
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState('')
  const [sending,         setSending]         = useState(false)
  const [approving,       setApproving]       = useState(false)

  const [photoIndex,  setPhotoIndex]  = useState(0)
  const [selectedPin, setSelectedPin] = useState(null)
  const [pendingPin,  setPendingPin]  = useState(null) // {x_pct, y_pct} — not yet saved
  const [newComment,  setNewComment]  = useState('')
  const [saving,      setSaving]      = useState(false)

  const imgRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      // Fetch revision + comments in parallel (we have revisionId for both)
      const [{ data: rev }, { data: cmts }] = await Promise.all([
        supabase
          .from('project_revisions')
          .select('*, projects(id, name, client_id, editor_id, creative_id)')
          .eq('id', revisionId)
          .single(),
        supabase
          .from('photo_revision_comments')
          .select('*, profiles(id, full_name, avatar_url)')
          .eq('revision_id', revisionId)
          .order('created_at'),
      ])
      if (!rev) { setError('Revision not found'); setLoading(false); return }
      setRevision(rev)
      setProject(rev.projects)
      setComments(cmts || [])

      // Fetch editors (needs project_id from revision)
      const { data: editors } = await supabase
        .from('project_editors')
        .select('profile_id, profiles(id, full_name)')
        .eq('project_id', rev.projects.id)
      setProjectEditorIds((editors || []).map((r) => r.profile_id))
      // Use first editor name for display
      const firstName = editors?.[0]?.profiles?.full_name
      if (!firstName && rev.projects.editor_id) {
        const { data: ep } = await supabase.from('profiles').select('full_name').eq('id', rev.projects.editor_id).single()
        setEditorName(ep?.full_name || '')
      } else {
        setEditorName(firstName || '')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [revisionId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const photoUrls = revision?.photo_urls || []
  const currentUrl = photoUrls[photoIndex]

  const commentsOnCurrentPhoto = comments.filter((c) => c.photo_index === photoIndex)

  const isPhotographer = myRole === 'creative' || (project && project.creative_id === myId)
  const isEditor       = projectEditorIds.includes(myId) || project?.editor_id === myId
  const isClient       = myRole === 'client'
  const canAddPins     = isClient && revision?.status === 'pending_client_review'
  // Only editors/photographers can accept or decline client comments, and only when it's actually their turn
  const canActOnPins   = (isPhotographer || isEditor) && revision?.status === 'pending_editor'

  // Click on photo to place a pin
  const handlePhotoClick = (e) => {
    if (!canAddPins) return
    const rect = imgRef.current.getBoundingClientRect()
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100
    const y_pct = ((e.clientY - rect.top)  / rect.height) * 100
    setPendingPin({ x_pct, y_pct })
    setSelectedPin(null)
    setNewComment('')
  }

  const handleSavePin = async () => {
    if (!pendingPin || !newComment.trim()) return
    setSaving(true)
    try {
      const { data, error: insErr } = await supabase
        .from('photo_revision_comments')
        .insert({
          revision_id:  revisionId,
          photo_index:  photoIndex,
          x_pct:        parseFloat(pendingPin.x_pct.toFixed(2)),
          y_pct:        parseFloat(pendingPin.y_pct.toFixed(2)),
          body:         newComment.trim(),
          profile_id:   myId,
          status:       'pending',
        })
        .select('*, profiles(id, full_name, avatar_url)')
        .single()
      if (insErr) { setError(insErr.message); return }
      if (data) setComments((prev) => [...prev, data])
      setPendingPin(null)
      setNewComment('')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (commentId, status) => {
    await supabase.from('photo_revision_comments').update({ status }).eq('id', commentId)
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, status } : c))
  }

  const handleApproveAll = async () => {
    setApproving(true)
    try {
      await supabase.from('project_revisions').update({ status: 'approved' }).eq('id', revisionId)
      setRevision((r) => ({ ...r, status: 'approved' }))
    } finally {
      setApproving(false)
    }
  }

  const handleSendFeedback = async () => {
    setSending(true)
    try {
      await supabase.from('project_revisions')
        .update({ status: 'pending_editor' })
        .eq('id', revisionId)
      setRevision((r) => ({ ...r, status: 'pending_editor' }))
      const editorIds = projectEditorIds.length ? projectEditorIds : [project?.editor_id].filter(Boolean)
      if (editorIds.length) {
        const { notify } = await import('../lib/notify')
        const pendingCount = comments.filter((c) => c.status === 'pending').length
        await Promise.all(editorIds.map((eid) => notify({
          profileId: eid,
          actorId:   myId,
          type:      'revision_feedback',
          title:     `Photo feedback submitted for "${project.name}"`,
          body:      `The client left ${pendingCount} comment${pendingCount !== 1 ? 's' : ''} on the photos.`,
          link:      `/projects/${project.id}/photo-revision/${revisionId}`,
        })))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-24"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
  )
  if (error) return (
    <div className="p-8"><p className="text-red-500">{error}</p></div>
  )

  const revStatus   = revision?.status
  const allResolved = commentsOnCurrentPhoto.every((c) => c.status !== 'pending')

  // "Who's up" banner config based on status + role
  const whosUpBanner = (() => {
    const editor = editorName || 'your editor'
    if (revStatus === 'pending_client_review' && isClient) return {
      bg: 'bg-blue-50 border-blue-200', icon: '📸', textColor: 'text-blue-800',
      title: `${editor} sent you photos to review`,
      sub: 'Click on the photo to pin a comment anywhere, or approve if everything looks great.',
    }
    if (revStatus === 'pending_editor' && isClient) return {
      bg: 'bg-amber-50 border-amber-200', icon: '⏳', textColor: 'text-amber-800',
      title: `Your feedback is with ${editor}`,
      sub: "They've been notified and are working on the changes. We'll let you know when a new version is ready.",
    }
    if (revStatus === 'pending_client_review' && (isEditor || isPhotographer || isAdmin)) return {
      bg: 'bg-blue-50 border-blue-200', icon: '👀', textColor: 'text-blue-800',
      title: 'Waiting for client review',
      sub: 'The client has been notified. You\'ll be alerted when they respond.',
    }
    if (revStatus === 'pending_editor' && (isEditor || isAdmin)) return {
      bg: 'bg-orange-50 border-orange-200', icon: '🔔', textColor: 'text-orange-800',
      title: "Client sent feedback — it's your turn",
      sub: 'Review their pinned comments below and upload a revised set of photos.',
    }
    if (revStatus === 'approved') return {
      bg: 'bg-green-50 border-green-200', icon: '✅', textColor: 'text-green-800',
      title: 'Photos approved!',
      sub: isClient ? 'You approved these photos.' : 'The client approved this photo set.',
    }
    return null
  })()

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3.5 bg-white border-b border-border shrink-0">
        <Link to={`/projects/${project?.id}/creative`} className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-2">
          <Image size={15} className="text-text-muted" />
          <span className="text-sm font-semibold text-text-primary">{project?.name}</span>
          <span className="text-text-muted">·</span>
          <span className="text-xs text-text-muted">
            {revision?.revision_number === 1 ? 'Initial Photos' : `Revision ${revision?.revision_number - 1}`}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            revStatus === 'approved'              ? 'bg-green-50 text-green-700' :
            revStatus === 'pending_client_review' ? 'bg-blue-50 text-blue-700'  :
            revStatus === 'pending_editor'        ? 'bg-orange-50 text-orange-700' :
            revStatus === 'pending_photographer_review' ? 'bg-amber-50 text-amber-700' :
            'bg-surface-2 text-text-muted'
          }`}>
            {revStatus === 'approved'              ? '✓ Approved' :
             revStatus === 'pending_client_review' ? (isClient ? '👀 Your Review' : '⏳ Client Reviewing') :
             revStatus === 'pending_editor'        ? (isEditor || isAdmin ? '🔔 Your Turn' : '⏳ Editor Working') :
             revStatus === 'pending_photographer_review' ? '⏳ Photographer Review' :
             revStatus?.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Who's up banner */}
      {whosUpBanner && (
        <div className={`px-6 py-3 border-b ${whosUpBanner.bg} flex items-start gap-3 shrink-0`}>
          <span className="text-lg leading-none mt-0.5">{whosUpBanner.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${whosUpBanner.textColor}`}>{whosUpBanner.title}</p>
            <p className={`text-xs mt-0.5 ${whosUpBanner.textColor} opacity-80`}>{whosUpBanner.sub}</p>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Photo area */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
          {photoUrls.length === 0 ? (
            <div className="text-center">
              <Image size={48} className="mx-auto text-text-muted/30 mb-3" />
              <p className="text-sm text-text-muted">No photos uploaded yet</p>
            </div>
          ) : (
            <>
              {/* Photo with pins */}
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
                {/* Pending (unsaved) pin */}
                {pendingPin && (
                  <div
                    className="absolute z-20 w-6 h-6 rounded-full bg-accent border-2 border-white flex items-center justify-center shadow-lg animate-pulse"
                    style={{ left: `calc(${pendingPin.x_pct}% - 12px)`, top: `calc(${pendingPin.y_pct}% - 12px)` }}
                  >
                    <Plus size={12} className="text-white" />
                  </div>
                )}
              </div>

              {/* Photo nav */}
              {photoUrls.length > 1 && (
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => { setPhotoIndex((i) => Math.max(0, i - 1)); setPendingPin(null); setSelectedPin(null) }}
                    disabled={photoIndex === 0}
                    className="btn-ghost p-1.5 disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs text-text-muted font-medium">
                    {photoIndex + 1} / {photoUrls.length}
                  </span>
                  <button
                    onClick={() => { setPhotoIndex((i) => Math.min(photoUrls.length - 1, i + 1)); setPendingPin(null); setSelectedPin(null) }}
                    disabled={photoIndex === photoUrls.length - 1}
                    className="btn-ghost p-1.5 disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {canAddPins && (
                <p className="text-xs text-text-muted mt-2">
                  Click anywhere on the photo to leave a comment
                </p>
              )}
            </>
          )}
        </div>

        {/* Side panel */}
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

          {error && (
            <div className="mx-3 mt-2 p-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-600">{error}</p>
              <button onClick={() => setError('')} className="text-[10px] text-red-400 hover:text-red-600 mt-0.5">Dismiss</button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {commentsOnCurrentPhoto.length === 0 && !pendingPin && (
              <p className="text-xs text-text-muted text-center mt-8">
                {canAddPins ? 'Click the photo to pin a comment' : 'No comments on this photo yet'}
              </p>
            )}
            {commentsOnCurrentPhoto.map((c, i) => (
              <CommentCard
                key={c.id}
                comment={c}
                index={i}
                selected={selectedPin?.id === c.id}
                onSelect={setSelectedPin}
                canAct={canActOnPins}
                onAccept={(id) => handleStatusChange(id, 'accepted')}
                onDecline={(id) => handleStatusChange(id, 'declined')}
              />
            ))}
          </div>

          {/* New comment input (clients placing a pin) */}
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

          {/* Download panel — shown to client when approved */}
          {isClient && revStatus === 'approved' && photoUrls.length > 0 && (
            <div className="p-3 border-t border-border shrink-0 space-y-1.5">
              <p className="text-[10px] text-text-muted text-center font-medium uppercase tracking-wide mb-2">Download Approved Photos</p>
              {photoUrls.map((url, i) => (
                <DownloadButton
                  key={i}
                  url={url}
                  label={photoUrls.length === 1 ? 'Download Photo' : `Photo ${i + 1}`}
                  className="w-full py-2 px-3 rounded-lg bg-accent text-white text-xs hover:bg-accent/90"
                />
              ))}
              <p className="text-[9px] text-text-muted text-center pt-1">Original quality — no compression</p>
            </div>
          )}

          {/* Approve / Send Feedback panel for clients */}
          {isClient && revStatus === 'pending_client_review' && !pendingPin && (
            <div className="p-3 border-t border-border shrink-0 space-y-2">
              {comments.filter((c) => c.status === 'pending').length > 0 ? (
                <>
                  <p className="text-[11px] text-text-muted text-center">
                    {comments.filter((c) => c.status === 'pending').length} pending comment{comments.filter((c) => c.status === 'pending').length !== 1 ? 's' : ''} across all photos
                  </p>
                  <button
                    onClick={handleSendFeedback}
                    disabled={sending}
                    className="w-full btn-primary text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {sending ? <Loader2 size={11} className="animate-spin" /> : <MessageSquare size={11} />}
                    Send Feedback to Editor
                  </button>
                </>
              ) : (
                <button
                  onClick={handleApproveAll}
                  disabled={approving}
                  className="w-full btn-primary text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {approving ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />}
                  Approve Photos
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
