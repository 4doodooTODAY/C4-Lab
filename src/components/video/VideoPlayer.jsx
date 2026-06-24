import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

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
  if (videoUrl.includes('/storage/v1/object/public/')) return videoUrl
  if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(videoUrl)) return videoUrl
  const fileId = extractDriveFileId(videoUrl)
  if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId}`
  return videoUrl
}

function isDriveUrl(videoUrl) {
  return videoUrl?.includes('drive.google.com')
}

const VideoPlayer = forwardRef(function VideoPlayer({ videoUrl, onTimeUpdate }, ref) {
  const videoRef = useRef(null)
  const [error, setError]     = useState(false)
  const [loading, setLoading] = useState(true)
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

  // Reset loading state when src changes
  useEffect(() => {
    setError(false)
    setLoading(true)
  }, [src])

  if (!src) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center rounded-xl">
        <p className="text-white/40 text-sm">No video source</p>
      </div>
    )
  }

  return (
    <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative">
      {/* Loading spinner */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <Loader2 size={36} className="text-white/50 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60 p-6 text-center z-10">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-sm font-medium text-white">Unable to load video</p>
          <p className="text-xs text-white/50">
            {isDriveUrl(videoUrl)
              ? 'Make sure the Drive file is shared as "Anyone with the link can view".'
              : 'Could not load the video. The file may still be processing — try again in a moment.'}
          </p>
        </div>
      )}

      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        className={`w-full h-full object-contain ${error ? 'opacity-0' : ''}`}
        onLoadStart={() => { setError(false); setLoading(true) }}
        onCanPlay={() => setLoading(false)}
        onError={() => { setError(true); setLoading(false) }}
      />
    </div>
  )
})

export default VideoPlayer
