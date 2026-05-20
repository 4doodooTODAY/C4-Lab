import { supabase } from './supabase'

export async function uploadToR2({ file, category, clientName, projectName, folderType, shootDate, onProgress, onStats }) {
  // 1. Get pre-signed URL from edge function
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        filename:    file.name,
        contentType: file.type || 'application/octet-stream',
        category,
        clientName:  clientName || '',
        projectName: projectName || 'untitled',
        folderType:  folderType || 'shoots',
        shootDate:   shootDate || null,
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to get upload URL')
  }
  const { uploadUrl, publicUrl, key } = await res.json()

  // 2. Upload directly to R2 using pre-signed URL
  const xhr = new XMLHttpRequest()
  await new Promise((resolve, reject) => {
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    if (onProgress || onStats) {
      const startTime = Date.now()
      let lastLoaded = 0
      let lastTime   = startTime

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return
        const now      = Date.now()
        const pct      = Math.round((e.loaded / e.total) * 100)

        // Rolling-window speed (last chunk) blended with overall average for stability
        const chunkSecs  = (now - lastTime) / 1000
        const totalSecs  = (now - startTime) / 1000
        const instantSpd = chunkSecs  > 0 ? (e.loaded - lastLoaded) / chunkSecs  : 0
        const avgSpd     = totalSecs  > 0 ? e.loaded / totalSecs                 : 0
        const speed      = avgSpd * 0.7 + instantSpd * 0.3  // weighted blend
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

  return { publicUrl, key }
}

// Format bytes/sec → "1.4 MB/s", "340 KB/s", etc.
export function fmtSpeed(bytesPerSec) {
  if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`
  if (bytesPerSec >= 1_024)     return `${Math.round(bytesPerSec / 1_024)} KB/s`
  return `${Math.round(bytesPerSec)} B/s`
}

// Format seconds → "~8s left", "~2m 14s left"
export function fmtEta(seconds) {
  if (seconds == null || seconds < 0) return ''
  const s = Math.round(seconds)
  if (s < 60) return `~${s}s left`
  return `~${Math.floor(s / 60)}m ${s % 60}s left`
}

// Force-download a file from any URL (works cross-origin / R2 / CDN)
// Fetches as blob so the browser always saves it rather than opening it
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
    // Fallback: open in new tab if fetch is blocked
    window.open(url, '_blank')
  }
}
