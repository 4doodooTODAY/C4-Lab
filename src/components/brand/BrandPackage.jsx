import { useState, useEffect, useRef, useCallback } from 'react'
import { Image as ImageIcon, Upload, Loader2, X, StickyNote, Check, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { uploadToR2, forceDownload } from '../../lib/r2'

function fmtBytes(b) {
  if (!b) return ''
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(1) + ' GB'
  if (b >= 1_048_576)     return (b / 1_048_576).toFixed(1) + ' MB'
  return (b / 1024).toFixed(1) + ' KB'
}

/**
 * BrandPackage — a simple per-client folder for logos + brand notes.
 * Visible/editable by any non-client team member assigned to the client
 * (and admins). RLS on client_brand_package / client_brand_assets enforces this.
 */
export default function BrandPackage({ clientId, clientName }) {
  const { user, profile } = useAuth()
  const fileInputRef = useRef(null)

  const [logos, setLogos]       = useState([])
  const [notes, setNotes]       = useState('')
  const [savedNotes, setSaved]  = useState('')
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesDone, setNotesDone] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!clientId) return
    let alive = true
    Promise.all([
      supabase.from('client_brand_assets').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('client_brand_package').select('notes').eq('client_id', clientId).maybeSingle(),
    ]).then(([a, n]) => {
      if (!alive) return
      setLogos(a.data || [])
      setNotes(n.data?.notes || '')
      setSaved(n.data?.notes || '')
      setLoading(false)
    })
    return () => { alive = false }
  }, [clientId])

  const addLogos = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of files) {
        const { publicUrl } = await uploadToR2({
          file,
          category:    'assets',
          clientName:  clientName || 'client',
          projectName: 'Brand Package',
          folderType:  'projects',
        })
        const { data, error: dbErr } = await supabase.from('client_brand_assets').insert({
          client_id:   clientId,
          file_name:   file.name,
          file_url:    publicUrl,
          file_size:   file.size,
          uploaded_by: user?.id,
        }).select('*').single()
        if (dbErr) throw new Error(dbErr.message)
        setLogos((prev) => [data, ...prev])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }, [clientId, clientName, user?.id])

  const removeLogo = async (logo) => {
    if (!window.confirm(`Remove "${logo.file_name}"? This can't be undone.`)) return
    setRemovingId(logo.id)
    const { data, error: err } = await supabase
      .from('client_brand_assets').delete().eq('id', logo.id).select('id')
    setRemovingId(null)
    if (err || !data?.length) {
      setError(err?.message || "You don't have permission to remove this.")
      return
    }
    setLogos((prev) => prev.filter((l) => l.id !== logo.id))
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    setError('')
    const { error: err } = await supabase.from('client_brand_package').upsert({
      client_id:  clientId,
      notes,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' })
    setSavingNotes(false)
    if (err) { setError(err.message); return }
    setSaved(notes)
    setNotesDone(true)
    setTimeout(() => setNotesDone(false), 2000)
  }

  const notesDirty = notes !== savedNotes

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-text-muted" /></div>

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* ── Logos ── */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <ImageIcon size={14} className="text-text-muted" /> Logos
          </h2>
          <span className="text-xs text-text-muted">{logos.length} file{logos.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addLogos(e.dataTransfer.files) }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center transition-all mb-4 ${
            uploading ? 'opacity-50 cursor-not-allowed border-border'
            : dragOver ? 'border-accent bg-accent/5 cursor-copy'
            : 'border-border hover:border-accent/50 hover:bg-surface-2/50 cursor-pointer'
          }`}
        >
          {uploading
            ? <Loader2 size={20} className="mx-auto text-accent animate-spin mb-1.5" />
            : <Upload size={20} className="mx-auto text-text-muted mb-1.5" />}
          <p className="text-sm font-medium text-text-primary">
            {uploading ? 'Uploading…' : <>Drop logos here or <span className="text-accent">click to browse</span></>}
          </p>
          <p className="text-xs text-text-muted mt-0.5">PNG, JPG, SVG, WEBP — images only</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addLogos(e.target.files)}
          />
        </div>

        {logos.length === 0 ? (
          <p className="text-xs text-text-muted italic">No logos uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {logos.map((logo) => (
              <div key={logo.id} className="group relative rounded-xl border border-border overflow-hidden bg-surface-2/30">
                <div className="aspect-square flex items-center justify-center p-3 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]">
                  <img src={logo.file_url} alt={logo.file_name} className="max-w-full max-h-full object-contain" loading="lazy" />
                </div>
                <div className="px-2 py-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-text-muted truncate flex-1" title={logo.file_name}>{logo.file_name}</span>
                  <button onClick={() => forceDownload(logo.file_url, logo.file_name)} title="Download"
                    className="text-text-muted hover:text-accent transition-colors shrink-0">
                    <Download size={12} />
                  </button>
                  <button onClick={() => removeLogo(logo)} disabled={removingId === logo.id} title="Remove"
                    className="text-text-muted hover:text-red-600 transition-colors shrink-0 disabled:opacity-40">
                    {removingId === logo.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Notes ── */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <StickyNote size={14} className="text-text-muted" /> Brand Notes
          </h2>
          {notesDirty && (
            <button onClick={saveNotes} disabled={savingNotes}
              className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50">
              {savingNotes ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
            </button>
          )}
          {!notesDirty && notesDone && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1"><Check size={12} /> Saved</span>
          )}
        </div>
        <textarea
          className="input resize-none text-sm w-full"
          rows={8}
          placeholder="Brand colors, fonts, voice/tone, do's and don'ts, account logins, anything the team should know about this client…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </div>
  )
}
