import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

// ── UpdatePrompt ──────────────────────────────────────────────────────────────
// Long-lived tabs keep running old code after a deploy. Which looks like
// "the new feature doesn't work". Poll index.html's ETag every 5 minutes;
// when it changes, offer a one-click refresh.
export default function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    let initialEtag = null
    let cancelled = false

    const check = async () => {
      try {
        const res = await fetch('/', { method: 'HEAD', cache: 'no-store' })
        const etag = res.headers.get('etag')
        if (!etag || cancelled) return
        if (initialEtag === null) initialEtag = etag
        else if (etag !== initialEtag) setUpdateReady(true)
      } catch { /* offline. Try again next tick */ }
    }

    check()
    const id = setInterval(check, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!updateReady) return null

  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-2xl transition-colors"
    >
      <RefreshCw size={14} />
      Update available. Refresh
    </button>
  )
}
