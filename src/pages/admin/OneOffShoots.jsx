import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, X, Loader2, Check, Copy, ChevronDown, ChevronUp,
  Camera, Link as LinkIcon, Users, ToggleLeft, ToggleRight,
  Upload, Image as ImageIcon, Trash2, Heart, MessageCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'
import { generateDerivatives, isGalleryImage, sha256Hex, runPool } from '../../lib/derivatives'

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

// ── Create modal (title only — the page IS the gallery now) ────────────────────
function CreateShootModal({ onClose, onCreated }) {
  const [title,   setTitle]   = useState('')
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
        .insert({ title: title.trim(), gallery_type: 'gallery' })
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">New One-Off Shoot</h2>
          {!saving && (
            <button onClick={onClose} className="btn-ghost p-1.5 -mr-1"><X size={16} /></button>
          )}
        </div>

        {created ? (
          <div className="px-6 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Check size={22} className="text-green-600" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">{created.title}</p>
            <p className="text-xs text-text-muted mb-4">
              Gallery created — upload photos, then share this link
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
              <label className="label">Shoot title</label>
              <input
                className="input"
                placeholder="e.g. Smith Family Session"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <p className="text-xs text-text-muted bg-surface-2 rounded-lg px-3 py-2">
              The link is the gallery — upload photos after creating and clients
              view, favorite, comment, and download right on the page.
            </p>
            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
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

  const load = useCallback(async () => {
    const { data: allRows } = await supabase
      .from('one_off_shoot_images')
      .select('id, file_name, file_size, thumb_path, preview_path, sort_order, created_at, deleted_at, deleted_reason')
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

  // Prevent the browser from navigating to a dropped file when the drop lands
  // outside the dropzone — the #1 cause of "drag-and-drop doesn't work".
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
    const files = Array.from(fileList).filter((f) => isGalleryImage(f.name))
    if (!files.length) return
    setUploading(true)
    setSummary('')
    setProgress({ done: 0, total: files.length, failed: 0 })

    // 1. Hash every file (exact-byte identity) + existing hashes in this shoot
    const [hashes, { data: existingRows }] = await Promise.all([
      Promise.all(files.map((f) => sha256Hex(f))),
      supabase.from('one_off_shoot_images')
        .select('id, content_hash, original_path, preview_path, thumb_path, width, height')
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

    // 3. Canonical files: parallel upload, capped at 3 lanes
    const results = await runPool(jobs, async (job) => {
      if (job.dupOf) {
        // Exact duplicate → recoverable trash row pointing at canonical files.
        // Canonical may be a just-uploaded job (has .row after upload) or an
        // existing DB row.
        const canonical = job.dupOf.row || job.dupOf
        if (!canonical.original_path) throw new Error('canonical upload failed — duplicate skipped')
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
          uploaded_by:    user?.id,
          deleted_at:     new Date().toISOString(),
          deleted_reason: `exact duplicate (SHA-256 match) of ${canonical.id || 'batch upload'}`,
        })
        if (error) throw new Error(error.message)
        dupCount++
        setProgress((p) => ({ ...p, done: p.done + 1 }))
        return
      }

      const id = crypto.randomUUID()
      const ext = job.file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const originalPath = `${shoot.id}/${id}.${ext}`
      const thumbPath    = `${shoot.id}/${id}_thumb.webp`
      const prevPath     = `${shoot.id}/${id}_prev.webp`

      // Derivatives first (fails fast on undecodable files, before any upload)
      const { thumb, preview, width, height } = await generateDerivatives(job.file)

      // Original — raw bytes, no recompression, private bucket
      const { error: origErr } = await supabase.storage
        .from('shoot-originals')
        .upload(originalPath, job.file, { contentType: job.file.type || 'application/octet-stream' })
      if (origErr) throw new Error(origErr.message)

      const [{ error: tErr }, { error: pErr }] = await Promise.all([
        supabase.storage.from('shoot-previews').upload(thumbPath, thumb, { contentType: 'image/webp' }),
        supabase.storage.from('shoot-previews').upload(prevPath, preview, { contentType: 'image/webp' }),
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
        uploaded_by:   user?.id,
      }
      const { error: dbErr } = await supabase.from('one_off_shoot_images').insert(row)
      if (dbErr) throw new Error(dbErr.message)
      job.row = row // duplicates later in the batch reference these paths
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }, 3)

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
    // Storage objects may be shared with duplicate rows in Trash — only remove
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
          accept="image/*"
          className="hidden"
          onChange={(e) => { uploadFiles(e.target.files); e.target.value = '' }}
        />
        {uploading && progress ? (
          <p className="text-xs text-accent font-medium flex items-center justify-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Uploading {progress.done}/{progress.total}
            {progress.failed > 0 && <span className="text-red-500">· {progress.failed} failed</span>}
          </p>
        ) : (
          <p className="text-xs text-text-muted flex items-center justify-center gap-1.5">
            <Upload size={12} />
            Drop photos here or <span className="text-accent font-medium">browse</span>
            — originals stay full quality
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
        <p className="text-xs text-text-muted text-center py-2">No photos yet — upload to fill the gallery.</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
          {images.map((img) => (
            <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden bg-surface-2">
              <img
                src={previewUrl(img.thumb_path)}
                alt={img.file_name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
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
      )}

      {/* Trash — recoverable duplicates / removals */}
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
                <div key={t.id} className="flex items-center gap-2 bg-white border border-border rounded-lg px-2.5 py-1.5">
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
              <div key={c.id} className="flex items-center gap-2 bg-white border border-border rounded-lg px-2.5 py-1.5">
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
              {lead.phone || lead.name || lead.email || '—'}
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

// ── Shoot row ──────────────────────────────────────────────────────────────────
function ShootRow({ shoot, onToggleActive }) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const link = publicLink(shoot.slug)

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

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
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
            <p className="text-sm font-semibold text-text-primary truncate">{shoot.title}</p>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${shoot.active ? 'bg-green-50 text-green-700' : 'bg-surface-2 text-text-muted'}`}>
              {shoot.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-text-muted font-mono truncate max-w-[260px]">{link}</span>
            <CopyButton text={link} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <p className="text-[10px] text-text-muted hidden sm:block">
            {format(new Date(shoot.created_at), 'MMM d, yyyy')}
          </p>
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
  const [shoots,      setShoots]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('one_off_shoots')
      .select('id, slug, title, active, created_at')
      .order('created_at', { ascending: false })
    setShoots(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggleActive = (id, newActive) => {
    setShoots((prev) => prev.map((s) => s.id === id ? { ...s, active: newActive } : s))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">One-Off Shoots</h1>
          <p className="text-sm text-text-muted mt-0.5">Client delivery galleries — upload, share the link, capture leads</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={14} /> New Shoot
        </button>
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
          <p className="text-sm font-semibold text-text-primary mb-1">No shoots yet</p>
          <p className="text-xs text-text-muted mb-4">Create a shoot, upload photos, and share the gallery link</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 mx-auto">
            <Plus size={14} /> New Shoot
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {shoots.map((shoot) => (
            <ShootRow key={shoot.id} shoot={shoot} onToggleActive={handleToggleActive} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateShootModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}
