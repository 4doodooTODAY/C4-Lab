import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Image as ImageIcon, Upload, Loader2, Check, X, MapPin, RotateCcw, ThumbsUp, Trash2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { uploadToR2 } from '../../lib/r2'
import { clientProfileIds } from '../../lib/myClient'
import { notifyMany } from '../../lib/notify'

// ── Thumbnail for a video cut ─────────────────────────────────────────────────
// Each cut can carry a thumbnail. Editors upload it; anyone on the project
// drops pins on it (same idea as photo revision pins). Feedback leads to a
// new version, and older versions stay viewable with their pins.

const STATUS = {
  in_review:         { label: 'In review',         cls: 'bg-white/10 text-white/70' },
  approved:          { label: 'Approved',          cls: 'bg-green-500/20 text-green-300' },
  changes_requested: { label: 'Changes requested', cls: 'bg-amber-500/20 text-amber-300' },
}

function revisionLabel(n) {
  return n === 1 ? 'Initial Cut' : `Revision ${n - 1}`
}

export default function ThumbnailReview({
  revision, project, clientName, myId, canUpload, canReview, onUploaded,
}) {
  const [versions, setVersions]   = useState(null)   // newest first
  const [selectedId, setSelected] = useState(null)
  const [comments, setComments]   = useState([])
  const [names, setNames]         = useState({})     // profile_id -> full_name
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [pending, setPending]     = useState(null)   // { x_pct, y_pct }
  const [draft, setDraft]         = useState('')
  const [posting, setPosting]     = useState(false)
  const [activePin, setActivePin] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError]         = useState('')
  const fileRef = useRef(null)
  const imgRef  = useRef(null)

  const loadVersions = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('revision_thumbnails')
      .select('*')
      .eq('revision_id', revision.id)
      .order('version', { ascending: false })
    if (err) { setError(err.message); setVersions([]); return [] }
    setVersions(data || [])
    return data || []
  }, [revision.id])

  useEffect(() => {
    loadVersions().then((v) => setSelected(v[0]?.id || null))
  }, [loadVersions])

  const loadComments = useCallback(async (thumbId) => {
    if (!thumbId) { setComments([]); return }
    const { data } = await supabase
      .from('thumbnail_comments')
      .select('*, profiles(full_name)')
      .eq('thumbnail_id', thumbId)
      .order('created_at')
    setComments(data || [])
    setNames((prev) => {
      const next = { ...prev }
      ;(data || []).forEach((c) => { if (c.profiles?.full_name) next[c.profile_id] = c.profiles.full_name })
      return next
    })
  }, [])

  useEffect(() => { setPending(null); setActivePin(null); loadComments(selectedId) }, [selectedId, loadComments])

  if (versions === null) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-center">
        <Loader2 size={16} className="animate-spin text-white/40" />
      </div>
    )
  }

  const latest    = versions[0]
  const selected  = versions.find((v) => v.id === selectedId) || latest
  const isLatest  = selected && latest && selected.id === latest.id
  const openPins  = comments.filter((c) => c.status === 'open')

  // Clients only see this once there is something to look at
  if (!latest && !canUpload) return null

  // ── Upload a new version ──────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose an image file (JPG, PNG, or WebP).'); return }
    setUploading(true); setProgress(0); setError('')
    try {
      const nextVersion = (latest?.version || 0) + 1
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      // Unique name per cut and version so a new upload never overwrites an old one
      const named = new File([file], `cut${revision.revision_number}-thumbnail-v${nextVersion}.${ext}`, { type: file.type })
      const { publicUrl } = await uploadToR2({
        file:        named,
        category:    'Thumbnails',
        clientName:  clientName || '',
        projectName: project.name,
        folderType:  'projects',
        onProgress:  setProgress,
      })
      const { data, error: err } = await supabase
        .from('revision_thumbnails')
        .insert({ revision_id: revision.id, version: nextVersion, image_url: publicUrl, uploaded_by: myId })
        .select()
        .single()
      if (err) throw new Error(err.message)

      // Let the reviewers know. Clients only hear about it once the cut is theirs to see.
      const clientCanSee = ['pending_client_review', 'pending_editor', 'approved'].includes(revision.status)
      const clientIds = clientCanSee && project.client_id ? await clientProfileIds(project.client_id) : []
      await notifyMany({
        profileIds: [project.creative_id, ...clientIds],
        actorId: myId,
        type: 'thumbnail_uploaded',
        title: nextVersion === 1 ? 'Thumbnail ready to review' : `Thumbnail v${nextVersion} ready to review`,
        body: `${project.name}, ${revisionLabel(revision.revision_number)}`,
        link: `/projects/${project.id}/revision/${revision.id}`,
      }).catch(() => {})

      await loadVersions()
      setSelected(data.id)
      onUploaded?.(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Pins ──────────────────────────────────────────────────────────────────
  const placePin = (e) => {
    if (!isLatest || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPending({ x_pct: Math.min(100, Math.max(0, x)), y_pct: Math.min(100, Math.max(0, y)) })
    setActivePin(null)
    setDraft('')
  }

  const postPin = async () => {
    if (!draft.trim() || !pending) return
    setPosting(true); setError('')
    const { error: err } = await supabase.from('thumbnail_comments').insert({
      thumbnail_id: selected.id,
      x_pct: Number(pending.x_pct.toFixed(2)),
      y_pct: Number(pending.y_pct.toFixed(2)),
      body: draft.trim(),
      profile_id: myId,
    })
    setPosting(false)
    if (err) { setError(err.message); return }
    setPending(null); setDraft('')
    loadComments(selected.id)
  }

  const setPinStatus = async (c, status) => {
    await supabase.from('thumbnail_comments').update({ status }).eq('id', c.id)
    loadComments(selected.id)
  }

  const deletePin = async (c) => {
    if (!window.confirm('Delete this note?')) return
    await supabase.from('thumbnail_comments').delete().eq('id', c.id)
    loadComments(selected.id)
  }

  // ── Approve / request changes ─────────────────────────────────────────────
  const review = async (status) => {
    setReviewing(true); setError('')
    const { error: err } = await supabase.rpc('review_thumbnail', { p_thumbnail_id: selected.id, p_status: status })
    setReviewing(false)
    if (err) { setError(err.message); return }
    const { data: eds } = await supabase.from('project_editors').select('profile_id').eq('project_id', project.id)
    await notifyMany({
      profileIds: [selected.uploaded_by, project.editor_id, ...(eds || []).map((e) => e.profile_id)],
      actorId: myId,
      type: status === 'approved' ? 'thumbnail_approved' : 'thumbnail_changes',
      title: status === 'approved' ? 'Thumbnail approved' : 'Thumbnail changes requested',
      body: `${project.name}, ${revisionLabel(revision.revision_number)}${status === 'changes_requested' && openPins.length ? `. ${openPins.length} note${openPins.length !== 1 ? 's' : ''} on it` : ''}`,
      link: `/projects/${project.id}/revision/${revision.id}`,
    }).catch(() => {})
    loadVersions()
  }

  const st = STATUS[selected?.status] || STATUS.in_review

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon size={13} className="text-white/50" />
        <h3 className="text-sm font-semibold text-white">Thumbnail</h3>
        {selected && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>}
        {canUpload && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-accent-hover hover:bg-white/10 rounded-md px-2 py-1 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? `${progress}%` : latest ? 'New version' : 'Upload'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>

      {!latest ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-2 w-full border-2 border-dashed border-white/15 hover:border-accent/60 rounded-lg py-6 text-center text-xs text-white/50 hover:text-white/80 transition-colors disabled:opacity-50"
        >
          {uploading
            ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" /> Uploading {progress}%</span>
            : <>Upload a thumbnail for this cut<br /><span className="text-white/30">JPG, PNG, or WebP. 16:9 works best for YouTube.</span></>}
        </button>
      ) : (
        <>
          {/* Version picker */}
          {versions.length > 1 && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelected(v.id)}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                    v.id === selected.id ? 'bg-accent border-accent text-white' : 'border-white/15 text-white/60 hover:text-white'
                  }`}
                >
                  v{v.version}{v.id === latest.id ? ' (latest)' : ''}
                </button>
              ))}
            </div>
          )}

          <p className="text-[11px] text-white/40 mt-2 mb-2">
            {isLatest ? 'Click the image to drop a note on a spot.' : 'Older version. Notes are read-only here.'}
          </p>

          {/* Image with pins */}
          <div className="relative rounded-lg overflow-hidden bg-black select-none">
            <img
              ref={imgRef}
              src={selected.image_url}
              alt={`Thumbnail v${selected.version}`}
              onClick={placePin}
              className={`w-full h-auto block ${isLatest ? 'cursor-crosshair' : ''}`}
              draggable={false}
            />
            {comments.map((c, i) => (
              <button
                key={c.id}
                onClick={(e) => { e.stopPropagation(); setActivePin(activePin === c.id ? null : c.id); setPending(null) }}
                className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full text-[11px] font-bold flex items-center justify-center border-2 shadow-lg transition-transform ${
                  c.status === 'resolved' ? 'bg-white/70 text-black/60 border-white/40' : 'bg-accent text-white border-white'
                } ${activePin === c.id ? 'scale-125 z-10' : ''}`}
                style={{ left: `${c.x_pct}%`, top: `${c.y_pct}%` }}
                title={c.body}
              >
                {i + 1}
              </button>
            ))}
            {pending && (
              <span
                className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center pointer-events-none"
                style={{ left: `${pending.x_pct}%`, top: `${pending.y_pct}%` }}
              >
                <MapPin size={12} className="text-black" />
              </span>
            )}
          </div>

          {/* New pin note */}
          {pending && (
            <div className="mt-2 space-y-2">
              <textarea
                autoFocus
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postPin() }}
                placeholder="What should change here?"
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setPending(null)} className="text-xs text-white/50 hover:text-white px-2 py-1">Cancel</button>
                <button
                  onClick={postPin}
                  disabled={posting || !draft.trim()}
                  className="text-xs font-semibold bg-accent text-white rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {posting ? <Loader2 size={11} className="animate-spin" /> : <MapPin size={11} />} Add note
                </button>
              </div>
            </div>
          )}

          {/* Notes list */}
          {comments.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {comments.map((c, i) => (
                <div
                  key={c.id}
                  onClick={() => setActivePin(activePin === c.id ? null : c.id)}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                    activePin === c.id ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span className={`w-5 h-5 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    c.status === 'resolved' ? 'bg-white/20 text-white/60' : 'bg-accent text-white'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs ${c.status === 'resolved' ? 'text-white/40 line-through' : 'text-white/85'}`}>{c.body}</p>
                    <p className="text-[10px] text-white/35">{names[c.profile_id] || 'Someone'}</p>
                  </div>
                  {isLatest && (canUpload || c.profile_id === myId) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPinStatus(c, c.status === 'open' ? 'resolved' : 'open') }}
                      className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10"
                      title={c.status === 'open' ? 'Mark done' : 'Reopen'}
                    >
                      {c.status === 'open' ? <Check size={12} /> : <RotateCcw size={12} />}
                    </button>
                  )}
                  {c.profile_id === myId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePin(c) }}
                      className="p-1 rounded text-white/40 hover:text-red-300 hover:bg-white/10"
                      title="Delete note"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reviewer actions on the latest version */}
          {isLatest && canReview && selected.status !== 'approved' && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => review('changes_requested')}
                disabled={reviewing || !openPins.length}
                title={openPins.length ? '' : 'Drop at least one note first'}
                className="flex-1 text-xs font-semibold border border-white/15 text-white/80 hover:bg-white/10 rounded-lg py-2 flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <X size={12} /> Request changes
              </button>
              <button
                onClick={() => review('approved')}
                disabled={reviewing}
                className="flex-1 text-xs font-semibold bg-green-600 hover:bg-green-500 text-white rounded-lg py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {reviewing ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Approve
              </button>
            </div>
          )}
          {isLatest && canUpload && selected.status === 'changes_requested' && (
            <p className="text-[11px] text-amber-300 mt-3">Changes requested. Upload a new version once the notes are handled.</p>
          )}
        </>
      )}

      {error && <p className="text-[11px] text-red-300 mt-2">{error}</p>}
    </div>
  )
}
