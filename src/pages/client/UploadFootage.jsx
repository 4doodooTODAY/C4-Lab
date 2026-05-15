import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, CheckCircle, Loader2, X, FileVideo, AlertCircle } from 'lucide-react'
import { useClientRequests } from '../../hooks/useContentRequests'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { uploadToR2, fmtSpeed, fmtEta } from '../../lib/r2'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function UploadFootage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { submitFootage } = useClientRequests()
  const fileInputRef = useRef(null)
  const [clientId, setClientId] = useState(null)
  const [clientName, setClientName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({ title: '', notes: '' })
  const [progress, setProgress] = useState(0)
  const [uploadStats, setUploadStats] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('client_access')
      .select('client_id, clients(id, name)')
      .eq('profile_id', user.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.client_id) {
          setClientId(data.client_id)
          setClientName(data.clients?.name || '')
        }
      })
  }, [user])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  const handleFile = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setError('')
    setProgress(0)

    try {
      // Upload directly to R2 with real progress tracking
      const { publicUrl } = await uploadToR2({
        file,
        category:    'footage',
        clientName:  clientName || '',
        projectName: form.title || 'upload',
        folderType:  'shoots',
        shootDate:   null,
        onProgress:  setProgress,
        onStats:     setUploadStats,
      })

      setProgress(98)

      // Save to content_requests
      await submitFootage({
        title: form.title || file.name,
        notes: form.notes,
        client_id: clientId,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
      })

      setProgress(100)
      setTimeout(() => setDone(true), 400)
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
      setUploading(false)
      setProgress(0)
    }
  }

  if (done) {
    return (
      <div className="p-8 max-w-lg">
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-text-primary mb-1">Footage uploaded!</h2>
          <p className="text-sm text-text-secondary mb-6">
            Your team has been notified and will start editing soon.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setDone(false); setFile(null); setForm({ title: '', notes: '' }); setProgress(0) }}
              className="btn-secondary flex-1"
            >
              Upload another
            </button>
            <button onClick={() => navigate('/client')} className="btn-primary flex-1">
              Back to home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Upload Footage</h1>
        <p className="text-text-secondary mt-1">Drop your raw footage and we'll take it from there.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !file && fileInputRef.current?.click()}
          className={`card border-2 border-dashed transition-all cursor-pointer ${
            dragOver
              ? 'border-accent bg-accent/5'
              : file
              ? 'border-green-400 bg-green-50/50 cursor-default'
              : 'border-border hover:border-accent/50 hover:bg-surface-2'
          } p-8 text-center`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*,.zip,.mov,.mp4,.avi,.mkv"
            className="hidden"
            onChange={handleFile}
          />

          {file ? (
            <div className="flex items-center gap-3 justify-center">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <FileVideo size={20} className="text-green-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-text-primary truncate max-w-[240px]">{file.name}</p>
                <p className="text-xs text-text-muted">{formatBytes(file.size)}</p>
              </div>
              {!uploading && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors ml-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
                <Upload size={22} className="text-text-muted" />
              </div>
              <p className="text-sm font-semibold text-text-primary mb-1">Drop footage here</p>
              <p className="text-xs text-text-muted">or <span className="text-accent">click to browse</span></p>
              <p className="text-xs text-text-muted mt-2">MP4, MOV, AVI, MKV, images, ZIP</p>
            </>
          )}
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-primary">Uploading…</span>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                {uploadStats && (
                  <>
                    <span className="font-medium text-text-secondary">{fmtSpeed(uploadStats.speed)}</span>
                    {uploadStats.eta != null && <span>{fmtEta(uploadStats.eta)}</span>}
                    <span>·</span>
                  </>
                )}
                <span>{progress}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Shoot title */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Shoot / file name <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            className="input w-full"
            placeholder="e.g. Spring Campaign BTS, April 12 Shoot..."
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            disabled={uploading}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Notes for your editor <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            className="input w-full resize-none"
            rows={3}
            placeholder="Timestamps, key moments, preferred clips, style notes..."
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            disabled={uploading}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 px-3 py-2.5 rounded-lg">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || uploading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload size={14} />
              Upload Footage
            </>
          )}
        </button>
      </form>
    </div>
  )
}
