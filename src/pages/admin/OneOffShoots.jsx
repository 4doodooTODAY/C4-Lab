import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, X, Loader2, Check, Copy, ChevronDown, ChevronUp,
  Camera, Link as LinkIcon, Users, ToggleLeft, ToggleRight,
  Upload, Image as ImageIcon, Trash2, Heart, MessageCircle, Play, Pencil,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'
import { generateDerivatives, generatePlaceholder, extractEmbeddedJpeg, isGalleryImage, isGalleryVideo, isRawImage, sha256Hex, runPool } from '../../lib/derivatives'
import { generateThumbnail } from '../../lib/thumbnail'
import { uploadToBucketWithProgress, SpeedEstimator } from '../../lib/storageUpload'
import { fmtBytes, fmtSpeed, fmtEta } from '../../lib/r2'

function publicLink(slug) {
  return `${window.location.origin}/s/${slug}`
}

const previewUrl = (path) =>
  supabase.storage.from('shoot-previews').getPublicUrl(path).data.publicUrl

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); copy() }}
      className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-border hover:bg-surface-2 transition-colors text-text-muted shrink-0"
    >
      {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Create modal (title only. The page IS the gallery now) ────────────────────
function CreateShootModal({ onClose, onCreated, team }) {
  const [title,   setTitle]   = useState('')
  const [assignee, setAssignee] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [created, setCreated] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('Title is required.')

    setSaving(true)
    try {
      const { data, error: err } = await supabase
        .from('one_off_shoots')
        .insert({
          title: title.trim(),
          gallery_type: 'gallery',
          assigned_profile_id: assignee || null,
        })
        .select('id, slug, title, active, created_at')
        .single()
      if (err) throw new Error(err.message)
      setCreated(data)
      onCreated()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />
      <div className="relative card shadow-2xl w-full max-w-md z-10">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">New Gallery Link</h2>
          {!saving && (
            <button onClick={onClose} className="btn-ghost p-1.5 -mr-1"><X size={16} /></button>
          )}
        </div>

        {created ? (
          <div className="px-6 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-status-approved-bg flex items-center justify-center mx-auto mb-3">
              <Check size={22} className="text-status-approved-text" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">{created.title}</p>
            <p className="text-xs text-text-muted mb-4">
              Gallery created. Upload photos, then share this link
            </p>
            <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2 text-left mb-5">
              <LinkIcon size={12} className="text-text-muted shrink-0" />
              <span className="text-xs text-text-secondary font-mono truncate flex-1">{publicLink(created.slug)}</span>
              <CopyButton text={publicLink(created.slug)} />
            </div>
            <button onClick={onClose} className="btn-primary">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="label">Gallery name</label>
              <input
                className="input"
                placeholder="e.g. Smith Family Session"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            {team?.length > 0 && (
              <div>
                <label className="label">Assign to <span className="text-text-muted font-normal">(optional)</span></label>
                <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={saving}>
                  <option value="">No one yet</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-text-muted mt-1">They'll see this gallery and can upload the files.</p>
              </div>
            )}
            <p className="text-xs text-text-muted bg-surface-2 rounded-lg px-3 py-2">
              Create the gallery, upload photos, then share the link. Clients open it
              with just their name and number. No account. To view, favorite,
              comment, and download full-quality files.
            </p>
            {error && (
              <p className="text-xs text-status-overdue-text bg-status-overdue-bg border border-status-overdue/30 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Gallery manager (upload + image grid + proofing feedback) ──────────────────
function GalleryDrawer({ shoot }) {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const [images, setImages]     = useState(null)
  const [trash, setTrash]       = useState([])       // soft-deleted duplicates
  const [showTrash, setShowTrash] = useState(false)
  const [favCounts, setFavCounts] = useState({})     // image_id -> count
  const [comments, setComments] = useState([])       // pin comments across images
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(null)   // { done, total, failed }
  const [dragOver, setDragOver]   = useState(false)
  const [summary, setSummary]     = useState('')     // post-upload dedup summary
  const [selected, setSelected]   = useState(new Set()) // multi-select for delete
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const backfillRan = useRef(false)

  const load = useCallback(async () => {
    const { data: allRows } = await supabase
      .from('one_off_shoot_images')
      .select('id, file_name, file_size, thumb_path, preview_path, sort_order, created_at, deleted_at, deleted_reason, is_video, width')
      .eq('shoot_id', shoot.id)
      .order('sort_order')
      .order('created_at')
    const rows = allRows || []
    const imgs = rows.filter((r) => !r.deleted_at)
    setImages(imgs)
    setTrash(rows.filter((r) => r.deleted_at))

    const ids = (imgs || []).map((i) => i.id)
    if (!ids.length) { setFavCounts({}); setComments([]); return }

    const [{ data: favs }, { data: cmts }] = await Promise.all([
      supabase.from('one_off_shoot_favorites').select('image_id').in('image_id', ids),
      supabase.from('one_off_shoot_image_comments')
        .select('id, image_id, x_pct, y_pct, body, created_at')
        .in('image_id', ids)
        .order('created_at'),
    ])
    const counts = {}
    ;(favs || []).forEach(({ image_id }) => { counts[image_id] = (counts[image_id] || 0) + 1 })
    setFavCounts(counts)
    setComments(cmts || [])
  }, [shoot.id])

  useEffect(() => { load() }, [load])

  // Self-healing RAW thumbnails: items uploaded before embedded-JPEG
  // extraction existed show a placeholder tile (width is null). Download the
  // original, pull its embedded JPEG, write real derivatives, update the row.
  useEffect(() => {
    if (!images?.length || backfillRan.current) return
    const needs = images.filter((i) => !i.is_video && !i.width && isRawImage(i.file_name))
    if (!needs.length) return
    backfillRan.current = true
    ;(async () => {
      for (const item of needs) {
        try {
          const { data: row } = await supabase.from('one_off_shoot_images')
            .select('original_path').eq('id', item.id).single()
          if (!row?.original_path) continue
          const { data: blob, error: dlErr } = await supabase.storage
            .from('shoot-originals').download(row.original_path)
          if (dlErr || !blob) continue
          const jpeg = await extractEmbeddedJpeg(blob)
          if (!jpeg) continue
          const d = await generateDerivatives(jpeg)
          // New paths (not overwrite) so CDN/browser caches can't serve the old tile
          const base = row.original_path.replace(/\.[^.]+$/, '')
          const thumbPath = `${base}_rthumb.webp`
          const prevPath  = `${base}_rprev.webp`
          const [{ error: e1 }, { error: e2 }] = await Promise.all([
            supabase.storage.from('shoot-previews').upload(thumbPath, d.thumb, { contentType: 'image/webp', upsert: true }),
            supabase.storage.from('shoot-previews').upload(prevPath, d.preview, { contentType: 'image/webp', upsert: true }),
          ])
          if (e1 || e2) continue
          await supabase.from('one_off_shoot_images')
            .update({ thumb_path: thumbPath, preview_path: prevPath, width: d.width, height: d.height })
            .eq('id', item.id)
        } catch { /* best-effort. Next open retries */ }
      }
      load()
    })()
  }, [images, load])

  // Prevent the browser from navigating to a dropped file when the drop lands
  // outside the dropzone. The #1 cause of "drag-and-drop doesn't work".
  useEffect(() => {
    const prevent = (e) => { e.preventDefault() }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  // ── Upload: hash → dedup → parallel upload (originals untouched) ────────────
  // Duplicate = identical SHA-256 within this shoot. Exact bytes only; files
  // with ANY difference are never treated as duplicates. Duplicates become
  // soft-deleted rows (recoverable trash) sharing the canonical copy's storage.
  const uploadFiles = async (fileList) => {
    // Accept any file type. Photos, videos, RAW, ZIP, PDF, anything. Files the
    // browser can't preview get a labelled placeholder tile but upload at full
    // quality and stay downloadable.
    const files = Array.from(fileList)
    if (!files.length) return
    setUploading(true)
    setSummary('')
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    const bytesByJob = new Array(files.length).fill(0)
    const est = new SpeedEstimator()
    const reportBytes = () => {
      const loaded = bytesByJob.reduce((a, b) => a + b, 0)
      est.record(loaded)
      const speed = est.speed()
      setProgress((p) => ({
        ...p, loaded, totalBytes, speed,
        eta: speed > 0 ? (totalBytes - loaded) / speed : null,
      }))
    }
    setProgress({ done: 0, total: files.length, failed: 0, loaded: 0, totalBytes, speed: 0, eta: null })

    // 1. Hash every file (exact-byte identity) + existing hashes in this shoot
    const [hashes, { data: existingRows }] = await Promise.all([
      Promise.all(files.map((f) => sha256Hex(f))),
      supabase.from('one_off_shoot_images')
        .select('id, content_hash, original_path, preview_path, thumb_path, width, height, is_video')
        .eq('shoot_id', shoot.id)
        .is('deleted_at', null)
        .not('content_hash', 'is', null),
    ])
    const canonicalByHash = new Map()
    ;(existingRows || []).forEach((r) => canonicalByHash.set(r.content_hash, r))

    // 2. Split batch into canonical uploads vs exact duplicates
    const jobs = files.map((file, i) => ({ file, hash: hashes[i], dupOf: null }))
    for (const job of jobs) {
      const seen = canonicalByHash.get(job.hash)
      if (seen) {
        job.dupOf = seen
      } else {
        // First occurrence in this batch becomes the canonical placeholder
        canonicalByHash.set(job.hash, job)
      }
    }

    let dupCount = 0

    // 3. Canonical files: parallel upload, capped at 6 lanes
    const results = await runPool(jobs, async (job, jobIdx) => {
      if (job.dupOf) {
        // Exact duplicate → recoverable trash row pointing at canonical files.
        // Canonical may be a just-uploaded job (has .row after upload) or an
        // existing DB row.
        const canonical = job.dupOf.row || job.dupOf
        if (!canonical.original_path) throw new Error('canonical upload failed. Duplicate skipped')
        const { error } = await supabase.from('one_off_shoot_images').insert({
          shoot_id:       shoot.id,
          file_name:      job.file.name,
          file_size:      job.file.size,
          width:          canonical.width,
          height:         canonical.height,
          original_path:  canonical.original_path,
          preview_path:   canonical.preview_path,
          thumb_path:     canonical.thumb_path,
          content_hash:   job.hash,
          is_video:       canonical.is_video ?? false,
          uploaded_by:    user?.id,
          deleted_at:     new Date().toISOString(),
          deleted_reason: `exact duplicate (SHA-256 match) of ${canonical.id || 'batch upload'}`,
        })
        if (error) throw new Error(error.message)
        dupCount++
        bytesByJob[jobIdx] = job.file.size
        reportBytes()
        setProgress((p) => ({ ...p, done: p.done + 1 }))
        return
      }

      const id = crypto.randomUUID()
      const isVid = isGalleryVideo(job.file.name)
      const ext = job.file.name.split('.').pop()?.toLowerCase() || (isVid ? 'mp4' : 'jpg')
      const originalPath = `${shoot.id}/${id}.${ext}`
      // Video posters are JPEG frames; photo derivatives are WebP.
      const posterExt = isVid ? 'jpg' : 'webp'
      const posterCT  = isVid ? 'image/jpeg' : 'image/webp'
      const thumbPath = `${shoot.id}/${id}_thumb.${posterExt}`
      const prevPath  = `${shoot.id}/${id}_prev.${posterExt}`

      // Build the public thumb + preview. Video → poster frame; photo → 400px
      // thumb + 1600px preview; RAW → the JPEG preview embedded in the raw
      // file; only truly un-previewable files (ZIP/PDF) get a labelled tile.
      let thumbBlob, prevBlob, width = null, height = null
      if (isVid) {
        const poster = await generateThumbnail(job.file)
        // Video with an unreadable codec still uploads. Falls back to a tile.
        if (poster) { thumbBlob = poster; prevBlob = poster }
        else { const ph = await generatePlaceholder(job.file.name); thumbBlob = ph; prevBlob = ph }
      } else if (isGalleryImage(job.file.name) || isRawImage(job.file.name)) {
        try {
          // RAW: extract the embedded JPEG preview and derive from that.
          const source = isRawImage(job.file.name)
            ? await extractEmbeddedJpeg(job.file)
            : job.file
          if (!source) throw new Error('no embedded preview')
          const d = await generateDerivatives(source)
          thumbBlob = d.thumb; prevBlob = d.preview; width = d.width; height = d.height
        } catch {
          // odd image the browser can't decode → placeholder tile
          const ph = await generatePlaceholder(job.file.name); thumbBlob = ph; prevBlob = ph
        }
      } else {
        const ph = await generatePlaceholder(job.file.name); thumbBlob = ph; prevBlob = ph
      }

      // Original. Raw bytes, no recompression, private bucket. XHR with
      // progress so the batch speed/ETA stays live.
      await uploadToBucketWithProgress({
        bucket: 'shoot-originals',
        path: originalPath,
        blob: job.file,
        contentType: job.file.type || 'application/octet-stream',
        onLoaded: (loaded) => { bytesByJob[jobIdx] = loaded; reportBytes() },
      })
      bytesByJob[jobIdx] = job.file.size
      reportBytes()

      const [{ error: tErr }, { error: pErr }] = await Promise.all([
        supabase.storage.from('shoot-previews').upload(thumbPath, thumbBlob, { contentType: posterCT }),
        supabase.storage.from('shoot-previews').upload(prevPath, prevBlob, { contentType: posterCT }),
      ])
      if (tErr || pErr) throw new Error((tErr || pErr).message)

      const row = {
        id,
        shoot_id:      shoot.id,
        file_name:     job.file.name,
        file_size:     job.file.size,
        width, height,
        original_path: originalPath,
        preview_path:  prevPath,
        thumb_path:    thumbPath,
        content_hash:  job.hash,
        is_video:      isVid,
        uploaded_by:   user?.id,
      }
      const { error: dbErr } = await supabase.from('one_off_shoot_images').insert(row)
      if (dbErr) throw new Error(dbErr.message)
      job.row = row // duplicates later in the batch reference these paths
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }, 6)

    const failed = results.filter((r) => !r.ok).length
    results.filter((r) => !r.ok).forEach((r) => console.error('Upload failed:', r.error))
    if (failed) setProgress((p) => ({ ...p, failed }))

    const parts = []
    parts.push(`${files.length - dupCount - failed} uploaded`)
    if (dupCount) parts.push(`${dupCount} exact duplicate${dupCount !== 1 ? 's' : ''} removed (recoverable in Trash)`)
    if (failed) parts.push(`${failed} failed`)
    setSummary(parts.join(' · '))

    setUploading(false)
    load()
  }

  const restoreFromTrash = async (row) => {
    const { error } = await supabase.from('one_off_shoot_images')
      .update({ deleted_at: null, deleted_reason: null })
      .eq('id', row.id)
    if (error) window.alert(error.message)
    load()
  }

  const deleteImage = async (img) => {
    if (!window.confirm(`Remove "${img.file_name}" from the gallery?`)) return
    const { data: row } = await supabase
      .from('one_off_shoot_images')
      .select('original_path')
      .eq('id', img.id)
      .single()
    // Storage objects may be shared with duplicate rows in Trash. Only remove
    // the underlying files when no other row references them.
    if (row?.original_path) {
      const { count } = await supabase
        .from('one_off_shoot_images')
        .select('id', { count: 'exact', head: true })
        .eq('original_path', row.original_path)
        .neq('id', img.id)
      if (!count) {
        await Promise.all([
          supabase.storage.from('shoot-originals').remove([row.original_path]),
          supabase.storage.from('shoot-previews').remove([img.thumb_path, img.preview_path]),
        ])
      }
    }
    const { error } = await supabase.from('one_off_shoot_images').delete().eq('id', img.id)
    if (error) window.alert(error.message)
    load()
  }

  // ── Multi-select delete ─────────────────────────────────────────────────────
  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const deleteSelected = async () => {
    const items = (images || []).filter((i) => selected.has(i.id))
    if (!items.length) return
    if (!window.confirm(`Remove ${items.length} item${items.length !== 1 ? 's' : ''} from the gallery?`)) return
    setBulkDeleting(true)
    for (const img of items) {
      try {
        const { data: row } = await supabase.from('one_off_shoot_images')
          .select('original_path').eq('id', img.id).single()
        if (row?.original_path) {
          const { count } = await supabase.from('one_off_shoot_images')
            .select('id', { count: 'exact', head: true })
            .eq('original_path', row.original_path).neq('id', img.id)
          if (!count) {
            await Promise.all([
              supabase.storage.from('shoot-originals').remove([row.original_path]),
              supabase.storage.from('shoot-previews').remove([img.thumb_path, img.preview_path]),
            ])
          }
        }
        await supabase.from('one_off_shoot_images').delete().eq('id', img.id)
      } catch (err) { console.error('bulk delete failed for', img.file_name, err) }
    }
    setSelected(new Set())
    setBulkDeleting(false)
    load()
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!uploading) uploadFiles(e.dataTransfer.files) }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed text-center py-4 px-3 transition-all ${
          uploading ? 'opacity-60 cursor-wait' :
          dragOver ? 'border-accent bg-accent/5 cursor-copy' :
          'border-border hover:border-accent/50 hover:bg-surface-2/50 cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { uploadFiles(e.target.files); e.target.value = '' }}
        />
        {uploading && progress ? (
          <div className="space-y-1.5">
            <p className="text-xs text-accent font-medium flex items-center justify-center gap-2 flex-wrap">
              <Loader2 size={12} className="animate-spin" />
              Uploading {progress.done}/{progress.total}
              <span className="text-text-muted font-normal">
                {fmtBytes(progress.loaded || 0)} / {fmtBytes(progress.totalBytes || 0)}
              </span>
              {progress.speed > 0 && (
                <span className="text-text-secondary font-semibold">{fmtSpeed(progress.speed)}</span>
              )}
              {progress.eta != null && progress.eta > 1 && (
                <span className="text-accent font-semibold">{fmtEta(progress.eta)}</span>
              )}
              {progress.failed > 0 && <span className="text-status-overdue-text">· {progress.failed} failed</span>}
            </p>
            <div className="h-1 max-w-xs mx-auto bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${progress.totalBytes ? Math.min(100, (progress.loaded / progress.totalBytes) * 100) : 0}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted flex items-center justify-center gap-1.5">
            <Upload size={12} />
            Drop photos, videos, or any files here or <span className="text-accent font-medium">browse</span>
           . Originals stay full quality
          </p>
        )}
      </div>

      {/* Post-upload dedup summary */}
      {summary && (
        <p className="text-xs text-text-secondary bg-surface-2 border border-border rounded-lg px-3 py-2 flex items-center gap-1.5">
          <Check size={12} className="text-green-500 shrink-0" /> {summary}
        </p>
      )}

      {/* Image grid */}
      {images === null ? (
        <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-text-muted" /></div>
      ) : images.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-2">Nothing uploaded yet. Add photos, videos, or any files.</p>
      ) : (
        <>
        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between bg-surface-2 border border-border rounded-lg px-3 py-2">
            <span className="text-xs font-medium text-text-primary">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(new Set())} className="text-xs text-text-muted hover:text-text-primary">
                Clear
              </button>
              <button
                onClick={deleteSelected}
                disabled={bulkDeleting}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
              >
                {bulkDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Delete {selected.size}
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
          {images.map((img) => (
            <div key={img.id} className={`relative group aspect-square rounded-lg overflow-hidden bg-surface-2 ${selected.has(img.id) ? 'ring-2 ring-accent' : ''}`}>
              <img
                src={previewUrl(img.thumb_path)}
                alt={img.file_name}
                loading="lazy"
                className={`w-full h-full object-cover ${selected.has(img.id) ? 'opacity-75' : ''}`}
              />
              {/* Select checkbox. Visible on hover or when anything is selected */}
              <button
                onClick={() => toggleSelected(img.id)}
                className={`absolute bottom-1 left-1 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-opacity ${
                  selected.has(img.id)
                    ? 'bg-accent border-accent opacity-100'
                    : `bg-black/40 border-white/70 ${selected.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
                }`}
                title={selected.has(img.id) ? 'Deselect' : 'Select'}
              >
                {selected.has(img.id) && <Check size={12} className="text-white" strokeWidth={3} />}
              </button>
              {img.is_video && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                    <Play size={12} className="text-white ml-0.5" fill="currentColor" />
                  </div>
                </div>
              )}
              {/* Proofing badges */}
              <div className="absolute top-1 left-1 flex gap-1">
                {favCounts[img.id] > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[9px] font-bold">
                    <Heart size={8} fill="currentColor" className="text-red-400" /> {favCounts[img.id]}
                  </span>
                )}
                {comments.filter((c) => c.image_id === img.id).length > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[9px] font-bold">
                    <MessageCircle size={8} /> {comments.filter((c) => c.image_id === img.id).length}
                  </span>
                )}
              </div>
              <button
                onClick={() => deleteImage(img)}
                className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white/80 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
        </>
      )}

      {/* Trash. Recoverable duplicates / removals */}
      {trash.length > 0 && (
        <div>
          <button
            onClick={() => setShowTrash((v) => !v)}
            className="text-[10px] font-semibold text-text-muted uppercase tracking-wide flex items-center gap-1 hover:text-text-primary transition-colors"
          >
            <Trash2 size={10} /> Trash ({trash.length})
            {showTrash ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {showTrash && (
            <div className="mt-1.5 space-y-1">
              {trash.map((t) => (
                <div key={t.id} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-1.5">
                  <img src={previewUrl(t.thumb_path)} alt="" className="w-7 h-7 rounded object-cover shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-primary truncate">{t.file_name}</p>
                    <p className="text-[10px] text-text-muted truncate">{t.deleted_reason || 'removed'}</p>
                  </div>
                  <button
                    onClick={() => restoreFromTrash(t)}
                    className="text-[10px] text-accent font-medium hover:underline shrink-0"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Client pin comments */}
      {comments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide flex items-center gap-1">
            <MessageCircle size={10} /> Client notes
          </p>
          {comments.map((c) => {
            const img = (images || []).find((i) => i.id === c.image_id)
            return (
              <div key={c.id} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-1.5">
                {img && (
                  <img src={previewUrl(img.thumb_path)} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                )}
                <p className="text-xs text-text-primary flex-1 min-w-0 truncate" title={c.body}>{c.body}</p>
                <p className="text-[10px] text-text-muted shrink-0">{format(new Date(c.created_at), 'MMM d')}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Leads drawer ───────────────────────────────────────────────────────────────
function LeadsDrawer({ shoot }) {
  const [leads,   setLeads]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('shoot_leads')
      .select('id, name, email, phone, created_at')
      .eq('shoot_id', shoot.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setLeads(data || [])
        setLoading(false)
      })
  }, [shoot.id])

  if (loading) return (
    <div className="px-4 py-3 flex items-center gap-2 text-xs text-text-muted">
      <Loader2 size={12} className="animate-spin" /> Loading leads…
    </div>
  )

  if (!leads?.length) return (
    <div className="px-4 py-3 text-xs text-text-muted">No leads yet.</div>
  )

  return (
    <div className="divide-y divide-border">
      {leads.map((lead) => (
        <div key={lead.id} className="px-4 py-3 flex items-center gap-4 text-xs">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary truncate">
              {lead.phone || lead.name || lead.email || 'Not set'}
            </p>
            {(lead.name || lead.email) && (
              <p className="text-text-muted truncate">{[lead.name, lead.email].filter(Boolean).join(' · ')}</p>
            )}
          </div>
          <p className="text-text-muted shrink-0">{format(new Date(lead.created_at), 'MMM d, yyyy')}</p>
        </div>
      ))}
    </div>
  )
}

// ── Editable title ─────────────────────────────────────────────────────────────
function EditableTitle({ shoot, isAdmin, onTitleChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(shoot.title)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  const startEditing = (e) => {
    e.stopPropagation()
    setDraft(shoot.title)
    setEditing(true)
  }

  const cancel = () => { setEditing(false); setDraft(shoot.title) }

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === shoot.title) { cancel(); return }
    setSaving(true)
    const { error } = await supabase
      .from('one_off_shoots')
      .update({ title: trimmed })
      .eq('id', shoot.id)
    setSaving(false)
    if (error) { window.alert(error.message); return }
    onTitleChange(shoot.id, trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="input py-1 text-sm font-semibold h-auto min-w-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          disabled={saving}
          autoFocus
        />
        <button
          onClick={save}
          disabled={saving || !draft.trim()}
          className="p-1 text-status-approved-text hover:opacity-70 disabled:opacity-40 shrink-0"
          title="Save"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button onClick={cancel} disabled={saving} className="p-1 text-text-muted hover:text-text-primary shrink-0" title="Cancel">
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <span className="flex items-center gap-1.5 min-w-0 group/title">
      <p className="text-sm font-semibold text-text-primary truncate">{shoot.title}</p>
      {isAdmin && (
        <button
          onClick={startEditing}
          className="p-0.5 text-text-muted hover:text-text-primary opacity-70 sm:opacity-0 sm:group-hover/title:opacity-100 transition-opacity shrink-0"
          title="Rename gallery"
        >
          <Pencil size={11} />
        </button>
      )}
    </span>
  )
}

// ── Shoot row ──────────────────────────────────────────────────────────────────
function ShootRow({ shoot, onToggleActive, isAdmin, team, onAssign, onTitleChange }) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const link = publicLink(shoot.slug)
  const assignee = team.find((t) => t.id === shoot.assigned_profile_id)

  const handleToggle = async (e) => {
    e.stopPropagation()
    setToggling(true)
    await supabase
      .from('one_off_shoots')
      .update({ active: !shoot.active })
      .eq('id', shoot.id)
    onToggleActive(shoot.id, !shoot.active)
    setToggling(false)
  }

  const handleAssign = async (e) => {
    const profileId = e.target.value || null
    const { error } = await supabase
      .from('one_off_shoots')
      .update({ assigned_profile_id: profileId })
      .eq('id', shoot.id)
    if (error) { window.alert(error.message); return }
    onAssign(shoot.id, profileId)
  }

  return (
    <div className="card border border-border overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-surface-2/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
          <Camera size={16} className="text-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <EditableTitle shoot={shoot} isAdmin={isAdmin} onTitleChange={onTitleChange} />
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${shoot.active ? 'bg-status-approved-bg text-status-approved-text' : 'bg-surface-2 text-text-muted'}`}>
              {shoot.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-text-muted font-mono truncate max-w-[260px]">{link}</span>
            <CopyButton text={link} />
            {assignee && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                <Users size={9} /> {assignee.full_name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <select
              value={shoot.assigned_profile_id || ''}
              onChange={handleAssign}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] border border-border rounded-lg px-1.5 py-1 bg-surface text-text-secondary max-w-[130px] hidden sm:block"
              title="Assign to a creative or editor"
            >
              <option value="">Unassigned</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          )}
          <p className="text-[10px] text-text-muted hidden sm:block">
            {format(new Date(shoot.created_at), 'MMM d, yyyy')}
          </p>
          {isAdmin && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
              title={shoot.active ? 'Deactivate' : 'Activate'}
            >
              {toggling
                ? <Loader2 size={16} className="animate-spin" />
                : shoot.active
                  ? <ToggleRight size={20} className="text-green-500" />
                  : <ToggleLeft size={20} />
              }
            </button>
          )}
          {expanded
            ? <ChevronUp size={14} className="text-text-muted" />
            : <ChevronDown size={14} className="text-text-muted" />
          }
        </div>
      </div>

      {/* Drawers */}
      {expanded && (
        <div className="border-t border-border bg-surface-2/30">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            <ImageIcon size={11} className="text-text-muted" />
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Gallery</span>
          </div>
          <GalleryDrawer shoot={shoot} />

          <div className="flex items-center gap-2 px-4 py-2 border-y border-border">
            <Users size={11} className="text-text-muted" />
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Leads</span>
          </div>
          <LeadsDrawer shoot={shoot} />
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function OneOffShoots() {
  const { profile } = useAuth()
  // Role, not viewMode: admins keep full control even in Creative View
  const isAdmin = profile?.role === 'admin'
  const [shoots,      setShoots]      = useState([])
  const [team,        setTeam]        = useState([])   // creatives + editors for assignment
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    // RLS scopes this automatically: admins see all, team members see only
    // galleries assigned to them.
    const [{ data }, { data: people }] = await Promise.all([
      supabase
        .from('one_off_shoots')
        .select('id, slug, title, active, created_at, assigned_profile_id')
        .order('created_at', { ascending: false }),
      // Admins can be assigned too. They wear the creative hat as needed
      supabase.from('profiles').select('id, full_name, role')
        .in('role', ['creative', 'editor', 'admin']).order('full_name'),
    ])
    setShoots(data || [])
    setTeam(people || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggleActive = (id, newActive) => {
    setShoots((prev) => prev.map((s) => s.id === id ? { ...s, active: newActive } : s))
  }

  const handleAssign = (id, profileId) => {
    setShoots((prev) => prev.map((s) => s.id === id ? { ...s, assigned_profile_id: profileId } : s))
  }

  const handleTitleChange = (id, title) => {
    setShoots((prev) => prev.map((s) => s.id === id ? { ...s, title } : s))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-text-primary">Gallery Links</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {isAdmin
              ? 'Shareable delivery galleries. Upload, send the link, capture leads'
              : 'Galleries assigned to you. Upload the files, then the link goes to the client'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> New Gallery
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : shoots.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
            <Camera size={24} className="text-text-muted" />
          </div>
          <p className="text-sm font-semibold text-text-primary mb-1">
            {isAdmin ? 'No gallery links yet' : 'Nothing assigned to you yet'}
          </p>
          <p className="text-xs text-text-muted mb-4">
            {isAdmin ? 'Create a gallery, upload photos, and share the link' : 'When an admin assigns you a gallery, it shows up here.'}
          </p>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 mx-auto">
              <Plus size={14} /> New Gallery
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shoots.map((shoot) => (
            <ShootRow
              key={shoot.id}
              shoot={shoot}
              onToggleActive={handleToggleActive}
              isAdmin={isAdmin}
              team={team}
              onAssign={handleAssign}
              onTitleChange={handleTitleChange}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateShootModal
          team={team}
          onClose={() => setShowCreate(false)}
          onCreated={() => load()}
        />
      )}
    </div>
  )
}
