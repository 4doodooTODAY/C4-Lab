import { supabase } from './supabase'

// ── Supabase Storage upload with real progress ────────────────────────────────
// supabase-js's .upload() gives no progress events, so gallery uploads looked
// frozen on big files. This helper gets a signed upload URL and PUTs via XHR,
// reporting loaded bytes as they go — enabling live speed + ETA display.

export function uploadToBucketWithProgress({ bucket, path, blob, contentType, onLoaded, signal }) {
  return new Promise((resolve, reject) => {
    supabase.storage.from(bucket).createSignedUploadUrl(path)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          reject(new Error(error?.message || 'could not sign upload'))
          return
        }
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', data.signedUrl)
        xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onLoaded) onLoaded(e.loaded)
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`upload failed: HTTP ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error('upload network error'))
        xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
        if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true })
        xhr.send(blob)
      })
      .catch(reject)
  })
}

// Sliding-window speed estimator (Δbytes / Δtime over the last 6s) — adapts to
// real conditions without instant-speed jitter.
export class SpeedEstimator {
  constructor(windowMs = 6000) { this._w = windowMs; this._samples = [] }
  record(loaded) {
    const now = Date.now()
    this._samples.push({ t: now, loaded })
    const cutoff = now - this._w
    let drop = 0
    while (drop + 1 < this._samples.length && this._samples[drop + 1].t < cutoff) drop++
    if (drop > 0) this._samples = this._samples.slice(drop)
  }
  speed() {
    if (this._samples.length < 2) return 0
    const a = this._samples[0], b = this._samples[this._samples.length - 1]
    const dt = (b.t - a.t) / 1000
    return dt > 0.1 ? (b.loaded - a.loaded) / dt : 0
  }
}
