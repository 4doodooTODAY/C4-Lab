import { useState, useEffect } from 'react'
import { uploadStore } from '../lib/uploadStore'
import { fmtSpeed, fmtEta } from '../lib/r2'

export default function UploadProgressBar() {
  const [uploads, setUploads] = useState([])

  useEffect(() => uploadStore.subscribe(setUploads), [])

  const active  = uploads.filter((u) => !u.done)
  const done    = uploads.filter((u) => u.done)
  const all     = uploads

  if (!all.length) return null

  const totalBytes  = all.reduce((s, u) => s + u.total,  0)
  const loadedBytes = all.reduce((s, u) => s + u.loaded, 0)
  const pct         = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0

  // Combined speed and ETA across all active uploads
  const combinedSpeed = active.reduce((s, u) => s + (u.speed || 0), 0)
  const remaining     = active.reduce((s, u) => s + Math.max(0, u.total - u.loaded), 0)
  const eta           = active.length && combinedSpeed > 0 ? remaining / combinedSpeed : null

  const allDone = active.length === 0 && done.length > 0

  return (
    <>
      {/* Full-width bar pinned to very top of viewport */}
      <div
        className="fixed top-0 left-0 right-0 z-[9999] h-[4px] bg-surface-3 overflow-hidden"
        style={{ pointerEvents: 'none' }}
      >
        <div
          className={`h-full transition-all duration-300 ease-out ${allDone ? 'bg-green-500' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Floating pill below the bar */}
      <div
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2.5 px-4 py-2 rounded-full shadow-lg border text-xs font-medium"
        style={{
          background: 'var(--color-surface-1, #fff)',
          borderColor: 'var(--color-border, #e5e7eb)',
          color: 'var(--color-text-primary, #111)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {allDone ? (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-green-600">
              {done.length === 1 ? done[0].name : `${done.length} files`} uploaded
            </span>
          </>
        ) : (
          <>
            {/* Animated spinner dot */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>

            <span className="text-text-primary">
              {active.length === 1
                ? active[0].name.length > 28
                  ? active[0].name.slice(0, 26) + '…'
                  : active[0].name
                : `${active.length} files`}
            </span>

            <span className="text-text-muted">{pct}%</span>

            {combinedSpeed > 0 && (
              <span className="text-text-muted">{fmtSpeed(combinedSpeed)}</span>
            )}

            {eta != null && eta > 1 && (
              <span className="text-text-secondary font-semibold">{fmtEta(eta)}</span>
            )}
          </>
        )}
      </div>
    </>
  )
}
