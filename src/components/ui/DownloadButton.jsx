import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

// iOS Safari blocks cross-origin blob downloads entirely.
// Every other platform (desktop, Android) handles blob anchor-click fine.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

/**
 * DownloadButton — platform-aware:
 *
 *  iOS      → fetch blob → Web Share API → native share sheet
 *             (Save to Photos / Save to Files / AirDrop in one tap)
 *  Desktop  → fetch blob → invisible anchor click → browser Save dialog
 *  Android  → fetch blob → invisible anchor click → browser Save dialog
 *
 * Zero compression — the original R2 file is fetched and saved as-is.
 */
export default function DownloadButton({ url, filename, label = 'Download', className = '' }) {
  const [status,   setStatus]   = useState('idle')   // idle | loading
  const [progress, setProgress] = useState(0)         // 0-100 during fetch

  const handleClick = async () => {
    if (!url || status === 'loading') return
    setStatus('loading')
    setProgress(0)

    try {
      // Stream the fetch so we can show progress
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const contentLength = Number(res.headers.get('Content-Length') || 0)
      const reader  = res.body.getReader()
      const chunks  = []
      let received  = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (contentLength > 0) setProgress(Math.round((received / contentLength) * 100))
      }

      const blob  = new Blob(chunks, { type: res.headers.get('Content-Type') || 'application/octet-stream' })
      const fname = filename || decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'download')

      if (isIOS) {
        // iOS: Web Share API → native share sheet (Save to Photos / Files / AirDrop)
        const file = new File([blob], fname, { type: blob.type })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: fname })
          setStatus('idle')
          return
        }
        // iOS fallback (very old Safari): open in new tab, user can long-press to save
        window.open(URL.createObjectURL(blob), '_blank')
      } else {
        // Desktop / Android: blob → anchor click → OS save dialog
        const blobUrl = URL.createObjectURL(blob)
        const a       = document.createElement('a')
        a.href        = blobUrl
        a.download    = fname
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
      }

      setStatus('idle')
    } catch (err) {
      setStatus('idle')
      if (err?.name !== 'AbortError') window.open(url, '_blank')
    }
  }

  const base = 'flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98] disabled:opacity-60'

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className={`${base} ${className}`}
    >
      {status === 'loading'
        ? <Loader2 size={14} className="animate-spin" />
        : <Download size={14} />}
      {status === 'loading'
        ? (progress > 0 ? `${progress}%` : 'Preparing…')
        : label}
    </button>
  )
}
