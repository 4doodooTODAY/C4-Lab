// ── Client-side thumbnail generation ─────────────────────────────────────────
// Generates a small JPEG thumbnail from an image or video File object.
// Returns a Blob (JPEG) or null if generation fails.

const THUMB_SIZE = 400   // max dimension in px
const THUMB_TYPE = 'image/jpeg'
const THUMB_QUALITY = 0.75

const VIDEO_EXTS = ['mp4','mov','avi','mkv','webm','m4v']
const IMAGE_EXTS = ['jpg','jpeg','png','gif','webp','heic','raw','cr2','arw']

export function fileExt(name = '') {
  return name.split('.').pop()?.toLowerCase() || ''
}

export function isVideoFile(name) { return VIDEO_EXTS.includes(fileExt(name)) }
export function isImageFile(name) { return IMAGE_EXTS.includes(fileExt(name)) }

function drawToCanvas(source, naturalW, naturalH) {
  const scale = Math.min(1, THUMB_SIZE / Math.max(naturalW, naturalH))
  const w = Math.round(naturalW * scale)
  const h = Math.round(naturalH * scale)
  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  canvas.getContext('2d').drawImage(source, 0, 0, w, h)
  return canvas
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, THUMB_TYPE, THUMB_QUALITY))
}

function generateImageThumb(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight)
        canvasToBlob(canvas).then(resolve).catch(() => resolve(null))
      } catch { resolve(null) }
      finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

function generateVideoThumb(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted    = true
    video.playsInline = true
    video.preload  = 'metadata'

    const cleanup = () => {
      try { video.src = '' } catch {}
      URL.revokeObjectURL(url)
    }

    video.onloadeddata = () => {
      // Seek to 1s or midpoint, whichever is smaller
      video.currentTime = Math.min(1, (video.duration || 0) / 2)
    }

    video.onseeked = () => {
      try {
        const canvas = drawToCanvas(video, video.videoWidth, video.videoHeight)
        canvasToBlob(canvas)
          .then((blob) => { cleanup(); resolve(blob) })
          .catch(() => { cleanup(); resolve(null) })
      } catch { cleanup(); resolve(null) }
    }

    video.onerror = () => { cleanup(); resolve(null) }

    // Timeout safety — some codecs (HEVC) won't load in browser
    const timer = setTimeout(() => { cleanup(); resolve(null) }, 8000)
    video.onseeked = (fn => () => { clearTimeout(timer); fn() })(video.onseeked)
    video.onerror  = (fn => () => { clearTimeout(timer); fn() })(video.onerror)

    video.src = url
    video.load()
  })
}

/**
 * generateThumbnail(file) → Blob | null
 * Works for images and videos. Returns null on any failure — caller should
 * treat null as "no thumbnail" and proceed without one.
 */
export async function generateThumbnail(file) {
  try {
    if (isImageFile(file.name)) return await generateImageThumb(file)
    if (isVideoFile(file.name)) return await generateVideoThumb(file)
    return null
  } catch {
    return null
  }
}
