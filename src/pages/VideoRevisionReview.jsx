import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, MessageSquare, Check, X, Plus,
  Send, ThumbsUp, Camera, Download,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { notify, notifyMany, notifyAdmins } from '../lib/notify'
import Avatar from '../components/ui/Avatar'
import DownloadButton from '../components/ui/DownloadButton'

// ── Helpers ───────────────────────────────────────────────────────────────────

// "Initial Cut" for first upload; "Revision N" for subsequent client-driven rounds
function revisionLabel(n) {
  return n === 1 ? 'Initial Cut' : `Revision ${n - 1}`
}

// Snap a raw float timestamp to the nearest 0.25s increment
function snapToQuarter(s) {
  return Math.round(s * 4) / 4
}

// Format a timestamp; shows fractional quarter-seconds when non-zero
// e.g. 83.25 → "1:23.25", 83.0 → "1:23"
function fmtTime(s) {
  if (s == null || isNaN(s)) return '0:00'
  const snapped = snapToQuarter(s)
  const m   = Math.floor(snapped / 60)
  const sec = Math.floor(snapped % 60)
  const frac = Math.round((snapped - Math.floor(snapped)) * 100)
  const fracStr = frac > 0 ? `.${frac.toString().padStart(2, '0')}` : ''
  return `${m}:${sec.toString().padStart(2, '0')}${fracStr}`
}

// ── Comment dot on timeline ───────────────────────────────────────────────────
function TimelineDot({ comment, duration, isCreative, onClick }) {
  const [hover, setHover] = useState(false)
  const left = duration > 0 ? (comment.timestamp_seconds / duration) * 100 : 0
  const color = isCreative ? '#a855f7' : '#3b82f6' // purple / blue

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
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-purple-500/50"
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
          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 flex items-center justify-center gap-1 transition-all"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Post
        </button>
      </div>
    </div>
  )
}

