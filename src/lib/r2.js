import { supabase } from './supabase'
import { uploadStore } from './uploadStore'

// ── Config ────────────────────────────────────────────────────────────────────
const CHUNK_SIZE     = 12 * 1024 * 1024   // 12 MB per part — smaller parts keep the worker pool saturated
const PARALLEL_PARTS = 10                  // simultaneous part uploads (continuous worker pool)
const MULTIPART_MIN  = 8 * 1024 * 1024    // use multipart for files ≥ 8 MB

// ── Sliding-window speed estimator ───────────────────────────────────────────
// Keeps a ring of (timestamp, cumulative-bytes) samples over the last WINDOW_MS.
// Speed = Δbytes / Δtime over the window, which adapts quickly to real network
// conditions without the jitter of instant speed or lag of a global average.
const WINDOW_MS = 6000

class SpeedEstimator {
  constructor() { this._samples = [] }

  record(loaded) {
    const now = Date.now()
    this._samples.push({ t: now, loaded })
    const cutoff = now - WINDOW_MS
    // Keep one sample just before the cutoff so the window always has a left edge
    let dropTo = 0
    while (dropTo + 1 < this._samples.length && this._samples[dropTo + 1].t < cutoff) dropTo++
    if (dropTo > 0) this._samples = this._samples.slice(dropTo)
  }

  speed() {
    if (this._samples.length < 2) return 0
    const oldest = this._samples[0]
    const newest = this._samples[this._samples.length - 1]
    const dt = (newest.t - oldest.t) / 1000
    const db = newest.loaded - oldest.loaded
    return dt > 0.1 ? db / dt : 0
  }
}

// ── Auth header helper — cached for 50s to avoid repeated getSession() calls ──
let _cachedHeaders = null
let _cachedAt = 0
async function authHeaders() {
  const now = Date.now()
  if (_cachedHeaders && now - _cachedAt < 50_000) return _cachedHeaders
  const { data: { session } } = await supabase.auth.getSession()
  _cachedHeaders = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${session?.access_token}`,
    'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
  _cachedAt = now
  return _cachedHeaders
}

const EDGE = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-upload`

async function callEdge(body) {
  const res = await fetch(EDGE(), {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Edge function error')
  return json
}

/**
 * warmUp — call this early (e.g. when upload modal opens) to prime the
 * Supabase edge function and reduce cold-start latency on first upload.
 */
export function warmUp() {
  authHeaders().then((h) => {
    fetch(EDGE(), { method: 'OPTIONS', headers: h }).catch(() => {})
  }).catch(() => {})
}

// ── Upload a single part via XHR ─────────────────────────────────────────────
// We don't capture ETags here — CORS blocks that header on presigned URLs.
// The edge function calls ListParts server-side to get real ETags at complete time.
function uploadPart(url, chunk, onLoaded, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onLoaded(e.loaded) }
    xhr.onload  = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Part upload failed: HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Part upload network error'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(chunk)
  })
}

// ── Single PUT for small files ────────────────────────────────────────────────
function uploadSingle(uploadUrl, file, onProgress, onStats, signal, storeId) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true })

    const est = new SpeedEstimator()

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return
      est.record(e.loaded)
      const pct   = Math.round((e.loaded / e.total) * 100)
      const speed = est.speed()
      const eta   = speed > 0 ? (e.total - e.loaded) / speed : null
      if (onProgress) onProgress(pct)
      if (onStats)    onStats({ speed, eta, loaded: e.loaded, total: e.total })
      if (storeId != null) uploadStore.update(storeId, { loaded: e.loaded, speed, eta })
    }

    xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Upload network error — check R2 CORS settings'))
    xhr.send(file)
  })
}

