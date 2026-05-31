import { supabase } from './supabase'

// ── Config ────────────────────────────────────────────────────────────────────
const CHUNK_SIZE     = 25 * 1024 * 1024   // 25 MB per part (R2 min is 5 MB)
const PARALLEL_PARTS = 4                   // simultaneous part uploads
const MULTIPART_MIN  = 10 * 1024 * 1024   // use multipart for files ≥ 10 MB

// ── Auth header helper ────────────────────────────────────────────────────────
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${session?.access_token}`,
    'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
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

// ── Upload a single part via XHR ─────────────────────────────────────────────
// We don't capture ETags here — CORS blocks that header on presigned URLs.
// The edge function calls ListParts server-side to get real ETags at complete time.
function uploadPart(url, chunk, onLoaded) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onLoaded(e.loaded) }
    xhr.onload  = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Part upload failed: HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Part upload network error'))
    xhr.send(chunk)
  })
}

// ── Single PUT for small files ────────────────────────────────────────────────
function uploadSingle(uploadUrl, file, onProgress, onStats) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

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
async function uploadMultipart({ file, key, contentType, publicUrl, onProgress, onStats }) {
  const totalParts  = Math.ceil(file.size / CHUNK_SIZE)
  const startTime   = Date.now()
  const bytesLoaded = new Array(totalParts).fill(0)

  const reportProgress = () => {
    const loaded    = bytesLoaded.reduce((a, b) => a + b, 0)
    const pct       = Math.round((loaded / file.size) * 100)
    const elapsed   = (Date.now() - startTime) / 1000
    const speed     = elapsed > 0 ? loaded / elapsed : 0
    const eta       = speed > 0 ? (file.size - loaded) / speed : null
    if (onProgress) onProgress(pct)
    if (onStats)    onStats({ speed, eta, loaded, total: file.size })
  }

  // 1. Init: create multipart upload + get presigned URLs for all parts
  const { uploadId, partUrls } = await callEdge({
    action:      'multipart-init',
    key,
    contentType: contentType || 'application/octet-stream',
    partCount:   totalParts,
  })

  try {
    // 2. Upload parts in batches of PARALLEL_PARTS
    for (let batchStart = 0; batchStart < totalParts; batchStart += PARALLEL_PARTS) {
      const batchEnd     = Math.min(batchStart + PARALLEL_PARTS, totalParts)
      const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i)

      await Promise.all(batchIndices.map(async (partIdx) => {
        const start  = partIdx * CHUNK_SIZE
        const end    = Math.min(start + CHUNK_SIZE, file.size)
        const chunk  = file.slice(start, end)
        await uploadPart(partUrls[partIdx], chunk, (loaded) => {
          bytesLoaded[partIdx] = loaded
          reportProgress()
        })
      }))
    }

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
export async function uploadToR2({ file, category, clientName, projectName, folderType, shootDate, onProgress, onStats }) {
  // Build the file key and public URL up front (edge function needs it for multipart)
  const initRes = await callEdge({
    action:      'presign',
    filename:    file.name,
    contentType: file.type || 'application/octet-stream',
    category,
    clientName:  clientName || '',
    projectName: projectName || 'untitled',
    folderType:  folderType || 'shoots',
    shootDate:   shootDate  || null,
  })
  const { uploadUrl, publicUrl, key } = initRes

  if (file.size >= MULTIPART_MIN) {
    // Large file: parallel multipart upload
    return uploadMultipart({
      file,
      key,
      contentType: file.type || 'application/octet-stream',
      publicUrl,
      onProgress,
      onStats,
    })
  }

  // Small file: simple single PUT
  await uploadSingle(uploadUrl, file, onProgress, onStats)
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
  try {
    const res  = await fetch(url)
    const blob = await res.blob()
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = filename || url.split('/').pop() || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank')
  }
}
