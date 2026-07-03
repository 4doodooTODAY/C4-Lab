import { useState, useRef } from 'react'
import { FileVideo, Image as ImageIcon } from 'lucide-react'

// ── MediaThumb — accurate thumbnails for photos and videos ────────────────────
// Photos render the real image; videos render an actual frame (~1s in) by
// letting the browser decode metadata + one frame. Falls back to a line-art
// icon if the media can't load. No storage or processing needed.
export default function MediaThumb({ videoUrl, photoUrl, size = 'w-10 h-10', className = '' }) {
  const [broken, setBroken] = useState(false)
  const videoRef = useRef(null)

  const frame = `${size} rounded-lg bg-surface-3 overflow-hidden shrink-0 flex items-center justify-center ${className}`

  if (photoUrl && !broken) {
    return (
      <div className={frame}>
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  if (videoUrl && !broken) {
    return (
      <div className={frame}>
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={() => {
            // Seek past any black leader frame for a representative thumb
            const v = videoRef.current
            if (v && v.duration) v.currentTime = Math.min(1, v.duration / 2)
          }}
          onError={() => setBroken(true)}
          className="w-full h-full object-cover pointer-events-none"
          tabIndex={-1}
        />
      </div>
    )
  }

  return (
    <div className={frame}>
      {videoUrl ? <FileVideo size={16} className="text-text-muted" /> : <ImageIcon size={16} className="text-text-muted" />}
    </div>
  )
}
