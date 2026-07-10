// ── Gallery derivatives ──────────────────────────────────────────────────────
// Generates the two viewing derivatives for a gallery image:
//   thumb   ~400px  WebP (grid)
//   preview ~1600px WebP (lightbox)
// The ORIGINAL file is never touched — derivatives are separate blobs that go
// to the public shoot-previews bucket while the original goes untouched to the
// private shoot-originals bucket.

const THUMB_MAX   = 400
const PREVIEW_MAX = 1600
const TYPE        = 'image/webp'
const THUMB_Q     = 0.75
const PREVIEW_Q   = 0.82

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not decodable')) }
    img.src = url
  })
}

function scaleToCanvas(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  return canvas
}

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), TYPE, quality)
  )
}

/**
 * generateDerivatives(file) → { thumb: Blob, preview: Blob, width, height }
 * Throws if the file isn't a decodable image — caller decides how to handle
 * (gallery uploads are images-only, so a throw means "reject this file").
 */
export async function generateDerivatives(file) {
  const { img, url } = await loadImage(file)
  try {
    const width  = img.naturalWidth
    const height = img.naturalHeight
    const [thumb, preview] = await Promise.all([
      toBlob(scaleToCanvas(img, THUMB_MAX), THUMB_Q),
      toBlob(scaleToCanvas(img, PREVIEW_MAX), PREVIEW_Q),
    ])
    return { thumb, preview, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'avif', 'tif', 'tiff', 'bmp']
const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv']
const RAW_EXTS   = ['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'raw', 'srw', 'pef']
export function isGalleryImage(name = '') {
  return IMAGE_EXTS.includes(name.split('.').pop()?.toLowerCase() || '')
}
export function isRawImage(name = '') {
  return RAW_EXTS.includes(name.split('.').pop()?.toLowerCase() || '')
}

/**
 * extractEmbeddedJpeg(blob) → Blob | null
 * RAW files (CR2/NEF/ARW/DNG/…) embed one or more full JPEG previews. Scan the
 * bytes for JPEG start/end markers and return the largest segment — this is
 * how most raw-preview tools work, no decoder needed.
 */
export async function extractEmbeddedJpeg(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let best = null
  for (let i = 0; i < buf.length - 1; i++) {
    // SOI marker FF D8 FF
    if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && buf[i + 2] === 0xFF) {
      // find matching EOI FF D9 after it
      for (let j = i + 2; j < buf.length - 1; j++) {
        if (buf[j] === 0xFF && buf[j + 1] === 0xD9) {
          const len = j + 2 - i
          if (!best || len > best.len) best = { start: i, len }
          i = j // continue scanning after this segment
          break
        }
      }
    }
  }
  // Embedded previews under ~20KB are usually tiny 160px thumbs — still usable,
  // but require at least a plausible JPEG.
  if (!best || best.len < 4096) return null
  return new Blob([buf.slice(best.start, best.start + best.len)], { type: 'image/jpeg' })
}

/**
 * generateDerivativesFromBlob(blob) — same as generateDerivatives but for a
 * Blob that isn't a File (e.g. an extracted embedded JPEG).
 */
export async function generateDerivativesFromBlob(blob) {
  return generateDerivatives(blob)
}

/**
 * generatePlaceholder(fileName) → Blob (WebP tile)
 * For files the browser can't decode (RAW, ZIP, PDF, etc.). Renders a neutral
 * tile labelled with the file extension so the gallery always has a valid
 * thumbnail and the item stays downloadable at full quality.
 */
export async function generatePlaceholder(fileName = '') {
  const ext = (fileName.split('.').pop() || 'FILE').toUpperCase().slice(0, 5)
  const size = 600
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1f2430'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#6C63FF'
  ctx.font = 'bold 120px -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ext, size / 2, size / 2 - 30)
  ctx.fillStyle = '#9ca3af'
  ctx.font = '32px -apple-system, sans-serif'
  ctx.fillText('Download to open', size / 2, size / 2 + 70)
  return new Promise((resolve) => canvas.toBlob(resolve, TYPE, 0.9))
}
export function isGalleryVideo(name = '') {
  return VIDEO_EXTS.includes(name.split('.').pop()?.toLowerCase() || '')
}
export function isGalleryMedia(name = '') {
  return isGalleryImage(name) || isGalleryVideo(name)
}

/**
 * generatePreviewFromUrl(url) → Blob (~1600px WebP)
 * Builds a compressed preview from an already-hosted image (R2 serves
 * Access-Control-Allow-Origin: *, so the canvas isn't tainted). Used to
 * backfill previews for photo revisions uploaded before previews existed.
 */
export async function generatePreviewFromUrl(url) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
  return toBlob(scaleToCanvas(img, PREVIEW_MAX), PREVIEW_Q)
}

/**
 * sha256Hex(file) → lowercase hex SHA-256 of the raw file bytes.
 * Used for exact-duplicate detection only: two files are duplicates iff their
 * hashes are byte-for-byte identical. No perceptual/similarity matching.
 */
export async function sha256Hex(file) {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * runPool(items, worker, concurrency) — run `worker(item, index)` over items
 * with a fixed concurrency cap. Rejections are caught per-item; the pool
 * always drains. Returns per-item results ({ ok, value | error }).
 */
export async function runPool(items, worker, concurrency = 3) {
  const results = new Array(items.length)
  let next = 0
  async function lane() {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { ok: true, value: await worker(items[i], i) }
      } catch (error) {
        results[i] = { ok: false, error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane))
  return results
}
