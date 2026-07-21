import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Loader2, Download, Heart, X, ChevronLeft, ChevronRight,
  MessageCircle, Phone, Check, Camera, Play,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { zip } from 'fflate'

// ── Helpers ───────────────────────────────────────────────────────────────────
const previewUrl = (path) =>
  supabase.storage.from('shoot-previews').getPublicUrl(path).data.publicUrl

const claimKey = (slug) => `shoot-claim-${slug}`

async function callDownload(body) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shoot-download`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'download failed')
  return data
}

function triggerBrowserDownload(url) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ── Phone gate modal ──────────────────────────────────────────────────────────
function PhoneGate({ slug, onClaim, onClose }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) { setError('Enter your first and last name'); return }
    if (phone.trim().length < 7) { setError('Enter a valid phone number'); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.rpc('claim_shoot_downloads', {
      p_slug: slug,
      p_name: `${firstName.trim()} ${lastName.trim()}`,
      p_phone: phone.trim(),
    })
    setSaving(false)
    if (err || !data) { setError(err?.message || 'Something went wrong'); return }
    sessionStorage.setItem(claimKey(slug), data)
    onClaim(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center mb-4">
          <Phone size={18} className="text-accent" />
        </div>
        <h2 className="text-base font-bold text-text-primary">Unlock this gallery</h2>
        <p className="text-sm text-text-secondary mt-1 mb-4">
          Just your name and number. Then you can download full-resolution files,
          mark favorites, and leave comments. No account or email needed.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              className="input"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
            />
            <input
              type="text"
              className="input"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <input
            type="tel"
            className="input"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {error && (
            <p className="text-xs text-status-overdue-text bg-status-overdue-bg border border-status-overdue/30 rounded-lg px-3 py-2">{error}</p>
          )}
          <button type="submit" disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Continue
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({
  images, index, onClose, onPrev, onNext,
  favorites, onToggleFavorite,
  comments, onAddComment,
  onDownload, downloading, requireClaim,
  claim, fetchStreamUrl,
}) {
  const img = images[index]
  const [pendingPin, setPendingPin] = useState(null) // { x_pct, y_pct }
  const [pinBody, setPinBody] = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [streamUrl, setStreamUrl] = useState(null)
  const [streamLoading, setStreamLoading] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const imgWrapRef = useRef(null)

  useEffect(() => { setPendingPin(null); setPinBody(''); setPinMode(false); setStreamUrl(null) }, [index])

  // Video needs a signed streaming URL, which requires the name+phone claim.
  useEffect(() => {
    let cancelled = false
    if (img?.is_video && claim) {
      setStreamLoading(true)
      fetchStreamUrl(img.image_id).then((url) => {
        if (!cancelled) { setStreamUrl(url); setStreamLoading(false) }
      })
    }
    return () => { cancelled = true }
  }, [img?.image_id, img?.is_video, claim, fetchStreamUrl])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  const myComments = comments.filter((c) => c.image_id === img.image_id)
  const isFav = favorites.has(img.image_id)

  const placePin = (e) => {
    if (!requireClaim()) return
    const rect = imgWrapRef.current.getBoundingClientRect()
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100
    const y_pct = ((e.clientY - rect.top) / rect.height) * 100
    setPendingPin({ x_pct, y_pct })
    setPinMode(false)
  }
  // Photos: click anywhere to pin. Video: only in pin mode (so native controls work).
  const handleImageClick = (e) => { if (!img.is_video) placePin(e) }

  const savePin = async () => {
    if (!pinBody.trim() || !pendingPin) return
    setSavingPin(true)
    await onAddComment(img.image_id, pendingPin.x_pct, pendingPin.y_pct, pinBody.trim())
    setSavingPin(false)
    setPendingPin(null)
    setPinBody('')
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <p className="text-white/60 text-xs">{index + 1} / {images.length}</p>
        <div className="flex items-center gap-2">
          {img.is_video && (
            <button
              onClick={() => { if (requireClaim()) setPinMode((v) => !v) }}
              className={`p-2 rounded-lg transition-colors ${pinMode ? 'text-accent bg-white/10' : 'text-white/60 hover:text-white'}`}
              title="Leave a note on this frame"
            >
              <MessageCircle size={18} />
            </button>
          )}
          <button
            onClick={() => { if (requireClaim()) onToggleFavorite(img.image_id) }}
            className={`p-2 rounded-lg transition-colors ${isFav ? 'text-red-400' : 'text-white/60 hover:text-white'}`}
            title={isFav ? 'Remove favorite' : 'Favorite'}
          >
            <Heart size={18} fill={isFav ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => onDownload(img.image_id)}
            disabled={downloading}
            className="p-2 rounded-lg text-white/60 hover:text-white transition-colors disabled:opacity-40"
            title="Download original"
          >
            {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          </button>
          <button onClick={onClose} className="p-2 rounded-lg text-white/60 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Image + pins */}
      <div className="flex-1 flex items-center justify-center min-h-0 px-2 sm:px-14 relative">
        <button onClick={onPrev} className="absolute left-2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ChevronLeft size={20} />
        </button>

        <div ref={imgWrapRef} className="relative inline-block max-h-full" onClick={handleImageClick}>
          {img.is_video ? (
            claim && streamUrl ? (
              <video
                src={streamUrl}
                controls
                playsInline
                className="max-h-[78vh] max-w-full object-contain bg-black"
              />
            ) : (
              <div className="relative">
                <img
                  src={previewUrl(img.preview_path)}
                  alt={img.file_name}
                  className="max-h-[78vh] max-w-full object-contain select-none opacity-80"
                  draggable={false}
                />
                <button
                  onClick={() => { if (requireClaim()) { /* claim triggers stream fetch */ } }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="flex flex-col items-center gap-2">
                    <span className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center">
                      {streamLoading ? <Loader2 size={22} className="animate-spin text-white" /> : <Play size={26} className="text-white ml-1" fill="currentColor" />}
                    </span>
                    {!claim && <span className="text-white text-xs font-medium">Enter name & number to watch</span>}
                  </span>
                </button>
              </div>
            )
          ) : (
            <img
              src={previewUrl(img.preview_path)}
              alt={img.file_name}
              className="max-h-[78vh] max-w-full object-contain select-none"
              draggable={false}
            />
          )}
          {/* Pin-placement overlay for video (captures the click without hitting controls) */}
          {img.is_video && pinMode && (
            <div className="absolute inset-x-0 top-0 bottom-12 cursor-crosshair z-10" onClick={placePin} />
          )}
          {/* Saved pins */}
          {myComments.map((c, i) => (
            <div
              key={i}
              className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-lg cursor-default"
              style={{ left: `${c.x_pct}%`, top: `${c.y_pct}%` }}
              title={c.body}
              onClick={(e) => e.stopPropagation()}
            >
              {i + 1}
            </div>
          ))}
          {/* Pending pin */}
          {pendingPin && (
            <div
              className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-amber-400 border-2 border-white shadow-lg animate-pulse"
              style={{ left: `${pendingPin.x_pct}%`, top: `${pendingPin.y_pct}%` }}
            />
          )}
        </div>

        <button onClick={onNext} className="absolute right-2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Bottom: pin composer or hint */}
      <div className="shrink-0 px-4 py-3">
        {pendingPin ? (
          <div className="max-w-lg mx-auto flex gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-accent"
              placeholder="What should we know about this spot?"
              value={pinBody}
              onChange={(e) => setPinBody(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePin()}
              autoFocus
            />
            <button onClick={savePin} disabled={savingPin || !pinBody.trim()} className="btn-primary disabled:opacity-50">
              {savingPin ? <Loader2 size={14} className="animate-spin" /> : 'Pin it'}
            </button>
            <button onClick={() => { setPendingPin(null); setPinBody('') }} className="p-2 text-white/50 hover:text-white">
              <X size={16} />
            </button>
          </div>
        ) : (
          <p className="text-center text-white/40 text-xs flex items-center justify-center gap-1.5">
            <MessageCircle size={12} />
            {img.is_video
              ? (pinMode ? 'Click the video to place your note' : 'Tap the comment icon, then click the frame to leave a note')
              : 'Click anywhere on the photo to leave a note'}
            {myComments.length > 0 && ` · ${myComments.length} note${myComments.length !== 1 ? 's' : ''} here`}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main gallery page ─────────────────────────────────────────────────────────
export default function ShootGallery() {
  const { slug } = useParams()
  const [title, setTitle] = useState('')
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [claim, setClaim] = useState(() => sessionStorage.getItem(claimKey(slug)))
  const [showGate, setShowGate] = useState(false)
  const pendingAction = useRef(null) // resume after gate unlocks

  const [lightbox, setLightbox] = useState(null) // index | null
  const [favorites, setFavorites] = useState(new Set())
  const [comments, setComments] = useState([])
  const [downloading, setDownloading] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [toast, setToast] = useState('')

  // Load gallery
  useEffect(() => {
    async function load() {
      const [{ data: meta }, { data: imgs, error }] = await Promise.all([
        supabase.rpc('get_shoot_gallery_meta', { p_slug: slug }),
        supabase.rpc('get_shoot_gallery', { p_slug: slug }),
      ])
      if (error || !meta?.length) { setNotFound(true); setLoading(false); return }
      setTitle(meta[0].shoot_title)
      setImages(imgs || [])
      setLoading(false)
    }
    load()
  }, [slug])

  // Restore proofing state for an existing claim
  useEffect(() => {
    if (!claim) return
    supabase.rpc('get_shoot_proofing', { p_claim: claim }).then(({ data, error }) => {
      if (error) {
        // Claim expired or invalid. Clear it
        sessionStorage.removeItem(claimKey(slug))
        setClaim(null)
        return
      }
      const favs = new Set()
      const cmts = []
      ;(data || []).forEach((row) => {
        if (row.kind === 'favorite') favs.add(row.image_id)
        else cmts.push(row)
      })
      setFavorites(favs)
      setComments(cmts)
    })
  }, [claim, slug])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Gate helper: returns true if claimed; otherwise opens gate and remembers intent
  const requireClaim = useCallback((action) => {
    if (claim) return true
    pendingAction.current = action || null
    setShowGate(true)
    return false
  }, [claim])

  const handleClaimed = (newClaim) => {
    setClaim(newClaim)
    setShowGate(false)
    const act = pendingAction.current
    pendingAction.current = null
    if (act) act(newClaim)
  }

  // Signed streaming URL for a gallery video (requires a live claim).
  const fetchStreamUrl = useCallback(async (imageId) => {
    if (!claim) return null
    try {
      const { url } = await callDownload({ claim, imageId, mode: 'stream' })
      return url
    } catch {
      return null
    }
  }, [claim])

  // ── Actions ────────────────────────────────────────────────────────────────
  const toggleFavorite = async (imageId, claimOverride) => {
    const c = claimOverride || claim
    if (!c) return
    // Optimistic
    setFavorites((prev) => {
      const next = new Set(prev)
      next.has(imageId) ? next.delete(imageId) : next.add(imageId)
      return next
    })
    const { error } = await supabase.rpc('toggle_shoot_favorite', { p_claim: c, p_image: imageId })
    if (error) {
      // Roll back
      setFavorites((prev) => {
        const next = new Set(prev)
        next.has(imageId) ? next.delete(imageId) : next.add(imageId)
        return next
      })
      showToast('Could not save favorite')
    }
  }

  const addComment = async (imageId, x, y, body, claimOverride) => {
    const c = claimOverride || claim
    if (!c) return
    const { error } = await supabase.rpc('add_shoot_image_comment', {
      p_claim: c, p_image: imageId, p_x: x, p_y: y, p_body: body,
    })
    if (error) { showToast('Could not save note'); return }
    setComments((prev) => [...prev, { image_id: imageId, kind: 'comment', x_pct: x, y_pct: y, body }])
  }

  const downloadOne = async (imageId, claimOverride) => {
    const c = claimOverride || claim
    if (!c) {
      requireClaim((newClaim) => downloadOne(imageId, newClaim))
      return
    }
    setDownloading(true)
    try {
      const { url } = await callDownload({ claim: c, imageId })
      triggerBrowserDownload(url)
    } catch (err) {
      if (/claim/i.test(err.message)) {
        sessionStorage.removeItem(claimKey(slug))
        setClaim(null)
        requireClaim((newClaim) => downloadOne(imageId, newClaim))
      } else {
        showToast('Download failed. Try again')
      }
    }
    setDownloading(false)
  }

  const downloadAll = async (claimOverride) => {
    const c = claimOverride || claim
    if (!c) {
      requireClaim((newClaim) => downloadAll(newClaim))
      return
    }
    setDownloadingAll(true)
    try {
      const { files } = await callDownload({ claim: c, all: true })

      // Zip the originals client-side (store mode. Images are already
      // compressed; zipping is for the single-file UX, not size).
      // Fetch with capped concurrency so big galleries don't stampede.
      const entries = {}
      let fetched = 0
      const queue = [...files]
      const lanes = Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const f = queue.shift()
          try {
            const res = await fetch(f.url)
            if (!res.ok) throw new Error(`fetch ${res.status}`)
            const buf = new Uint8Array(await res.arrayBuffer())
            // Avoid name collisions inside the zip
            let name = f.fileName
            let n = 1
            while (entries[name]) name = f.fileName.replace(/(\.[^.]*)?$/, `-${n++}$1`)
            entries[name] = [buf, { level: 0 }]
          } catch (e) {
            console.error('zip fetch failed:', f.fileName, e)
          }
          fetched++
          setToast(`Preparing ${fetched}/${files.length} originals…`)
        }
      })
      await Promise.all(lanes)
      setToast('')

      const names = Object.keys(entries)
      if (!names.length) throw new Error('Download failed. Try again')

      const zipped = await new Promise((resolve, reject) =>
        zip(entries, (err, data) => (err ? reject(err) : resolve(data)))
      )
      const blobUrl = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'gallery'}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
      showToast(`${names.length} full-quality original${names.length !== 1 ? 's' : ''} zipped`)
    } catch (err) {
      if (/claim/i.test(err.message)) {
        sessionStorage.removeItem(claimKey(slug))
        setClaim(null)
        requireClaim((newClaim) => downloadAll(newClaim))
      } else {
        showToast('Download failed. Try again')
      }
    }
    setDownloadingAll(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-white/40" />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
        <Camera size={20} className="text-white/40" />
      </div>
      <p className="text-white font-semibold">Gallery not found</p>
      <p className="text-white/40 text-sm">This link may have expired or been deactivated.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-sidebar">
      {/* Header */}
      <header className="px-5 sm:px-8 pt-8 pb-6 flex flex-wrap items-end justify-between gap-4 max-w-6xl mx-auto">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-white font-bold text-xs leading-none">C4</span>
            </div>
            <span className="text-white/40 text-xs">Connect Four Creative</span>
          </div>
          <h1 className="font-display text-white text-2xl sm:text-3xl font-bold">{title}</h1>
          <p className="text-white/40 text-sm mt-1">{images.length} item{images.length !== 1 ? 's' : ''}</p>
        </div>
        {images.length > 0 && (
          <button
            onClick={() => downloadAll()}
            disabled={downloadingAll}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {downloadingAll ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download All
          </button>
        )}
      </header>

      {/* Grid */}
      <main className="px-5 sm:px-8 pb-16 max-w-6xl mx-auto">
        {images.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/40 text-sm">Your gallery is on the way. Check back soon.</p>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
            style={{ contentVisibility: 'auto' }}
          >
            {images.map((img, i) => {
              const isFav = favorites.has(img.image_id)
              const noteCount = comments.filter((c) => c.image_id === img.image_id).length
              return (
                <button
                  key={img.image_id}
                  onClick={() => setLightbox(i)}
                  className="relative group aspect-square overflow-hidden rounded-lg bg-white/5"
                >
                  <img
                    src={previewUrl(img.thumb_path)}
                    alt={img.file_name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                  />
                  {img.is_video && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                        <Play size={18} className="text-white ml-0.5" fill="currentColor" />
                      </span>
                    </div>
                  )}
                  {(isFav || noteCount > 0) && (
                    <div className="absolute top-2 right-2 flex gap-1">
                      {isFav && (
                        <span className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                          <Heart size={12} className="text-red-400" fill="currentColor" />
                        </span>
                      )}
                      {noteCount > 0 && (
                        <span className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white text-[10px] font-bold">
                          {noteCount}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightbox !== null && images[lightbox] && (
        <Lightbox
          images={images}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox((i) => (i - 1 + images.length) % images.length)}
          onNext={() => setLightbox((i) => (i + 1) % images.length)}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          comments={comments}
          onAddComment={addComment}
          onDownload={downloadOne}
          downloading={downloading}
          requireClaim={() => requireClaim()}
          claim={claim}
          fetchStreamUrl={fetchStreamUrl}
        />
      )}

      {/* Phone gate */}
      {showGate && (
        <PhoneGate slug={slug} onClaim={handleClaimed} onClose={() => setShowGate(false)} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-surface text-text-primary text-sm font-medium px-4 py-2 rounded-xl shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