// ── Comment item in sidebar ───────────────────────────────────────────────────
function CommentItem({ comment, viewerRole, isClient, onAccept, onDecline, updating }) {
  const isCreativeAuthor = comment.author_role === 'creative' || comment.author_role === 'admin'

  const borderColor = comment.status === 'accepted'
    ? 'border-green-500/40'
    : comment.status === 'declined'
    ? 'border-red-500/20 opacity-50'
    : 'border-white/10'

  return (
    <div className={`border ${borderColor} rounded-xl p-3 transition-all`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white/70">
          {fmtTime(comment.timestamp_seconds)}
        </span>
        <Avatar name={comment.profiles?.full_name} url={comment.profiles?.avatar_url} size={6} />
        <span className="text-xs text-white/60 truncate flex-1">{comment.profiles?.full_name || 'Unknown'}</span>
        {comment.status === 'accepted' && (
          <span className="text-[10px] text-green-400 font-semibold">Accepted</span>
        )}
        {comment.status === 'declined' && (
          <span className="text-[10px] text-red-400 font-semibold">Declined</span>
        )}
      </div>
      <p className="text-sm text-white/80 leading-relaxed">{comment.content}</p>

      {/* Client can accept/decline creative's pending comments */}
      {isClient && isCreativeAuthor && comment.status === 'pending' && (
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={() => onAccept(comment.id)}
            disabled={updating === comment.id}
            className="flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-300 border border-green-500/20 transition-all disabled:opacity-50"
          >
            {updating === comment.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Accept
          </button>
          <button
            onClick={() => onDecline(comment.id)}
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
export default function VideoRevisionReview() {
  const { id, revisionId } = useParams()
  const navigate           = useNavigate()
  const { profile, isAdmin: ctxIsAdmin } = useAuth()

  const videoRef      = useRef(null)
  const timelineRef   = useRef(null)

  const [revision,         setRevision]         = useState(null)
  const [project,          setProject]          = useState(null)
  const [comments,         setComments]         = useState([])
  const [projectEditorIds, setProjectEditorIds] = useState([])
  const [editorName,       setEditorName]       = useState('')
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState('')

  const [duration,  setDuration]  = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  // Add comment popover
  const [popover,   setPopover]   = useState(null) // { x, y, timestamp }
  const [addingFromPanel, setAddingFromPanel] = useState(false)

  // Action states
  const [updatingComment, setUpdatingComment] = useState(null)
  const [submittingAction, setSubmittingAction] = useState(false)
  const [actionError, setActionError] = useState('')

  const fetchAll = useCallback(async () => {
    if (!revisionId) return
    try {
      const [revRes, commRes] = await Promise.all([
        supabase
          .from('project_revisions')
          .select('*, projects(id, name, creative_id, editor_id, client_id, revision_count)')
          .eq('id', revisionId)
          .single(),
        supabase
          .from('revision_comments')
          .select('*, profiles(id, full_name, avatar_url, role)')
          .eq('revision_id', revisionId)
          .order('timestamp_seconds'),
      ])
      if (revRes.error) throw revRes.error
      setRevision(revRes.data)
      setProject(revRes.data.projects)

      // Fetch all editors for this project
      const { data: editors } = await supabase
        .from('project_editors')
        .select('profile_id, profiles(id, full_name)')
        .eq('project_id', revRes.data.projects.id)
      setProjectEditorIds((editors || []).map((r) => r.profile_id))
      const firstName = editors?.[0]?.profiles?.full_name
      if (!firstName && revRes.data.projects.editor_id) {
        const { data: ep } = await supabase.from('profiles').select('full_name').eq('id', revRes.data.projects.editor_id).single()
        setEditorName(ep?.full_name || '')
      } else {
        setEditorName(firstName || '')
      }

      // Attach author_role from profiles join
      const enriched = (commRes.data || []).map((c) => ({
        ...c,
        author_role: c.profiles?.role,
      }))
      setComments(enriched)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [revisionId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const myRole         = profile?.role
  const myId           = profile?.id
  const isAdmin        = ctxIsAdmin  // respects creative view mode
  const isPhotographer = myRole === 'creative' || (project && project.creative_id === myId)
  const isEditor       = projectEditorIds.includes(myId) || (project && project.editor_id === myId)
  const isCreative     = isPhotographer || isEditor  // legacy compat
  const isClient       = myRole === 'client'

  // ── Timeline click → seek + popover ──────────────────────────────────────
  const handleTimelineClick = (e) => {
    if (!timelineRef.current || !duration) return
    const rect  = timelineRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const raw   = Math.max(0, Math.min(duration, ratio * duration))
    const ts    = snapToQuarter(raw) // snap to nearest 0.25s
    if (videoRef.current) videoRef.current.currentTime = ts
    setPopover({ x: e.clientX - rect.left, timestamp: ts })
    setAddingFromPanel(false)
  }

  const seekTo = (ts) => {
    if (videoRef.current) videoRef.current.currentTime = ts
  }

  // ── Post comment ──────────────────────────────────────────────────────────
  const handlePostComment = async (timestamp, text) => {
    try {
      const { error } = await supabase.from('revision_comments').insert({
        revision_id:       revisionId,
        author_id:         myId,
        timestamp_seconds: timestamp,
        content:           text,
      })
      if (error) throw error
      setPopover(null)
      setAddingFromPanel(false)
      fetchAll()
    } catch (err) {
      setActionError(err.message)
    }
  }

  // ── Accept / Decline comment ──────────────────────────────────────────────
  const handleAccept = async (commentId) => {
    setUpdatingComment(commentId)
    await supabase.from('revision_comments').update({ status: 'accepted' }).eq('id', commentId)
    setUpdatingComment(null)
    fetchAll()
  }

  const handleDecline = async (commentId) => {
    setUpdatingComment(commentId)
    await supabase.from('revision_comments').update({ status: 'declined' }).eq('id', commentId)
    setUpdatingComment(null)
    fetchAll()
  }

  // ── Photographer: done reviewing — hand off to client ─────────────────────
  const handlePhotographerDone = async () => {
    setSubmittingAction(true)
    setActionError('')
    try {
      const { error: e } = await supabase.from('project_revisions')
        .update({ status: 'pending_client_review' })
        .eq('id', revisionId)
      if (e) throw new Error(e.message)

      // Notify the client
      const projectLink = `/projects/${project.id}`
      if (project.client_id) {
        const { data: clientRow } = await supabase
          .from('clients').select('profile_id').eq('id', project.client_id).maybeSingle()
        if (clientRow?.profile_id) {
          await notify({
            profileId: clientRow.profile_id, actorId: myId,
            type: 'photographer_reviewed',
            title: `Your ${revisionLabel(revNum)} is ready to review`,
            body: `The photographer has left their notes on "${project.name}". Watch the video and send your feedback.`,
            link: `/projects/${project.id}/revision/${revisionId}`,
          })
        }
      }
      await notifyAdmins({
        actorId: myId, type: 'photographer_reviewed',
        title: `Photographer review complete on "${project.name}"`,
        body: `${revisionLabel(revNum)} is now with the client.`,
        link: projectLink,
      })

      fetchAll()
    } catch (err) {
      setActionError(err.message || 'Failed — check permissions')
    } finally {
      setSubmittingAction(false)
    }
  }

  // ── Legacy: creative submit for client review (kept for compat) ───────────
  const handleSubmitForClient = handlePhotographerDone

  // ── Client: send feedback to editor ──────────────────────────────────────
  const handleSendToEditor = async () => {
    setSubmittingAction(true)
    setActionError('')
    try {
      const { error: e1 } = await supabase.from('project_revisions')
        .update({ status: 'pending_editor' })
        .eq('id', revisionId)
      if (e1) throw new Error(e1.message)

      const { error: e2 } = await supabase.from('projects')
        .update({ stage: 'post_production' })
        .eq('id', project.id)
      if (e2) throw new Error(e2.message)

      // Notify all editors
      const projectLink = `/projects/${project.id}`
      const editorIds = projectEditorIds.length ? projectEditorIds : [project.editor_id].filter(Boolean)
      await Promise.all(editorIds.map((eid) => notify({
        profileId: eid, actorId: myId,
        type: 'client_feedback_sent',
        title: `Client sent feedback on "${project.name}"`,
        body: `Review the comments and upload a revised cut.`,
        link: `/projects/${project.id}/revision/${revisionId}`,
      })))
      await notifyAdmins({
        actorId: myId, type: 'client_feedback_sent',
        title: `Client feedback sent to editor on "${project.name}"`,
        link: projectLink,
      })

      fetchAll()
    } catch (err) {
      setActionError(err.message || 'Failed — check permissions')
    } finally {
      setSubmittingAction(false)
    }
  }

  // ── Client: approve final ─────────────────────────────────────────────────
  const handleApprove = async () => {
    setSubmittingAction(true)
    setActionError('')
    try {
      // Mark revision approved
      const { error: e1 } = await supabase.from('project_revisions')
        .update({ status: 'approved' })
        .eq('id', revisionId)
      if (e1) throw new Error(e1.message)

      // Move project to ready_to_post — admin must mark it posted before delivered
      const { error: e2 } = await supabase.from('projects')
        .update({ stage: 'ready_to_post' })
        .eq('id', project.id)
      if (e2) throw new Error(e2.message)

      // Notify the editor + all admins
      const projectName = project.name || 'Your project'
      const link = `/projects/${project.id}`
      const notifTargets = []

      // All editors
      const allEditorIds = projectEditorIds.length ? projectEditorIds : [project.editor_id].filter(Boolean)
      allEditorIds.forEach((eid) => notifTargets.push(eid))

      // All admins
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
      ;(admins || []).forEach((a) => {
        if (!notifTargets.includes(a.id)) notifTargets.push(a.id)
      })

      if (notifTargets.length) {
        await supabase.from('notifications').insert(
          notifTargets.map((profile_id) => ({
            profile_id,
            actor_id:  myId,
            type:      'revision_approved',
            title:     'Client approved the video ✅',
            body:      `"${projectName}" has been approved and is ready to post.`,
            link,
          }))
        )
      }

      fetchAll()
    } catch (err) {
      setActionError(err.message || 'Failed — check permissions (see console)')
      console.error('Approve failed:', err)
    } finally {
      setSubmittingAction(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0f0f0f]">
      <Loader2 size={24} className="animate-spin text-white/30" />
    </div>
  )

  if (error || !revision) return (
    <div className="min-h-screen bg-[#0f0f0f] p-8">
      <p className="text-white/50 text-sm">{error || 'Revision not found.'}</p>
    </div>
  )

  const revNum      = revision.revision_number
  const revStatus   = revision.status
  const revCount    = project?.revision_count || revNum
  const canRevise   = revCount < 3
  const projectName = project?.name || '—'

  const creativeComments = comments.filter((c) => c.author_role !== 'client')
  const clientComments   = comments.filter((c) => c.author_role === 'client')

  const REVISION_STATUS_LABELS = {
    pending_photographer_review: 'Photographer Review',
    pending_creative_review:     'Creative Review',
    pending_client_review:       '👀 Your Review',
    pending_editor:              "🔔 Editor's Turn",
    approved:                    '✓ Approved',
  }

  const STATUS_BADGE_COLORS = {
    pending_photographer_review: 'bg-amber-500/20 text-amber-300',
    pending_creative_review:     'bg-amber-500/20 text-amber-300',
    pending_client_review:       'bg-blue-500/20 text-blue-300',
    pending_editor:              'bg-orange-500/20 text-orange-300',
    approved:                    'bg-green-500/20 text-green-300',
  }

  const editor = editorName || 'your editor'
  const whosUpBanner = (() => {
    if (revStatus === 'pending_client_review' && isClient) return {
      bg: 'bg-blue-900/40 border-blue-500/30', icon: '🎬', textColor: 'text-blue-200',
      title: `${editor} sent you a video to review`,
      sub: 'Watch it through, then drop timestamped comments anywhere on the timeline — or approve if it looks great.',
    }
    if (revStatus === 'pending_editor' && isClient) return {
      bg: 'bg-amber-900/30 border-amber-500/30', icon: '⏳', textColor: 'text-amber-200',
      title: `Your feedback is with ${editor}`,
      sub: "They've been notified and are working on the changes. We'll let you know when a new cut is ready.",
    }
    if (revStatus === 'pending_client_review' && (isEditor || isPhotographer || isAdmin)) return {
      bg: 'bg-blue-900/40 border-blue-500/30', icon: '👀', textColor: 'text-blue-200',
      title: 'Waiting for client review',
      sub: "The client has been notified. You'll be alerted as soon as they respond.",
    }
    if (revStatus === 'pending_editor' && (isEditor || isAdmin)) return {
      bg: 'bg-orange-900/40 border-orange-500/30', icon: '🔔', textColor: 'text-orange-200',
      title: "Client sent feedback — it's your turn",
      sub: 'Review their timestamped comments and upload a revised cut when ready.',
    }
    if ((revStatus === 'pending_photographer_review' || revStatus === 'pending_creative_review') && (isPhotographer || isAdmin) && !isClient) return {
      bg: 'bg-amber-900/40 border-amber-500/30', icon: '👀', textColor: 'text-amber-200',
      title: 'Review this cut before the client sees it',
      sub: 'The editor sent you a new cut. Watch it through, leave timestamped notes if needed, then approve and send it to the client.',
    }
    if ((revStatus === 'pending_photographer_review' || revStatus === 'pending_creative_review') && isClient) return {
      bg: 'bg-amber-900/30 border-amber-500/30', icon: '⏳', textColor: 'text-amber-200',
      title: 'Your team is reviewing the latest cut',
      sub: "It's being checked internally before it reaches you. We'll let you know the moment it's ready for your review.",
    }
    if (revStatus === 'approved') return {
      bg: 'bg-green-900/40 border-green-500/30', icon: '✅', textColor: 'text-green-200',
      title: 'Video approved!',
      sub: isClient ? 'You approved this cut.' : 'The client approved this revision.',
    }
    return null
  })()

  return (
    <div className="flex flex-col min-h-screen bg-[#0f0f0f] text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="text-sm font-semibold text-white">{projectName}</p>
            <p className="text-xs text-white/40">{revisionLabel(revNum)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE_COLORS[revStatus] || 'bg-white/10 text-white/50'}`}>
            {REVISION_STATUS_LABELS[revStatus] || revStatus}
          </span>
          <div className="flex items-center gap-2">
            <Avatar name={profile?.full_name} url={profile?.avatar_url} size={7} />
            <span className="text-xs text-white/50">{profile?.full_name}</span>
          </div>
        </div>
      </div>

      {/* Who's up banner */}
      {whosUpBanner && (
        <div className={`px-5 py-2.5 border-b ${whosUpBanner.bg} flex items-center gap-3 shrink-0`}>
          <span className="text-base leading-none">{whosUpBanner.icon}</span>
          <div className="flex-1 min-w-0">
            <span className={`text-sm font-semibold ${whosUpBanner.textColor}`}>{whosUpBanner.title} </span>
            <span className={`text-xs ${whosUpBanner.textColor} opacity-75`}>{whosUpBanner.sub}</span>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video area — 65% */}
        <div className="flex-1 flex flex-col p-5 gap-4 min-w-0">
          {/* Video player */}
          <div className="bg-black rounded-xl overflow-hidden flex-1 flex items-center justify-center relative">
            <video
              ref={videoRef}
              src={revision.video_url}
              className="max-h-full max-w-full w-full"
              controls
              onClick={() => {
                if (videoRef.current?.paused) videoRef.current.play()
                else videoRef.current?.pause()
              }}
              onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
              onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            />
          </div>

          {/* Timeline */}
          <div className="bg-white/5 rounded-xl p-3">
            <div
              ref={timelineRef}
              className="relative h-6 bg-white/10 rounded-full cursor-crosshair"
              onClick={handleTimelineClick}
            >
              {/* Progress fill */}
              {duration > 0 && (
                <div
                  className="absolute top-0 left-0 h-full bg-white/20 rounded-full pointer-events-none"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              )}

              {/* Comment dots */}
              {comments.map((c) => (
                <TimelineDot
                  key={c.id}
                  comment={c}
                  duration={duration}
                  isCreative={c.author_role !== 'client'}
                  onClick={seekTo}
                />
              ))}
            </div>

            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-white/30">{fmtTime(currentTime)}</span>
              <span className="text-xs text-white/30 flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Creative
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Client
                </span>
              </span>
              <span className="text-xs text-white/30">{fmtTime(duration)}</span>
            </div>
          </div>

          {/* Popover for adding comment */}
          {popover && (
            <div className="relative">
              <div
                style={{ left: Math.min(popover.x, timelineRef.current?.offsetWidth - 280 || 0) }}
                className="absolute -top-2 z-50"
              >
                <AddCommentPopover
                  timestamp={popover.timestamp}
                  onPost={handlePostComment}
                  onCancel={() => setPopover(null)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right panel — 35% */}
        <div className="w-[380px] shrink-0 border-l border-white/5 flex flex-col bg-[#111]">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-white/40" />
              <span className="text-sm font-semibold text-white">Comments</span>
              <span className="text-xs text-white/30 bg-white/10 px-1.5 py-0.5 rounded-full">{comments.length}</span>
            </div>
            <button
              onClick={() => {
                const ts = videoRef.current?.currentTime || 0
                setPopover(null)
                setAddingFromPanel(true)
              }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/20 transition-all"
            >
              <Plus size={12} /> Add comment
            </button>
          </div>

          {/* Panel add comment (from button) */}
          {addingFromPanel && (
            <div className="p-4 border-b border-white/5">
              <AddCommentPopover
                timestamp={videoRef.current?.currentTime || 0}
                onPost={handlePostComment}
                onCancel={() => setAddingFromPanel(false)}
              />
            </div>
          )}

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {comments.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquare size={28} className="mx-auto text-white/20 mb-2" />
                <p className="text-sm text-white/30">No comments yet.</p>
                <p className="text-xs text-white/20 mt-1">Click on the timeline to add one.</p>
              </div>
            ) : (
              comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  viewerRole={myRole}
                  isClient={isClient}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                  updating={updatingComment}
                />
              ))
            )}
          </div>

          {/* Panel footer actions */}
          <div className="px-4 py-4 border-t border-white/5 space-y-2">
            {actionError && (
              <p className="text-xs text-red-400 mb-2">{actionError}</p>
            )}

            {/* Photographer: done reviewing — hand off to client */}
            {(isPhotographer || isAdmin) && (revStatus === 'pending_photographer_review' || revStatus === 'pending_creative_review') && (
              <>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Camera size={12} className="text-amber-300" />
                    <p className="text-xs text-amber-300 font-semibold">You're reviewing the editor's cut</p>
                  </div>
                  <p className="text-xs text-white/50">The client can't see this yet. Click the timeline to leave timestamped notes, then approve it to send to the client.</p>
                </div>
                <button
                  onClick={handlePhotographerDone}
                  disabled={submittingAction}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {submittingAction ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Approve & Send to Client
                </button>
              </>
            )}

            {/* Client: review photographer's notes, add your own, then send or approve */}
            {(isClient || isAdmin) && revStatus === 'pending_client_review' && (
              <>
                {creativeComments.length > 0 && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mb-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Camera size={12} className="text-purple-300" />
                      <p className="text-xs text-purple-300 font-semibold">Photographer left {creativeComments.length} note{creativeComments.length !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-xs text-white/50">Accept or decline each note, then add your own if needed.</p>
                  </div>
                )}
                {!canRevise && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-1">
                    <p className="text-xs text-orange-300 font-semibold mb-0.5">Maximum revisions reached</p>
                    <p className="text-xs text-white/40">You've used all 3 revision rounds. Please approve to finalize this project.</p>
                  </div>
                )}
                {canRevise && (
                  <button
                    onClick={handleSendToEditor}
                    disabled={submittingAction}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    {submittingAction ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Send to Editor
                  </button>
                )}
                <button
                  onClick={handleApprove}
                  disabled={submittingAction}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {submittingAction ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                  {canRevise ? 'Approve Final' : 'Approve & Finalize'}
                </button>
              </>
            )}

            {/* Editor: summary of accepted comments to fix */}
            {isEditor && !isAdmin && revStatus === 'pending_editor' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <p className="text-xs text-amber-300 font-medium mb-1">Upload the next revision</p>
                <p className="text-xs text-white/40">
                  {comments.filter((c) => c.status === 'accepted').length} accepted note{comments.filter((c) => c.status === 'accepted').length !== 1 ? 's' : ''} to address. Go to the project page to upload your revised cut.
                </p>
              </div>
            )}

            {revStatus === 'approved' && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                <p className="text-sm font-semibold text-green-400 mb-0.5">Approved! 🎉</p>
                <p className="text-xs text-white/40 mb-3">This revision has been approved.</p>
                {revision.video_url && (
                  <DownloadButton
                    url={revision.video_url}
                    label="Download Video"
                    className="w-full py-2.5 px-4 rounded-xl bg-accent text-white text-sm hover:bg-accent/90"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
