import { useState, useRef, useCallback } from 'react'
import {
  X, Upload, FileVideo, Image, File as FileIcon,
  Check, Loader2, AlertCircle, Plus, Trash2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { uploadToR2, fmtBytes, fmtSpeed, fmtEta } from '../../lib/r2'
import { useAuth } from '../../contexts/AuthContext'
import { generateThumbnail } from '../../lib/thumbnail'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileIcon(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return FileVideo
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'raw', 'cr2', 'arw'].includes(ext)) return Image
  return FileIcon
}

function iconColor(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return 'text-blue-500'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'raw', 'cr2', 'arw'].includes(ext)) return 'text-purple-500'
  return 'text-text-muted'
}

// ── Per-file status ───────────────────────────────────────────────────────────
// status: 'pending' | 'uploading' | 'done' | 'error'
function FileRow({ item, onRemove }) {
  const Icon = fileIcon(item.file.name)
  const color = iconColor(item.file.name)

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
      item.status === 'done'     ? 'border-green-200 bg-green-50/40' :
      item.status === 'error'    ? 'border-red-200 bg-red-50/40' :
      item.status === 'uploading'? 'border-accent/30 bg-accent/5' :
      'border-border bg-surface-2/40'
    }`}>
      <div className={`w-8 h-8 rounded-lg bg-white border border-border flex items-center justify-center shrink-0`}>
        <Icon size={14} className={color} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">{item.file.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-text-muted">{fmtBytes(item.file.size)}</span>
          {item.status === 'uploading' && (
            <>
              <span className="text-[10px] text-accent font-medium">{item.progress}%</span>
              {item.stats && (
                <span className="text-[10px] text-text-muted">
                  {fmtSpeed(item.stats.speed)}{item.stats.eta != null ? ` · ${fmtEta(item.stats.eta)}` : ''}
                </span>
              )}
            </>
          )}
          {item.status === 'done' && (
            <span className="text-[10px] text-green-600 font-medium">Uploaded</span>
          )}
          {item.status === 'error' && (
            <span className="text-[10px] text-red-500 font-medium truncate">{item.error}</span>
          )}
        </div>

        {/* Progress bar */}
        {item.status === 'uploading' && (
          <div className="mt-1.5 h-1 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-150"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Status icon / remove button */}
      <div className="shrink-0">
        {item.status === 'pending' && (
          <button onClick={() => onRemove(item.id)} className="p-1 text-text-muted hover:text-red-500 transition-colors">
            <Trash2 size={13} />
          </button>
        )}
        {item.status === 'uploading' && <Loader2 size={14} className="animate-spin text-accent" />}
        {item.status === 'done'      && <Check size={14} className="text-green-500" />}
        {item.status === 'error'     && <AlertCircle size={14} className="text-red-500" />}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function ShootUploadModal({ shoot, clientId, clientName, onClose, onUploaded }) {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [items, setItems] = useState([])   // { id, file, status, progress, stats, error }
  const [notes, setNotes]  = useState('')
  const [running, setRunning] = useState(false)
  const [allDone, setAllDone] = useState(false)

  const addFiles = useCallback((fileList) => {
    const newItems = Array.from(fileList).map((file) => ({
      id:       Math.random().toString(36).slice(2),
      file,
      status:   'pending',
      progress: 0,
      stats:    null,
      error:    null,
    }))
    setItems((prev) => [...prev, ...newItems])
  }, [])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id))

  const updateItem = (id, patch) =>
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i))

  const handleUploadAll = async () => {
    const pending = items.filter((i) => i.status === 'pending')
    if (!pending.length) return
    setRunning(true)

    let errorCount = 0
    for (const item of pending) {
      updateItem(item.id, { status: 'uploading', progress: 0 })
      try {
        // Generate thumbnail silently before the main upload
        const thumbBlob = await generateThumbnail(item.file)
        let thumbnailUrl = null
        if (thumbBlob) {
          const thumbFile = new File([thumbBlob], `thumb_${item.file.name}.jpg`, { type: 'image/jpeg' })
          const { publicUrl: tUrl } = await uploadToR2({
            file:        thumbFile,
            category:    'thumbnails',
            clientName:  clientName || clientId || 'client',
            projectName: shoot.title || 'shoot',
            folderType:  'shoots',
            shootDate:   shoot.shoot_date || null,
          }).catch(() => ({ publicUrl: null }))
          thumbnailUrl = tUrl
        }

        const { publicUrl } = await uploadToR2({
          file:        item.file,
          category:    'footage',
          clientName:  clientName || clientId || 'client',
          projectName: shoot.title || 'shoot',
          folderType:  'shoots',
          shootDate:   shoot.shoot_date || null,
          onProgress:  (p) => updateItem(item.id, { progress: p }),
          onStats:     (s) => updateItem(item.id, { stats: s }),
        })

        // Save record to shoot_uploads
        const { error: dbErr } = await supabase.from('shoot_uploads').insert({
          shoot_id:      shoot.id,
          client_id:     clientId || null,
          file_name:     item.file.name,
          file_url:      publicUrl,
          file_size:     item.file.size,
          notes:         notes || null,
          uploaded_by:   user?.id,
          thumbnail_url: thumbnailUrl,
        })
        if (dbErr) throw new Error(dbErr.message)

        updateItem(item.id, { status: 'done', progress: 100 })
      } catch (err) {
        errorCount++
        updateItem(item.id, { status: 'error', error: err.message })
      }
    }

    setRunning(false)
    // Refresh the parent list as soon as at least one file landed, so uploaded
    // clips show up immediately without a page refresh.
    if (errorCount < pending.length) onUploaded?.()
    if (errorCount === 0) setAllDone(true)
  }

  const pendingCount   = items.filter((i) => i.status === 'pending').length
  const uploadingCount = items.filter((i) => i.status === 'uploading').length
  const doneCount      = items.filter((i) => i.status === 'done').length

  // Aggregate stats shown next to the button while uploading
  const activeItem  = items.find((i) => i.status === 'uploading')
  const totalBytes  = items.reduce((s, i) => s + i.file.size, 0)
  const doneBytes   = items.filter((i) => i.status === 'done').reduce((s, i) => s + i.file.size, 0)
  const loadedBytes = doneBytes + (activeItem?.stats?.loaded || 0)
  const aggSpeed    = activeItem?.stats?.speed || 0
  const aggEta      = aggSpeed > 0 ? (totalBytes - loadedBytes) / aggSpeed : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!running ? onClose : undefined} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-text-primary">Upload Clips</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {shoot.title}
              {shoot.shoot_date ? ` · ${shoot.shoot_date}` : ''}
            </p>
          </div>
          {!running && (
            <button onClick={onClose} className="btn-ghost p-1.5 -mt-1 -mr-1">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Success state */}
          {allDone && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Check size={24} className="text-green-600" />
              </div>
              <p className="text-sm font-semibold text-text-primary">{doneCount} file{doneCount !== 1 ? 's' : ''} uploaded</p>
              <p className="text-xs text-text-muted mt-1">Files are now in the client filesystem.</p>
              <button onClick={onClose} className="btn-primary mt-4">Done</button>
            </div>
          )}

          {!allDone && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !running && fileInputRef.current?.click()}
                className={`rounded-xl border-2 border-dashed transition-all text-center py-6 px-4 ${
                  running ? 'opacity-50 cursor-not-allowed' :
                  dragOver ? 'border-accent bg-accent/5 cursor-copy' :
                  'border-border hover:border-accent/50 hover:bg-surface-2/50 cursor-pointer'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-2">
                  <Upload size={18} className="text-text-muted" />
                </div>
                <p className="text-sm font-semibold text-text-primary mb-0.5">Drop clips here</p>
                <p className="text-xs text-text-muted">
                  or <span className="text-accent">click to browse</span> · MP4, MOV, JPG, RAW, ZIP and more
                </p>
                {items.length > 0 && (
                  <p className="text-xs text-accent font-medium mt-2 flex items-center justify-center gap-1">
                    <Plus size={10} /> Add more files
                  </p>
                )}
              </div>

              {/* File list */}
              {items.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-text-primary">
                      {items.length} file{items.length !== 1 ? 's' : ''}
                      {doneCount > 0 && <span className="text-green-600 ml-1">· {doneCount} done</span>}
                    </p>
                    {!running && pendingCount > 0 && (
                      <button
                        onClick={() => setItems((prev) => prev.filter((i) => i.status !== 'pending'))}
                        className="text-[10px] text-text-muted hover:text-red-500 transition-colors"
                      >
                        Clear pending
                      </button>
                    )}
                  </div>
                  {items.map((item) => (
                    <FileRow key={item.id} item={item} onRemove={removeItem} />
                  ))}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="label">Notes for editor <span className="text-text-muted font-normal">(optional)</span></label>
                <textarea
                  className="input resize-none text-xs"
                  rows={2}
                  placeholder="Best takes, timestamps, style direction..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={running}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!allDone && (
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleUploadAll}
              disabled={running || pendingCount === 0}
              className="btn-primary flex items-center gap-2 shrink-0 disabled:opacity-50"
            >
              {running
                ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                : <><Upload size={14} /> Upload {pendingCount > 0 ? pendingCount : ''} File{pendingCount !== 1 ? 's' : ''}</>
              }
            </button>
            {running && items.length > 0 && (
              <div className="text-xs text-text-muted flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-text-primary">{doneCount}/{items.length} files</span>
                <span className="text-text-muted/40">·</span>
                <span>{fmtBytes(loadedBytes)} / {fmtBytes(totalBytes)}</span>
                {aggSpeed > 0 && <>
                  <span className="text-text-muted/40">·</span>
                  <span className="font-medium text-text-secondary">{fmtSpeed(aggSpeed)}</span>
                </>}
                {aggEta != null && aggEta > 1 && <>
                  <span className="text-text-muted/40">·</span>
                  <span className="font-semibold text-accent">{fmtEta(aggEta)}</span>
                </>}
              </div>
            )}
            {!running && pendingCount > 0 && (
              <span className="text-xs text-text-muted">{pendingCount} file{pendingCount !== 1 ? 's' : ''} ready</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
