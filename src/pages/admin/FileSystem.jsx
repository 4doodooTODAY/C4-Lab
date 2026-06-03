import { useState, useEffect, useMemo } from 'react'
import {
  HardDrive, Folder, FolderOpen, Film, Image, File as FileIcon,
  ExternalLink, Trash2, Loader2, Search, RefreshCw, Camera,
  Building2, AlertCircle, X, Download, ChevronRight, ChevronDown,
  Filter, SortAsc, Eye, Info, Sparkles, CheckCircle2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { forceDownload } from '../../lib/r2'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return '—'
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(2) + ' GB'
  if (b >= 1_048_576)     return (b / 1_048_576).toFixed(1) + ' MB'
  return (b / 1024).toFixed(1) + ' KB'
}

function totalBytes(files) {
  return files.reduce((s, f) => s + (f.file_size || 0), 0)
}

function fileType(name = '') {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['mp4','mov','avi','mkv','webm','m4v','mts','mxf'].includes(ext)) return 'video'
  if (['jpg','jpeg','png','gif','webp','heic','heif','raw','cr2','cr3','arw','nef','dng','tiff','tif'].includes(ext)) return 'image'
  return 'other'
}

// ── Storage bar ────────────────────────────────────────────────────────────────
const R2_FREE_GB   = 10
const R2_PRICE_PER_GB = 0.015   // $/GB-month after free tier