// ── Multipart parallel upload for large files ─────────────────────────────────
async function uploadMultipart({ file, key, publicUrl, uploadId, partUrls, onProgress, onStats, signal, storeId }) {
  const totalParts  = partUrls.length
  const bytesLoaded = new Array(totalParts).fill(0)
  const est         = new SpeedEstimator()

  const reportProgress = () => {
    const loaded = bytesLoaded.reduce((a, b) => a + b, 0)
    est.record(loaded)
    const pct   = Math.round((loaded / file.size) * 100)
    const speed = est.speed()
    const eta   = speed > 0 ? (file.size - loaded) / speed : null
    if (onProgress) onProgress(pct)
    if (onStats)    onStats({ speed, eta, loaded, total: file.size })
    if (storeId != null) uploadStore.update(storeId, { loaded, speed, eta })
  }

  try {
    // 2. Upload parts via a continuous worker pool. Unlike fixed batches, a pool
    //    never waits for a slow part before starting the next one — as soon as any
    //    worker frees up it grabs the next index, keeping all lanes saturated.
    let nextPart = 0
    const worker = async () => {
      while (true) {
        if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
        const partIdx = nextPart++
        if (partIdx >= totalParts) return
        const start = partIdx * CHUNK_SIZE
        const end   = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)
        await uploadPart(partUrls[partIdx], chunk, (loaded) => {
          bytesLoaded[partIdx] = loaded
          reportProgress()
        }, signal)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL_PARTS, totalParts) }, () => worker())
    )

    // 3. Complete — edge function uses ListParts to get ETags server-side
    await callEdge({ action: 'multipart-complete', key, uploadId })
    if (onProgress) onProgress(100)
    if (storeId != null) uploadStore.update(storeId, { loaded: file.size, speed: 0, eta: 0 })
    return { publicUrl, key }
  } catch (err) {
    // Best-effort abort to clean up the incomplete upload in R2
    callEdge({ action: 'multipart-abort', key, uploadId }).catch(() => {})
    throw err
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function uploadToR2({ file, category, clientName, projectName, folderType, shootDate, onProgress, onStats, signal, normalizeVideo, onConvert }) {
  // For client-reviewed videos, guarantee a web-playable codec (HEVC → H.264)
  // before upload so clients never get a black screen with audio.
  if (normalizeVideo) {
    const { ensureWebPlayableVideo } = await import('./videoConvert')
    file = await ensureWebPlayableVideo(file, {
      onStage: (stage) => onConvert?.({ stage }),
      onProgress: (pct) => onConvert?.({ stage: 'converting', pct }),
    })
  }

  // Register with global upload store so the app-wide progress bar tracks this file
  const storeId = uploadStore.register(file.name, file.size)
  // Immediately push 0-byte loaded so the bar appears before the first XHR tick
  uploadStore.update(storeId, { loaded: 0, speed: 0, eta: null })

  const fileInfo = {
    filename:    file.name,
    contentType: file.type || 'application/octet-stream',
    category,
    clientName:  clientName  || '',
    projectName: projectName || 'untitled',
    folderType:  folderType  || 'shoots',
    shootDate:   shootDate   || null,
  }

  try {
    let result
    if (file.size >= MULTIPART_MIN) {
      const totalParts = Math.ceil(file.size / CHUNK_SIZE)
      const { uploadId, partUrls, key, publicUrl } = await callEdge({
        action: 'multipart-init',
        partCount: totalParts,
        ...fileInfo,
      })
      result = await uploadMultipart({ file, key, publicUrl, uploadId, partUrls, onProgress, onStats, signal, storeId })
    } else {
      const { uploadUrl, publicUrl, key } = await callEdge({ action: 'presign', ...fileInfo })
      await uploadSingle(uploadUrl, file, onProgress, onStats, signal, storeId)
      result = { publicUrl, key }
    }
    uploadStore.complete(storeId)
    return result
  } catch (err) {
    uploadStore.complete(storeId)   // remove from bar even on failure
    throw err
  }
}

// ── Format helpers ────────────────────────────────────────────────────────────
export function fmtBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1_024)         return `${Math.round(bytes / 1_024)} KB`
  return `${bytes} B`
}

