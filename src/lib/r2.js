import { supabase } from './supabase'

// ── Config ────────────────────────────────────────────────────────────────────
const CHUNK_SIZE     = 12 * 1024 * 1024   // 12 MB per part — smaller parts keep the worker pool saturated
const PARALLEL_PARTS = 10                  // simultaneous part uploads (continuous worker pool)
const MULTIPART_MIN  = 8 * 1024 * 1024    // use multipart for files ≥ 8 MB

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
function uploadSingle(uploadUrl, file, onProgress, onStats, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true })

    if (onProgress || onStats) {
      const startTime = Date.now()
      let lastLoaded = 0
      let lastTime   = startTime

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return
        const now        = Date.now()
        const pct        = Math.round((e.loaded / e.total) * 100)
        const chunkSecs  = (now - lastTime) / 1000
        const totalSecs  = (now - startTime) / 1000
        const instantSpd = chunkSecs > 0 ? (e.loaded - lastLoaded) / chunkSecs : 0
        const avgSpd     = totalSecs > 0 ? e.loaded / totalSecs : 0
        const speed      = avgSpd * 0.6 + instantSpd * 0.4
        const eta        = speed > 0 ? (e.total - e.loaded) / speed : null
        if (onProgress) onProgress(pct)
        if (onStats)    onStats({ speed, eta, loaded: e.loaded, total: e.total })
        lastLoaded = e.loaded
        lastTime   = now
      }
    }

    xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Upload network error — check R2 CORS settings'))
    xhr.send(file)
  })
}

// ── Multipart parallel upload for large files ─────────────────────────────────
async function uploadMultipart({ file, key, publicUrl, uploadId, partUrls, onProgress, onStats, signal }) {
  const totalParts  = partUrls.length
  const startTime   = Date.now()
  const bytesLoaded = new Array(totalParts).fill(0)

  const reportProgress = () => {
    const loaded  = bytesLoaded.reduce((a, b) => a + b, 0)
    const pct     = Math.round((loaded / file.size) * 100)
    const elapsed = (Date.now() - startTime) / 1000
    const speed   = elapsed > 0 ? loaded / elapsed : 0
    const eta     = speed > 0 ? (file.size - loaded) / speed : null
    if (onProgress) onProgress(pct)
    if (onStats)    onStats({ speed, eta, loaded, total: file.size })
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

  const fileInfo = {
    filename:    file.name,
    contentType: file.type || 'application/octet-stream',
    category,
    clientName:  clientName  || '',
    projectName: projectName || 'untitled',
    folderType:  folderType  || 'shoots',
    shootDate:   shootDate   || null,
  }

  if (file.size >= MULTIPART_MIN) {
    // Large file: multipart-init builds the key + creates the upload in one call
    const totalParts = Math.ceil(file.size / CHUNK_SIZE)
    const { uploadId, partUrls, key, publicUrl } = await callEdge({
      action: 'multipart-init',
      partCount: totalParts,
      ...fileInfo,
    })
    return uploadMultipart({ file, key, publicUrl, uploadId, partUrls, onProgress, onStats, signal })
  }

  // Small file: single presigned PUT
  const { uploadUrl, publicUrl, key } = await callEdge({ action: 'presign', ...fileInfo })
  await uploadSingle(uploadUrl, file, onProgress, onStats, signal)
  return { publicUrl, key }
}

// ── Format helpers ────────────────────────────────────────────────────────────
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

export async function forceDownload(url, filename) {
  // Cross-origin R2 files can't be force-downloaded with a blob fetch unless the
  // bucket has GET CORS, and <a download> is ignored cross-origin. So ask the
  // edge function for a presigned URL that carries Content-Disposition:
  // attachment — clicking it downloads reliably, no bucket CORS required.
  try {
    const { url: dl } = await callEdge({ action: 'presign-download', url, filename })
    const a = document.createElement('a')
    a.href = dl
    a.download = filename || url.split('/').pop() || 'download'
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
 * downloadAll — download many files at once instead of one-at-a-time.
 *
 * Sequential downloads (with sleep gaps between them) leave the network
 * mostly idle and make "Download All" feel slow. A bounded worker pool keeps
 * several transfers in flight simultaneously, maximising aggregate MB/s while
 * staying under the browser's rapid-download throttle. onProgress(done, total)
 * fires after each file so callers can show a progress bar.
 */
export async function downloadAll(files, { concurrency = 4, onProgress } = {}) {
  const list = (files || []).filter((f) => f.file_url)
  if (!list.length) return
  let idx = 0
  let done = 0
  const worker = async () => {
    while (idx < list.length) {
      const f = list[idx++]
      await forceDownload(f.file_url, f.file_name)
      done++
      onProgress?.(done, list.length)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length) }, () => worker())
  )
}
