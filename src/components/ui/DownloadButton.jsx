import { useState } from 'react'
import { Download, Loader2, Check } from 'lucide-react'

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

/**
 * DownloadButton — platform-aware with prominent progress feedback.
 *
 *  iOS      → fetch blob → Web Share API → native share sheet
 *  Desktop  → try direct anchor click first (fastest); fall back to blob
 *  Android  → blob → anchor click
 */
export default function DownloadButton({ url, filename, label = 'Download', className = '' }) {
  const [status,   setStatus]   = useState('idle')   // idle | starting | loading | done
  const [progress, setProgress] = useState(0)

  const handleClick = async () => {
    if (!url || status !== 'idle') return

    // Immediate feedback — show "Starting…" right away before any network call
    setStatus('starting')
    setProgress(0)

    const fname = filename || decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'download')

    // Desktop non-iOS: try direct anchor click first — browser handles it natively,
    // no memory buffering needed, shows browser's own download progress bar.
    if (!isIOS) {
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = fname
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        // Brief "done" flash then reset
        setStatus('done')
        setTimeout(() => setStatus('idle'), 2000)
        return
      } catch {
        // Fall through to blob approach
      }
    }

    // iOS or fallback: stream fetch → blob → share/download
    setStatus('loading')

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const contentLength = Number(res.headers.get('Content-Length') || 0)

      if (contentLength > 0 && res.body) {
        // Stream with progress
        const reader = res.body.getReader()
        const chunks = []
        let received = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          received += value.length
          setProgress(Math.round((received / contentLength) * 100))
        }

        const blob = new Blob(chunks, { type: res.headers.get('Content-Type') || 'application/octet-stream' })
        await triggerSave(blob, fname)
      } else {
        // No content-length — just blob() directly
        const blob = await res.blob()
        await triggerSave(blob, fname)
      }

      setStatus('done')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      setStatus('idle')
      if (err?.name !== 'AbortError') window.open(url, '_blank')
    }
  }

  async function triggerSave(blob, fname) {
    if (isIOS) {
      const file = new File([blob], fname, { type: blob.type })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fname })
        return
      }
      // Fallback: object URL in new tab
      window.open(URL.createObjectURL(blob), '_blank')
    } else {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fname
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
    }
  }

  const base = 'flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98]'

  // Label and icon per state
  let icon, text
  if (status === 'starting') {
    icon = <Loader2 size={14} className="animate-spin" />
    text = 'Starting…'
  } else if (status === 'loading') {
    icon = <Loader2 size={14} className="animate-spin" />
    text = progress > 0 ? `${progress}%` : 'Downloading…'
  } else if (status === 'done') {
    icon = <Check size={14} />
    text = 'Done!'
  } else {
    icon = <Download size={14} />
    text = label
  }

  return (
    <button
      onClick={handleClick}
      disabled={status !== 'idle' && status !== 'done'}
      className={`${base} ${className} ${status === 'done' ? 'opacity-80' : ''}`}
    >
      {icon}
      {text}
    </button>
  )
}
