import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, MessageSquare, Check, X, Plus,
  Send, Download, Film,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Avatar from '../components/ui/Avatar'
import DownloadButton from '../components/ui/DownloadButton'

// ── Helpers ───────────────────────────────────────────────────────────────────

function snapToQuarter(s) {
  return Math.round(s * 4) / 4
}

function fmtTime(s) {
  if (s == null || isNaN(s)) return '0:00'
  const snapped = snapToQuarter(s)
  const m   = Math.floor(snapped / 60)
  const sec = Math.floor(snapped % 60)
  const frac = Math.round((snapped - Math.floor(snapped)) * 100)
  const fracStr = frac > 0 ? `.${frac.toString().padStart(2, '0')}` : ''
  return `${m}:${sec.toString().padStart(2, '0')}${fracStr}`
}

function draftLabel(n) {
  return `Draft ${n}`
}

// ── Timeline dot ──────────────────────────────────────────────────────────────
function TimelineDot({ comment, duration, isClientComment, onClick }) {
  const [hover, setHover] = useState(false)
  const left = duration > 0 ? (comment.timestamp_seconds / duration) * 100 : 0
  const color = isClientComment ? '#3b82f6' : '#a855f7'

  return (
    <div
      style={{ left: `${left}%` }}
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-10"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onClick(comment.timestamp_seconds)}
    >
      <div
        style={{ backgroundColor: color }}
        className="w-3 h-3 rounded-full border-2 border-white shadow"
      />
      {hover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-xl z-20 pointer-events-none">
          <p className="font-semibold mb-0.5">{fmtTime(comment.timestamp_seconds)}</p>
          <p className="line-clamp-3">{comment.content}</p>
        </div>
      )}
    </div>
  )
}

// ── Add comment popover ───────────────────────────────────────────────────────
function AddCommentPopover({ timestamp, onPost, onCancel }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const handlePost = async () => {
    if (!text.trim()) return
    setSaving(true)
    await onPost(timestamp, text.trim())
    setSaving(false)
  }

  return (
    <div className="bg-gray-900 border border-white/10 rounded-xl p-3 shadow-2xl w-72">
      <p className="text-xs text-white/50 mb-2">Comment at {fmtTime(timestamp)}</p>
      <textarea
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-blue-500/50"
        rows={3}
        placeholder="Write your comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/20 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handlePost}
          disabled={!text.trim() || saving}
          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 flex items-center justify-center gap-1 transition-all"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Post
        </button>
      </div>
    </div>
  )
}