export function fmtSpeed(bytesPerSec) {
  if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`
  if (bytesPerSec >= 1_024)     return `${Math.round(bytesPerSec / 1_024)} KB/s`
  return `${Math.round(bytesPerSec)} B/s`
}

export function fmtEta(seconds) {
  if (seconds == null || seconds < 0) return ''
  const s = Math.round(seconds)
  if (s < 60) return `~${s}s left`
  return `~${Math.floor(s / 60)}m ${s % 60}s left`
}

// Small media downloads via a CDN blob fetch (usually cache-HIT = fast).
// Videos and anything unknown go straight to a presigned URL that streams to
// disk immediately — no probing: a HEAD on an uncached large file makes the
// CDN pull the whole object from storage first (measured 17s on a 131MB
// video), which made the Download button look dead.
const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|heic)$/i

export async function forceDownload(url, filename) {
  const name = filename || decodeURIComponent(url.split('/').pop() || 'download')

  if (IMAGE_RE.test(name) || IMAGE_RE.test(url.split('?')[0])) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(a.href), 30000)
        return
      }
    } catch { /* fall through to the presigned path */ }
  }

  // Big files (or CDN hiccup): presigned URL with Content-Disposition:
  // attachment — the browser streams straight to disk, any size.
  try {
    const { url: dl } = await callEdge({ action: 'presign-download', url, filename })
    const a = document.createElement('a')
    a.href = dl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return
  } catch {
    // Fall back to the blob method (works if GET CORS is set), then a new tab.
    try {
      const res  = await fetch(url)
      const blob = await res.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = filename || url.split('/').pop() || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(a.href), 0)
    } catch {
      window.open(url, '_blank')
    }
  }
}

/**
 * downloadAll — bundle many files into zip(s) and download.
 *
 * The old approach fired one browser download per file; browsers block
 * every programmatic download after the first (until the user grants
 * "multiple downloads"), so Download All silently downloaded one file.
 * Instead: fetch each file through the CDN (cached = fast) with a 4-lane
 * pool, zip client-side (store mode — media is already compressed), and
 * trigger ONE download. Sets over ~600MB are split into numbered .zip
 * parts to keep memory sane, spaced out so the browser accepts them.
 * onProgress(done, total) fires per file fetched.
 */
export async function downloadAll(files, { concurrency = 4, onProgress, zipName = 'files' } = {}) {
  const list = (files || []).filter((f) => f.file_url)
  if (!list.length) return
  const { zip } = await import('fflate')

  const PART_LIMIT = 600 * 1024 * 1024 // per-zip memory cap
  let done = 0
  const total = list.length

  // 1. Group into parts under the memory cap using known sizes (file_size),
  //    falling back to a HEAD request. Grouping first means we only ever hold
  //    one part's bytes in memory at a time — a 10GB shoot can't blow up the tab.
  const sized = await Promise.all(list.map(async (f) => {
    let size = Number(f.file_size) || 0
    if (!size) {
      try {
        const head = await fetch(f.file_url, { method: 'HEAD' })
        size = Number(head.headers.get('content-length') || 0)
      } catch { size = 0 }
    }
    return { ...f, _size: size }
  }))
  const parts = [[]]
  let partBytes = 0
  for (const f of sized) {
    if (partBytes + f._size > PART_LIMIT && parts[parts.length - 1].length > 0) {
      parts.push([]); partBytes = 0
    }
    parts[parts.length - 1].push(f)
    partBytes += f._size
  }

  // 2. Per part: parallel CDN fetch → zip (store mode) → download → release
  let anyDownloaded = false
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p]
    const buffers = new Array(part.length).fill(null)
    let next = 0
    const lane = async () => {
      while (next < part.length) {
        const i = next++
        try {
          const res = await fetch(part[i].file_url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          buffers[i] = new Uint8Array(await res.arrayBuffer())
        } catch (err) {
          console.error('downloadAll: fetch failed for', part[i].file_name, err)
        }
        done++
        onProgress?.(done, total)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, part.length) }, lane))

    const entries = {}
    part.forEach((f, i) => {
      if (!buffers[i]) return
      let n = f.file_name || `file-${i + 1}`, k = 1
      while (entries[n]) n = (f.file_name || `file-${i + 1}`).replace(/(\.[^.]*)?$/, `-${k++}$1`)
      entries[n] = [buffers[i], { level: 0 }]
    })
    if (!Object.keys(entries).length) continue

    const zipped = await new Promise((resolve, reject) =>
      zip(entries, (err, data) => (err ? reject(err) : resolve(data)))
    )
    const suffix = parts.length > 1 ? `-part${p + 1}` : ''
    const blobUrl = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `${zipName}${suffix}.zip`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
    anyDownloaded = true
    if (p < parts.length - 1) await new Promise((r) => setTimeout(r, 1500))
  }
  if (!anyDownloaded) throw new Error('No files could be downloaded — try again.')
}
