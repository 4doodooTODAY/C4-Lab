import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'

/**
 * Extracts a Google Drive file ID from various share URL formats:
 * - https://drive.google.com/file/d/{id}/view
 * - https://drive.google.com/open?id={id}
 * - https://drive.google.com/uc?id={id}
 */
function extractDriveFileId(url) {
  if (!url) return null
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

function buildVideoSrc(videoUrl) {
  if (!videoUrl) return null
  // Supabase Storage URL — use directly, supports range requests and full seeking
  if (videoUrl.includes('/storage/v1/object/public/')) return videoUrl
  // Direct video file URL — use as-is
  if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(videoUrl)) return videoUrl
  // Google Drive fallback — extract file ID and build download URL
  const fileId = extractDriveFileId(videoUrl)
  if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId}`
  // Last resort: use the URL directly
  return videoUrl
}

function isDriveUrl(videoUrl) {
  return videoUrl?.includes('drive.google.com')
}

/**
 * VideoPlayer exposes a seekTo(seconds) method via ref.
 * It calls onTimeUpdate(seconds) on every timeupdate event while playing.
 */
const VideoPlayer = forwardRef(function VideoPlayer({ videoUrl, onTimeUpdate }, ref) {
  const videoRef = useRef(null)
  const [error, setError] = useState(false)
  const src = buildVideoSrc(videoUrl)

  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      if (videoRef.current) {
        videoRef.current.currentTime = seconds
        videoRef.current.play().catch(() => {})
      }
    },
    getCurrentTime() {
      return videoRef.current?.currentTime ?? 0
    },
  }))

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handleTimeUpdate = () => onTimeUpdate?.(video.currentTime)
    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
  }, [onTimeUpdate])

  if (!src) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center rounded-xl">
        <p className="text-white/40 text-sm">No video source</p>
      </div>
    )
  }

  return (
    <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60 p-6 text-center">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-sm font-medium text-white">Unable to load video</p>
          <p className="text-xs text-white/50">
            {isDriveUrl(videoUrl)
              ? 'Make sure the Drive file is shared as "Anyone with the link can view". Large files may not stream reliably from Drive.'
              : 'Could not load the video. Check that the file exists and the Supabase storage bucket is set to public.'}
          </p>
        </div>
      ) : null}
      <video
        ref={videoRef}
        src={src}
        controls
        preload="metadata"
        onError={() => setError(true)}
        onLoadStart={() => setError(false)}
        className={error ? 'opacity-0' : ''}
      />
    </div>
  )
})

export default VideoPlayer