// ── Comment item in sidebar ───────────────────────────────────────────────────
function CommentItem({ comment, canActOnComments, onAccept, onDecline, updating, onSeek }) {
  const isClientComment = comment.profiles?.role === 'client'
  const borderColor = comment.status === 'accepted'
    ? 'border-green-500/40'
    : comment.status === 'declined'
    ? 'border-red-500/20 opacity-50'
    : 'border-white/10'

  return (
    <div className={`border ${borderColor} rounded-xl p-3 transition-all cursor-pointer hover:bg-white/5`} onClick={() => onSeek(comment.timestamp_seconds)}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white/70 shrink-0">
          {fmtTime(comment.timestamp_seconds)}
        </span>
        <Avatar name={comment.profiles?.full_name} url={comment.profiles?.avatar_url} size={5} />
        <span className="text-xs text-white/60 truncate flex-1">{comment.profiles?.full_name || 'Unknown'}</span>
        {comment.status === 'accepted' && (
          <span className="text-[10px] text-green-400 font-semibold shrink-0">Accepted</span>
        )}
        {comment.status === 'declined' && (
          <span className="text-[10px] text-red-400 font-semibold shrink-0">Declined</span>
        )}
      </div>
      <p className="text-sm text-white/80 leading-relaxed">{comment.content}</p>

      {canActOnComments && isClientComment && comment.status === 'pending' && (
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(comment.id) }}
            disabled={updating === comment.id}
            className="flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-300 border border-green-500/20 transition-all disabled:opacity-50"
          >
            {updating === comment.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Accept
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDecline(comment.id) }}
            disabled={updating === comment.id}
            className="flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded-lg bg-red-600/10 hover:bg-red-600/30 text-red-300 border border-red-500/10 transition-all disabled:opacity-50"
          >
            <X size={11} /> Decline
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DraftVideoReview() {
  const { draftId, versionId } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()

  const videoRef    = useRef(null)
  const timelineRef = useRef(null)

  const [version,  setVersion]  = useState(null)
  const [comments, setComments] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  const [duration,    setDuration]    = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const [popover,    setPopover]    = useState(null) // { x, y, timestamp }
  const [updatingComment, setUpdatingComment] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')

  const isClient          = profile?.role === 'client'
  const isEditor          = profile?.role === 'editor'
  const isCreativeOrAdmin = ['admin', 'creative', 'editor'].includes(profile?.role)
  const isAdminOnly       = profile?.role === 'admin'

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
          .not('timestamp_seconds', 'is', null)
          .order('timestamp_seconds'),
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

  // ── Video timeline click ──────────────────────────────────────────────────
  const handleTimelineClick = (e) => {
    if (!timelineRef.current || !duration) return
    const rect = timelineRef.current.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const ts   = snapToQuarter(pct * duration)

    if (videoRef.current) {
      videoRef.current.currentTime = ts
      videoRef.current.pause()
    }

    const canComment = (isClient && version?.status === 'pending_client_review') || isCreativeOrAdmin
    if (canComment) {
      setPopover({ x: e.clientX, y: e.clientY, timestamp: ts })
    }
  }

  const handleSeek = (ts) => {
    if (videoRef.current) {
      videoRef.current.currentTime = ts
      videoRef.current.pause()
    }
  }

  // ── Post comment ─────────────────────────────────────────────────────────
  const handlePostComment = async (timestamp, text) => {
    const { data, error: insErr } = await supabase
      .from('draft_version_comments')
      .insert({
        version_id:        versionId,
        author_id:         profile.id,
        timestamp_seconds: timestamp,
        content:           text,
      })
      .select('*, profiles(id, full_name, avatar_url, role)')
      .single()
    if (insErr) { setActionError(insErr.message); return }
    if (data) setComments((prev) => [...prev, data].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds))
    setPopover(null)
  }

  // ── Accept / decline comment ──────────────────────────────────────────────
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

  // ── Approve ───────────────────────────────────────────────────────────────
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

  // ── Send Feedback ─────────────────────────────────────────────────────────
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
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <Loader2 size={24} className="animate-spin text-white/30" />
    </div>
  )
  if (error) return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <p className="text-red-400 text-sm">{error}</p>
    </div>
  )

  const draft       = version?.content_drafts
  const status      = version?.status
  const versionNum  = version?.version_number
  // Only clients add timestamped comments (and admins for oversight).
  // Editors can VIEW all comments but cannot add new ones — it's the client's turn to mark up.
  const canAddComments   = (isClient && status === 'pending_client_review') || isAdminOnly
  const canActOnComments = isCreativeOrAdmin && status === 'pending_editor'

  const statusBadge = {
    pending_client_review: { label: 'Awaiting Client Review', cls: 'bg-blue-500/20 text-blue-300' },
    pending_editor:        { label: 'Client Reviewed',        cls: 'bg-amber-500/20 text-amber-300' },
    approved:              { label: 'Approved',               cls: 'bg-green-500/20 text-green-300' },
  }[status] || { label: status, cls: 'bg-white/10 text-white/50' }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-900/80 border-b border-white/10 shrink-0 backdrop-blur">
        <button
          onClick={() => navigate(`/drafts/${draftId}`)}
          className="text-white/40 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <Film size={14} className="text-white/40" />
        <span className="text-sm font-semibold">{draft?.title || 'Draft Review'}</span>
        {draft?.clients?.name && (
          <>
            <span className="text-white/30">·</span>
            <span className="text-xs text-white/40">{draft.clients.name}</span>
          </>
        )}
        <span className="text-white/30">·</span>
        <span className="text-xs font-medium text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
          {draftLabel(versionNum)}
        </span>
        <span className={`ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video column */}
        <div className="flex-1 flex flex-col bg-black overflow-hidden">
          {/* Video */}
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
            {version?.video_url ? (
              <video
                ref={videoRef}
                src={version.video_url}
                className="max-w-full max-h-full object-contain"
                controls={false}
                playsInline
                preload="metadata"
                onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current.pause()}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
              />
            ) : (
              <div className="text-center">
                <Film size={48} className="mx-auto text-white/20 mb-3" />
                <p className="text-sm text-white/30">No video uploaded</p>
              </div>
            )}

            {/* Comment popover */}
            {popover && (
              <div
                className="absolute z-30"
                style={{ left: Math.min(popover.x, window.innerWidth - 310), top: Math.max(60, popover.y - 160) }}
              >
                <AddCommentPopover
                  timestamp={popover.timestamp}
                  onPost={handlePostComment}
                  onCancel={() => setPopover(null)}
                />
              </div>
            )}
          </div>

          {/* Timeline + controls */}
          <div className="px-4 py-3 bg-gray-900/60 border-t border-white/10 shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current.pause()}
                className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg transition-all"
              >
                Play / Pause
              </button>
              <span className="text-xs text-white/40 tabular-nums">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
              {canAddComments && (
                <span className="text-[10px] text-white/30 ml-auto">Click timeline to comment</span>
              )}
            </div>

            {/* Timeline bar */}
            <div
              ref={timelineRef}
              className="relative h-8 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors overflow-hidden"
              onClick={handleTimelineClick}
            >
              {/* Progress */}
              <div
                className="absolute top-0 left-0 h-full bg-blue-600/30 pointer-events-none"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
              />
              {/* Playhead */}
              <div
                className="absolute top-0 h-full w-0.5 bg-white/60 pointer-events-none"
                style={{ left: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
              />
              {/* Comment dots */}
              {comments.map((c) => (
                <TimelineDot
                  key={c.id}
                  comment={c}
                  duration={duration}
                  isClientComment={c.profiles?.role === 'client'}
                  onClick={handleSeek}
                />
              ))}
            </div>
          </div>

          {/* Bottom action panel */}
          <div className="px-5 py-4 bg-gray-900 border-t border-white/10 shrink-0">
            {actionError && (
              <p className="text-xs text-red-400 mb-2">{actionError}</p>
            )}
            {status === 'pending_client_review' && isClient && (
              <div className="flex gap-3">
                <button
                  onClick={handleSendFeedback}
                  disabled={submitting || comments.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/20 text-white border border-white/10 disabled:opacity-40 transition-all"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  Send Feedback
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-green-600 hover:bg-green-500 text-white disabled:opacity-40 transition-all"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Approve Draft
                </button>
              </div>
            )}
            {/* Editor/creative: show waiting state when client hasn't reviewed yet */}
            {status === 'pending_client_review' && isCreativeOrAdmin && !isClient && (
              <div className="flex items-center gap-3 text-sm text-white/50">
                <Loader2 size={15} className="text-blue-400 animate-spin shrink-0" />
                <span>Waiting on the client to review. You'll see their comments here once they send feedback.</span>
              </div>
            )}
            {status === 'pending_editor' && isCreativeOrAdmin && (
              <div className="flex items-center gap-3 text-sm text-white/50">
                <MessageSquare size={15} className="text-amber-400 shrink-0" />
                <span>The client left feedback. Review the comments, then upload the next draft from the drafts page.</span>
              </div>
            )}
            {status === 'pending_editor' && isClient && (
              <div className="flex items-center gap-3 text-sm text-white/50">
                <Loader2 size={15} className="text-blue-400 animate-spin shrink-0" />
                <span>Your feedback has been sent. The creative team is working on the next draft.</span>
              </div>
            )}
            {status === 'approved' && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-green-400 font-semibold flex items-center gap-2">
                  <Check size={16} /> Approved!
                </span>
                {version?.video_url && (
                  <DownloadButton
                    url={version.video_url}
                    label="Download Video"
                    className="ml-auto px-4 py-2 rounded-xl text-sm bg-white/10 hover:bg-white/20 text-white border border-white/10"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-900 border-l border-white/10 flex flex-col shrink-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 shrink-0">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">
              Comments
              {comments.length > 0 && (
                <span className="ml-1.5 bg-white/10 px-1.5 py-0.5 rounded-full text-[10px]">
                  {comments.length}
                </span>
              )}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {comments.length === 0 ? (
              <p className="text-xs text-white/30 text-center mt-10">
                {canAddComments
                  ? 'Click the timeline to leave a comment'
                  : status === 'pending_client_review' && isCreativeOrAdmin
                    ? 'Waiting for client comments…'
                    : 'No comments yet'}
              </p>
            ) : comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                canActOnComments={canActOnComments}
                onAccept={handleAccept}
                onDecline={handleDecline}
                updating={updatingComment}
                onSeek={handleSeek}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