function StorageBar({ trackedBytes, r2Bytes }) {
  const r2GB       = r2Bytes / 1_073_741_824
  const freeGB     = R2_FREE_GB
  const paidGB     = Math.max(0, r2GB - freeGB)
  const monthlyCost = paidGB * R2_PRICE_PER_GB

  // Progress within the 10 GB free tier (capped at 100%)
  const freePct  = Math.min(100, (r2GB / freeGB) * 100)
  const overFree = r2GB > freeGB

  // Bar colour: green if well within free, amber if close, red if paying
  const barColor = overFree
    ? 'from-red-500 to-red-400'
    : freePct > 80
      ? 'from-amber-400 to-amber-300'
      : 'from-emerald-500 to-emerald-400'

  const diff = r2Bytes - trackedBytes

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start justify-between mb-4">
        {/* Left — total usage */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">Cloudflare R2 Storage</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary">{r2GB.toFixed(2)} GB</span>
            <span className="text-sm text-text-muted">of {freeGB} GB free</span>
          </div>
          {diff > 0 && (
            <p className="text-[11px] text-text-muted mt-0.5">
              {fmtBytes(trackedBytes)} footage · {fmtBytes(diff)} finished videos
            </p>
          )}
        </div>

        {/* Right — cost badge */}
        <div className={`text-right px-4 py-2.5 rounded-xl ${overFree ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${overFree ? 'text-red-500' : 'text-emerald-600'}`}>
            Est. monthly
          </p>
          <p className={`text-xl font-bold ${overFree ? 'text-red-500' : 'text-emerald-600'}`}>
            {overFree ? `$${monthlyCost.toFixed(2)}` : '$0.00'}
          </p>
          {overFree
            ? <p className="text-[10px] text-red-400">{paidGB.toFixed(2)} GB @ $0.015/GB</p>
            : <p className="text-[10px] text-emerald-500">{(freeGB - r2GB).toFixed(2)} GB left free</p>
          }
        </div>
      </div>

      {/* Progress bar — tracks against 10 GB free tier */}
      <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${freePct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-text-muted">{r2GB.toFixed(2)} GB used</span>
        <span className="text-[10px] text-text-muted">{freeGB} GB free tier limit · $0.015/GB after</span>
      </div>
    </div>
  )
}

// ── Delete confirmation ────────────────────────────────────────────────────────
function DeleteModal({ file, onConfirm, onCancel, deleting, error }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={20} className="text-red-500" />
        </div>
        <h2 className="text-base font-bold text-text-primary text-center mb-1">Delete file?</h2>
        <p className="text-xs text-text-muted text-center mb-1 break-all px-2">{file.file_name}</p>
        <p className="text-xs text-red-500 text-center mb-5">
          Permanently deletes from Cloudflare R2 and this database. Cannot be undone.
        </p>
        {error && (
          <p className="text-xs text-red-500 text-center mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={deleting} className="flex-1 btn-secondary">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────
function FileRow({ file, onDelete, canDelete }) {
  const t = fileType(file.file_name)
  const iconBg = t === 'video' ? 'bg-blue-50' : t === 'image' ? 'bg-purple-50' : 'bg-gray-100'
  const Icon   = t === 'video' ? Film : t === 'image' ? Image : FileIcon
  const iconCl = t === 'video' ? 'text-blue-500' : t === 'image' ? 'text-purple-500' : 'text-gray-400'

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/30 transition-colors group border-b border-border/40 last:border-0">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon size={13} className={iconCl} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary font-medium truncate leading-tight">{file.file_name}</p>
        <p className="text-[11px] text-text-muted leading-tight mt-0.5">
          {fmtBytes(file.file_size)}
          {file.uploader && ` · ${file.uploader}`}
          {file.created_at && ` · ${formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}`}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {file.file_url && (
          <>
            <a href={file.file_url} target="_blank" rel="noreferrer"
              className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5" title="Open in new tab">
              <ExternalLink size={12} />
            </a>
            <button onClick={() => forceDownload(file.file_url, file.file_name)}
              className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5" title="Download">
              <Download size={12} />
            </button>
          </>
        )}
        {canDelete && (
          <button onClick={() => onDelete(file)}
            className="p-1.5 text-text-muted hover:text-red-500 transition-colors rounded-lg hover:bg-red-50" title="Delete file">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Shoot group inside client folder ─────────────────────────────────────────
function ShootGroup({ label, date, files, onDelete, canDelete, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const size = totalBytes(files)

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2/30 transition-colors text-left bg-surface-2/10 border-b border-border/40"
      >
        {open ? <ChevronDown size={12} className="text-text-muted shrink-0" /> : <ChevronRight size={12} className="text-text-muted shrink-0" />}
        <Camera size={12} className="text-text-muted shrink-0" />
        <span className="text-xs font-semibold text-text-primary flex-1 min-w-0 truncate">{label}</span>
        {date && <span className="text-[11px] text-text-muted shrink-0">{format(parseISO(date), 'MMM d, yyyy')}</span>}
        <span className="text-[11px] text-text-muted shrink-0 ml-2">{files.length} file{files.length !== 1 ? 's' : ''} · {fmtBytes(size)}</span>
      </button>
      {open && files.map(f => <FileRow key={f.id} file={f} onDelete={onDelete} canDelete={canDelete} />)}
    </div>
  )
}

// ── Client folder ─────────────────────────────────────────────────────────────
function ClientFolder({ clientName, subtitle, shootGroups, shoots, onDelete, canDelete, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const allFiles = Object.values(shootGroups).flat()
  const size = totalBytes(allFiles)
  const fileCount = allFiles.length

  return (
    <div className="card overflow-hidden mb-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-surface-2/30 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <Building2 size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{clientName}</p>
          {subtitle && <p className="text-xs text-text-muted truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-xs font-medium text-text-secondary">{fileCount} file{fileCount !== 1 ? 's' : ''}</p>
            <p className="text-xs text-text-muted">{fmtBytes(size)}</p>
          </div>
          {open
            ? <FolderOpen size={15} className="text-accent" />
            : <Folder size={15} className="text-text-muted" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-border">
          {Object.entries(shootGroups).map(([shootId, files]) => {
            const shoot = shoots[shootId]
            const label = shoot?.title || (shootId === '__unlinked' ? 'Unlinked files' : 'Project footage')
            return (
              <ShootGroup
                key={shootId}
                label={label}
                date={shoot?.shoot_date || null}
                files={files}
                onDelete={onDelete}
                canDelete={canDelete}
                defaultOpen={Object.keys(shootGroups).length === 1}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Finished video row ─────────────────────────────────────────────────────────
function FinishedRow({ video }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors group border-b border-border/40 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
        <Film size={13} className="text-green-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{video.project_name}</p>
        <p className="text-[11px] text-text-muted mt-0.5">
          {video.client_name} · Final v{video.revision_number}
          {video.created_at && ` · ${formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}`}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <a href={video.video_url} target="_blank" rel="noreferrer"
          className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5" title="Watch">
          <Eye size={12} />
        </a>
        <button onClick={() => forceDownload(video.video_url, video.file_name)}
          className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5" title="Download">
          <Download size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const SORT_OPTIONS = ['Newest', 'Oldest', 'Largest', 'Smallest', 'Name']
const TYPE_OPTIONS = ['All types', 'Video', 'Image', 'Other']

export default function FileSystem() {
  const { isAdmin, profile } = useAuth()
  const canDelete = isAdmin

  const [footage,        setFootage]        = useState([])
  const [finishedVideos, setFinishedVideos] = useState([])
  const [clientMap,      setClientMap]      = useState({})
  const [shootMap,       setShootMap]       = useState({})
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [sortBy,         setSortBy]         = useState('Newest')
  const [typeFilter,     setTypeFilter]     = useState('All types')
  const [tab,            setTab]            = useState('footage') // 'footage' | 'finished'
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [deleting,       setDeleting]       = useState(false)
  const [deleteError,    setDeleteError]    = useState('')
  const [toast,          setToast]          = useState(null)
  const [r2Total,        setR2Total]        = useState(null) // live from R2
  const [organizing,     setOrganizing]     = useState(false)
  const [organizeResult, setOrganizeResult] = useState(null)

  const isCreative = profile?.role === 'creative' || profile?.role === 'editor'

  const load = async () => {
    setLoading(true)

    // For creatives, limit to their assigned clients
    let clientIds = null
    if (isCreative) {
      const { data: cc } = await supabase
        .from('client_creatives')
        .select('client_id')
        .eq('profile_id', profile.id)
      clientIds = (cc || []).map(r => r.client_id).filter(Boolean)
      if (!clientIds.length) {
        setLoading(false)
        return
      }
    }

    // Build footage query
    let footageQ = supabase
      .from('shoot_uploads')
      .select('id, file_name, file_url, file_size, created_at, shoot_id, project_id, client_id, notes, profiles(full_name)')
      .order('created_at', { ascending: false })
    if (clientIds) footageQ = footageQ.in('client_id', clientIds)

    // Build finished videos query
    let finishedQ = supabase
      .from('project_revisions')
      .select('id, video_url, revision_number, created_at, projects(id, name, client_id, clients(name, contact_name))')
      .eq('status', 'approved')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false })

    // Clients + shoots (scoped if creative)
    let clientsQ = supabase.from('clients').select('id, name, contact_name')
    let shootsQ  = supabase.from('shoots').select('id, title, shoot_date, client_id')
    if (clientIds) {
      clientsQ = clientsQ.in('id', clientIds)
      shootsQ  = shootsQ.in('client_id', clientIds)
    }

    const [footageRes, finishedRes, clientsRes, shootsRes] = await Promise.all([
      footageQ, finishedQ, clientsQ, shootsQ,
    ])

    const newClientMap = {}
    ;(clientsRes.data || []).forEach(c => { newClientMap[c.id] = c })
    setClientMap(newClientMap)

    const newShootMap = {}
    ;(shootsRes.data || []).forEach(s => { newShootMap[s.id] = s })
    setShootMap(newShootMap)

    setFootage((footageRes.data || []).map(f => ({
      ...f,
      uploader: f.profiles?.full_name || null,
    })))

    setFinishedVideos((finishedRes.data || []).map(r => ({
      id:              r.id,
      video_url:       r.video_url,
      project_name:    r.projects?.name || 'Untitled Project',
      client_name:     r.projects?.clients?.name || r.projects?.clients?.contact_name || 'Unknown Client',
      revision_number: r.revision_number,
      created_at:      r.created_at,
      file_name:       `${r.projects?.name || 'project'} — Final v${r.revision_number}.mp4`,
    })))

    setLoading(false)

    // Fetch live R2 total in the background — don't block page render on this
    if (isAdmin) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-list`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        })
          .then(r => r.ok ? r.json() : null)
          .then(json => { if (json?.totalSize) setR2Total(json.totalSize) })
          .catch(() => {})
      })
    }
  }

  useEffect(() => { load() }, [profile?.id])

  // ── Filter + sort footage ────────────────────────────────────────────────────
  const processedFootage = useMemo(() => {
    let list = [...footage]

    // Search
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(f =>
        f.file_name?.toLowerCase().includes(q) ||
        clientMap[f.client_id]?.name?.toLowerCase().includes(q) ||
        shootMap[f.shoot_id]?.title?.toLowerCase().includes(q)
      )
    }

    // Type filter
    if (typeFilter !== 'All types') {
      const t = typeFilter.toLowerCase()
      list = list.filter(f => fileType(f.file_name) === t)
    }

    // Sort
    if (sortBy === 'Newest')   list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (sortBy === 'Oldest')   list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    if (sortBy === 'Largest')  list.sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
    if (sortBy === 'Smallest') list.sort((a, b) => (a.file_size || 0) - (b.file_size || 0))
    if (sortBy === 'Name')     list.sort((a, b) => (a.file_name || '').localeCompare(b.file_name || ''))

    return list
  }, [footage, search, typeFilter, sortBy, clientMap, shootMap])

  // Build client tree from processedFootage
  const tree = useMemo(() => {
    const t = {}
    // For creatives/editors, seed every assigned shoot so the page shows a full
    // list of their shoots — even ones with no uploads yet. Skipped while a
    // search/type filter is active so results stay scoped to matches.
    if (isCreative && !search.trim() && typeFilter === 'All types') {
      Object.values(shootMap).forEach(s => {
        const cid = s.client_id || '__unlinked'
        if (!t[cid]) t[cid] = {}
        if (!t[cid][s.id]) t[cid][s.id] = []
      })
    }
    processedFootage.forEach(f => {
      const cid = f.client_id || '__unlinked'
      if (!t[cid]) t[cid] = {}
      const sid = f.shoot_id || f.project_id || '__unlinked'
      if (!t[cid][sid]) t[cid][sid] = []
      t[cid][sid].push(f)
    })
    return t
  }, [processedFootage, isCreative, search, typeFilter, shootMap])

  // Stats
  const totalSize    = totalBytes(footage)
  const videoCount   = footage.filter(f => fileType(f.file_name) === 'video').length
  const imageCount   = footage.filter(f => fileType(f.file_name) === 'image').length
  const clientCount  = Object.keys(tree).filter(k => k !== '__unlinked').length

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-delete`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ uploadId: deleteTarget.id, fileUrl: deleteTarget.file_url }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Delete failed')
      }
      setFootage(prev => prev.filter(f => f.id !== deleteTarget.id))
      setDeleteTarget(null)
      setToast('File deleted from R2 and database.')
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleOrganize = async () => {
    setOrganizing(true)
    setOrganizeResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      }
      const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-organize`
      const res = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ action: 'reorganize' }) })
      const data = await res.json()
      setOrganizeResult(data)
      setToast(`Done — moved ${data.moved} files, deleted ${data.deletedOrphans} orphaned files.`)
      setTimeout(() => setToast(null), 6000)
      load()
    } catch (err) {
      setToast(`Organize failed: ${err.message}`)
    } finally {
      setOrganizing(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{isCreative ? 'Media' : 'File System'}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {isCreative ? 'Shoots for your assigned clients' : 'All uploaded footage — organised by client and shoot'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleOrganize}
              disabled={organizing || loading}
              className="btn-ghost flex items-center gap-2 text-sm text-accent hover:text-accent/80 disabled:opacity-50"
              title="Reorganize R2 folder structure and delete orphaned files"
            >
              {organizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {organizing ? 'Cleaning…' : 'Clean Up R2'}
            </button>
          )}
          <button onClick={load} className="btn-ghost flex items-center gap-2 text-sm" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 size={22} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <>
          {/* Storage bar — admin only */}
          {isAdmin && r2Total !== null && (
            <StorageBar trackedBytes={totalSize} r2Bytes={r2Total} />
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total files',    value: footage.length },
              { label: 'Tracked size',   value: fmtBytes(totalSize) },
              { label: 'Videos',         value: videoCount },
              { label: 'Images',         value: imageCount },
            ].map(({ label, value }) => (
              <div key={label} className="card p-4 text-center">
                <p className="text-xl font-bold text-text-primary">{value}</p>
                <p className="text-xs text-text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-surface-2/50 rounded-xl p-1 mb-5 w-fit">
            {[
              { id: 'footage',  label: `Footage (${footage.length})` },
              { id: 'finished', label: `Finished Videos (${finishedVideos.length})` },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id
                    ? 'bg-white text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search + filters */}
          {tab === 'footage' && (
            <div className="flex gap-3 mb-5">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  className="input pl-9 w-full text-sm"
                  placeholder="Search by file name, client or shoot…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                    <X size={13} />
                  </button>
                )}
              </div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="input text-sm pr-8 shrink-0 w-36"
              >
                {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="input text-sm pr-8 shrink-0 w-36"
              >
                {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          )}

          {/* ── Footage tab ── */}
          {tab === 'footage' && (
            Object.keys(tree).length === 0 ? (
              <div className="card p-16 text-center">
                <HardDrive size={36} className="mx-auto text-text-muted/20 mb-4" />
                <p className="text-sm font-semibold text-text-primary">
                  {search || typeFilter !== 'All types' ? 'No files match your filters' : 'No files uploaded yet'}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {search || typeFilter !== 'All types' ? 'Try changing your search or filter.' : 'Files will appear here after the first upload.'}
                </p>
              </div>
            ) : (
              <div>
                {Object.entries(tree).map(([clientId, shootGroups]) => {
                  const client     = clientMap[clientId]
                  const clientName = client
                    ? (client.name || client.contact_name || 'Unknown Client')
                    : 'Unlinked Files'
                  const subtitle   = client?.contact_name && client.contact_name !== clientName
                    ? client.contact_name
                    : undefined

                  return (
                    <ClientFolder
                      key={clientId}
                      clientName={clientName}
                      subtitle={subtitle}
                      shootGroups={shootGroups}
                      shoots={shootMap}
                      onDelete={setDeleteTarget}
                      canDelete={canDelete}
                      defaultOpen={Object.keys(tree).length === 1}
                    />
                  )
                })}
              </div>
            )
          )}

          {/* ── Finished Videos tab ── */}
          {tab === 'finished' && (
            finishedVideos.length === 0 ? (
              <div className="card p-16 text-center">
                <Film size={36} className="mx-auto text-text-muted/20 mb-4" />
                <p className="text-sm font-semibold text-text-primary">No approved final videos yet</p>
                <p className="text-xs text-text-muted mt-1">Final cuts will appear here once a client approves a revision.</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-surface-2/30">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Client-approved final videos — {finishedVideos.length} total
                  </p>
                </div>
                {finishedVideos.map(v => <FinishedRow key={v.id} video={v} />)}
              </div>
            )
          )}
        </>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          file={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => { setDeleteTarget(null); setDeleteError('') }}
          deleting={deleting}
          error={deleteError}
        />
      )}

      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm z-40">
          ✓ {toast}
        </div>
      )}

      {/* Error toast */}
      {deleteError && !deleteTarget && (
        <div className="fixed bottom-6 right-6 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm z-40">
          <AlertCircle size={14} /> {deleteError}
          <button onClick={() => setDeleteError('')}><X size={13} /></button>
        </div>
      )}
    </div>
  )
}
