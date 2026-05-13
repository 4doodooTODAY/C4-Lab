import { useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import VideoPlayer from '../components/video/VideoPlayer'
import CommentSidebar from '../components/video/CommentSidebar'
import AddCommentBar from '../components/video/AddCommentBar'
import { useMediaItem } from '../hooks/useMedia'
import { useMediaComments } from '../hooks/useMediaComments'

export default function VideoReview() {
  const { id } = useParams()
  const { item: media, loading: mediaLoading } = useMediaItem(id)
  const { comments, loading: commentsLoading, addComment, deleteComment, resolveComment } = useMediaComments(id)
  const playerRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)

  const handleSeek = useCallback((seconds) => {
    playerRef.current?.seekTo(seconds)
  }, [])

  const handleTimeUpdate = useCallback((t) => {
    setCurrentTime(t)
  }, [])

  if (mediaLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    )
  }

  if (!media) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-muted text-sm">Video not found.</p>
        <Link to="/videos" className="text-accent text-sm mt-2 inline-block">← Back to videos</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-5 py-3 bg-white border-b border-border shrink-0">
        <Link to="/videos" className="btn-ghost p-1.5 -ml-1.5 text-text-muted">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-text-primary truncate">{media.title}</h1>
          {media.description && (
            <p className="text-xs text-text-muted truncate">{media.description}</p>
          )}
        </div>
        {/* Status badge */}
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
          media.status === 'approved' ? 'bg-green-100 text-green-700' :
          media.status === 'changes_requested' ? 'bg-amber-100 text-amber-700' :
          'bg-surface-3 text-text-muted'
        }`}>
          {media.status?.replace('_', ' ') || 'Awaiting review'}
        </span>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: video + add comment bar */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="flex-1 bg-black flex items-center justify-center p-4 overflow-hidden">
            <div className="w-full max-w-4xl">
              <VideoPlayer
                ref={playerRef}
                videoUrl={media.media_url}
                onTimeUpdate={handleTimeUpdate}
              />
            </div>
          </div>
          <AddCommentBar currentTime={currentTime} onAdd={addComment} />
        </div>

        {/* Right: comment sidebar */}
        <aside className="w-[300px] shrink-0 bg-white border-l border-border flex flex-col overflow-hidden">
          <CommentSidebar
            comments={comments}
            loading={commentsLoading}
            currentTime={currentTime}
            onSeek={handleSeek}
            onDelete={deleteComment}
            onResolve={resolveComment}
          />
        </aside>
      </div>
    </div>
  )
}
