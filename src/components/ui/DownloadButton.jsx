import { useState } from 'react'
import { Download, Loader2, Check } from 'lucide-react'
import { forceDownload } from '../../lib/r2'

/**
 * DownloadButton — gets a presigned attachment URL from the edge function
 * and lets the browser handle the download natively. No blob, no memory
 * pressure, no CORS issue. Works for any file size.
 */
export default function DownloadButton({ url, filename, label = 'Download', className = '' }) {
  const [status, setStatus] = useState('idle') // idle | loading | done

  const handleClick = async () => {
    if (!url || status !== 'idle') return
    setStatus('loading')
    try {
      await forceDownload(url, filename)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('idle')
      window.open(url, '_blank')
    }
  }

  const base = 'flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98]'

  let icon, text
  if (status === 'loading') {
    icon = <Loader2 size={14} className="animate-spin" />
    text = 'Preparing…'
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
      disabled={status === 'loading'}
      className={`${base} ${className} ${status === 'done' ? 'opacity-80' : ''}`}
    >
      {icon}
      {text}
    </button>
  )
}
