import { useState, useEffect } from 'react'
import {
  HardDrive, Folder, FolderOpen, Film, Image, File as FileIcon,
  ExternalLink, Trash2, Loader2, ChevronRight, Search,
  RefreshCw, Camera, Building2, AlertCircle, X, Trophy, Download,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { format, formatDistanceToNow } from 'date-fns'
import { parseISO } from 'date-fns'
import { forceDownload } from '../../lib/r2'

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  const ext = name.split('.').pop()?.toLowerCase()
  if (['mp4','mov','avi','mkv','webm','m4v'].includes(ext)) return 'video'
  if (['jpg','jpeg','png','gif','webp','heic','raw','cr2','arw'].includes(ext)) return 'image'
  return 'other'
}

function FileTypeIcon({ name, size = 14 }) {
  const t = fileType(name)
  if (t === 'video') return <Film size={size} className="text-blue-500" />
  if (t === 'image') return <Image size={size} className="text-purple-500" />
  return <FileIcon size={size} className="text-gray-400" />
}

function FileTypeBg({ name }) {
  const t = fileType(name)
  if (t === 'video') return 'bg-blue-50'
  if (t === 'image') return 'bg-purple-50'
  return 'bg-gray-100'
}

// ── Delete confirmation ───────────────────────────────────────────────────────
function DeleteConfirm({ file, onConfirm, onCancel, deleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-500" />
        </div>
        <h2 className="text-base font-bold text-text-primary text-center mb-1">Delete file?</h2>
        <p className="text-xs text-text-muted text-center mb-1">{file.file_name}</p>
        <p className="text-xs text-red-500 text-center mb-5">
          This permanently deletes the file from R2 storage and the database. Cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={deleting} className="flex-1 btn-secondary">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────
function FileRow({ file, onDelete }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors group">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${FileTypeBg({ name: file.file_name })}`}>
        <FileTypeIcon name={file.file_name} size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary font-medium truncate">{file.file_name}</p>
        <p className="text-xs text-text-muted">
          {fmtBytes(file.file_size)}
          {file.uploader && ` · by ${file.uploader}`}
          {file.created_at && ` · ${formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}`}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {file.file_url && (
          <a
            href={file.file_url}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5"
            title="Open file"
          >
            <ExternalLink size={13} />
          </a>
        )}
        <button
          onClick={() => onDelete(file)}
          className="p-1.5 text-text-muted hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
          title="Delete file"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Folder node ───────────────────────────────────────────────────────────────
function FolderNode({ label, subtitle, count, size, icon: Icon, iconColor, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-surface-2/40 transition-colors text-left"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}>
          <Icon size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{label}</p>
          {subtitle && <p className="text-xs text-text-muted truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-xs font-medium text-text-muted">{count} file{count !== 1 ? 's' : ''}</p>
            <p className="text-xs text-text-muted">{fmtBytes(size)}</p>
          </div>
          {open
            ? <FolderOpen size={16} className="text-accent" />
            : <Folder size={16} className="text-text-muted" />
          }
        </div>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  )
}

// ── Shoot folder inside client ────────────────────────────────────────────────
function ShootFolder({ label, date, files, onDelete }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors text-left bg-surface-2/20"
      >
        <Camera size={13} className="text-text-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-text-primary">{label}</span>
          {date && <span className="text-xs text-text-muted ml-2">{format(parseISO(date), 'MMM d, yyyy')}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-text-muted">
          <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
          <span>{fmtBytes(totalBytes(files))}</span>
          <ChevronRight size={12} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {open && files.map((f) => <FileRow key={f.id} file={f} onDelete={onDelete} />)}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FileSystem() {
  const [allFiles,       setAllFiles]       = useState([])
  const [finishedVideos, setFinishedVideos] = useState([])
  const [clients,        setClients]        = useState({})  // id → { name, contact_name }
  const [shoots,         setShoots]         = useState({})  // id → { title, shoot_date }
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [deleting,       setDeleting]       = useState(false)
  const [deleteError,    setDeleteError]    = useState('')

  const load = async () => {
    setLoading(true)
    const [filesRes, clientsRes, shootsRes, revisionsRes] = await Promise.all([
      supabase
        .from('shoot_uploads')
        .select('id, file_name, file_url, file_size, created_at, shoot_id, project_id, client_id, notes, profiles(full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, contact_name'),
      supabase.from('shoots').select('id, title, shoot_date, client_id'),
      supabase
        .from('project_revisions')
        .select('id, video_url, revision_number, created_at, projects(id, name, client_id, clients(name, contact_name))')
        .eq('status', 'approved')
        .not('video_url', 'is', null)
        .order('created_at', { ascending: false }),
    ])

    const clientMap = {}
    ;(clientsRes.data || []).forEach((c) => { clientMap[c.id] = c })

    const shootMap = {}
    ;(shootsRes.data || []).forEach((s) => { shootMap[s.id] = s })

    const enriched = (filesRes.data || []).map((f) => ({
      ...f,
      uploader: f.profiles?.full_name || null,
    }))

    const finished = (revisionsRes.data || []).map((r) => ({
      id:          r.id,
      video_url:   r.video_url,
      project_name: r.projects?.name || 'Untitled Project',
      client_name:  r.projects?.clients?.name || r.projects?.clients?.contact_name || 'Unknown Client',
      revision_number: r.revision_number,
      created_at:  r.created_at,
      file_name:   `${r.projects?.name || 'project'} — Final v${r.revision_number}.mp4`,
    }))

    setAllFiles(enriched)
    setFinishedVideos(finished)
    setClients(clientMap)
    setShoots(shootMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Filter by search
  const filtered = search.trim()
    ? allFiles.filter((f) =>
        f.file_name?.toLowerCase().includes(search.toLowerCase()) ||
        clients[f.client_id]?.name?.toLowerCase().includes(search.toLowerCase()) ||
        shoots[f.shoot_id]?.title?.toLowerCase().includes(search.toLowerCase())
      )
    : allFiles

  // Build tree: client → shoot → files
  const tree = {}
  filtered.forEach((f) => {
    const clientId = f.client_id || '__unlinked'
    if (!tree[clientId]) tree[clientId] = {}

    const shootId = f.shoot_id || f.project_id || '__unlinked'
    if (!tree[clientId][shootId]) tree[clientId][shootId] = []
    tree[clientId][shootId].push(f)
  })

  // Stats
  const totalFiles = allFiles.length
  const totalSize  = totalBytes(allFiles)
  const clientCount = Object.keys(tree).filter((k) => k !== '__unlinked').length

  // Delete handler
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
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            uploadId: deleteTarget.id,
            fileUrl:  deleteTarget.file_url,
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Delete failed')
      }
      setAllFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <HardDrive size={22} className="text-text-muted" /> File System
          </h1>
          <p className="text-sm text-text-muted mt-1">All uploaded footage and files — organized by client and shoot</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total files',   value: totalFiles },
            { label: 'Total storage', value: fmtBytes(totalSize) },
            { label: 'Clients',       value: clientCount },
          ].map(({ label, value }) => (
            <div key={label} className="card p-4 text-center">
              <p className="text-xl font-bold text-text-primary">{value}</p>
              <p className="text-xs text-text-muted mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="input pl-9 w-full"
          placeholder="Search files, clients, shoots…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
            <X size={13} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={22} className="animate-spin text-text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <HardDrive size={36} className="mx-auto text-text-muted/20 mb-4" />
          <p className="text-sm font-semibold text-text-primary">{search ? 'No files match your search' : 'No files uploaded yet'}</p>
          <p className="text-xs text-text-muted mt-1">{search ? 'Try a different search term.' : 'Files will appear here after the first upload.'}</p>
        </div>
      ) : (
        <div>
          {/* ── Finished Products ── */}
          {finishedVideos.length > 0 && (
            <FolderNode
              label="Finished Products"
              subtitle="All client-approved final videos"
              count={finishedVideos.length}
              size={0}
              icon={Trophy}
              iconColor="bg-green-500"
              defaultOpen={true}
            >
              {finishedVideos.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Film size={13} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary font-medium truncate">{v.project_name}</p>
                    <p className="text-xs text-text-muted">{v.client_name} · Final v{v.revision_number} · {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <a href={v.video_url} target="_blank" rel="noreferrer"
                      className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5" title="Open">
                      <ExternalLink size={13} />
                    </a>
                    <button onClick={() => forceDownload(v.video_url, v.file_name)}
                      className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5" title="Download">
                      <Download size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </FolderNode>
          )}

          {Object.entries(tree).map(([clientId, shootGroups]) => {
            const client = clients[clientId]
            const clientName = client ? (client.name || client.contact_name || 'Unknown Client') : 'Unlinked Files'
            const allClientFiles = Object.values(shootGroups).flat()

            return (
              <FolderNode
                key={clientId}
                label={clientName}
                subtitle={client?.contact_name && client.contact_name !== clientName ? client.contact_name : undefined}
                count={allClientFiles.length}
                size={totalBytes(allClientFiles)}
                icon={Building2}
                iconColor="bg-accent"
                defaultOpen={Object.keys(tree).length === 1}
              >
                {Object.entries(shootGroups).map(([shootId, files]) => {
                  const shoot = shoots[shootId]
                  const shootLabel = shoot?.title || (shootId === '__unlinked' ? 'Unlinked files' : 'Project files')
                  return (
                    <ShootFolder
                      key={shootId}
                      label={shootLabel}
                      date={shoot?.shoot_date || null}
                      files={files}
                      onDelete={setDeleteTarget}
                    />
                  )
                })}
              </FolderNode>
            )
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirm
          file={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => { setDeleteTarget(null); setDeleteError('') }}
          deleting={deleting}
        />
      )}

      {deleteError && (
        <div className="fixed bottom-6 right-6 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm">
          <AlertCircle size={14} /> {deleteError}
          <button onClick={() => setDeleteError('')}><X size={13} /></button>
        </div>
      )}
    </div>
  )
}
