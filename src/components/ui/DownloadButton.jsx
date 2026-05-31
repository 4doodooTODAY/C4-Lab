import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

/**
 * DownloadButton — works on every platform:
 *
 *  • iOS Safari  → fetches blob → navigator.share({ files }) → native share
 *                  sheet appears: "Save to Photos", "Save to Files", etc.
 *  • Desktop     → fetches blob → invisible anchor click → browser save dialog
 *  • Fallback    → window.open in new tab (also triggers iOS share for media)
 *
 * No compression — links go straight to the original R2 file.
 */
export default function DownloadButton({ url, filename, label = 'Download', className = '' }) {
  const [status, setStatus] = useState('idle') // idle | loading | error

  const handleClick = async () => {
    if (!url || status === 'loading') return
    setStatus('loading')

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const fname = filename || decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'download')
      const file  = new File([blob], fname, { type: blob.type })

      // ── iOS / Android: Web Share API shows native "Save to Photos / Files" sheet
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fname })
        setStatus('idle')
        return
      }

      // ── Desktop: blob URL → anchor click → browser Save dialog
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href     = blobUrl
      a.download = fname
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      setStatus('idle')
    } catch (err) {
      // AbortError = user dismissed share sheet — not an error
      if (err?.name === 'AbortError') { setStatus('idle'); return }
      // Last resort: open in new tab
      window.open(url, '_blank')
      setStatus('error')
    }
  }

  const base =
    'flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98] disabled:opacity-60'

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className={`${base} ${className}`}
    >
      {status === 'loading'
        ? <Loader2 size={14} className="animate-spin" />
        : <Download size={14} />}
      {status === 'loading' ? 'Preparing…' : label}
    </button>
  )
}
