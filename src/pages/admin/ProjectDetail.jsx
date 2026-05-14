import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Check, Trash2, X, Plus, UserMinus,
  CalendarDays, MessageSquare, Film, StickyNote,
  AlertCircle, Clock, MapPin, Upload, FileVideo, Eye,
  Camera, Scissors
} from 'lucide-react'
import { useProject, updateProject, addMember, removeMember } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import {
  format, differenceInDays, isBefore, startOfDay, parseISO
} from 'date-fns'

// ── Constants ─────────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'briefing',        label: 'Planning' },
  { key: 'pre_production',  label: 'Planning' },
  { key: 'production',      label: 'Shooting' },
  { key: 'post_production', label: 'Editing' },
  { key: 'review',          label: 'Rev 1 Review' },
  { key: 'revisions',       label: 'Rev 2 Review' },
  { key: 'delivered',       label: 'Delivered' },
]

// Deduplicated display stages for the progress bar
const DISPLAY_STAGES = [
  { key: 'briefing',        label: 'Planning' },
  { key: 'production',      label: 'Shooting' },
  { key: 'post_production', label: 'Editing' },
  { key: 'review',          label: 'Rev 1 Review' },
  { key: 'revisions',       label: 'Rev 2+ Review' },
  { key: 'delivered',       label: 'Delivered' },
]

const TYPE_LABELS = {
  photography:     'Photography',
  videography:     'Videography',
  editing:         'Editing',
  full_production: 'Full Production',
  social_media:    'Social Media',
}

const TYPE_COLORS = {
  photography:     'bg-purple-50 text-purple-700',
  videography:     'bg-blue-50 text-blue-700',
  editing:         'bg-orange-50 text-orange-700',
  full_production: 'bg-green-50 text-green-700',
  social_media:    'bg-pink-50 text-pink-700',
}

const STATUS_COLORS = {
  active:    'bg-green-50 text-green-700',
  on_hold:   'bg-amber-50 text-amber-700',
  completed: 'bg-blue-50 text-blue-700',
  archived:  'bg-slate-100 text-slate-600',
}

const STATUS_LABELS = {
  active:    'Active',
  on_hold:   'On Hold',
  completed: 'Completed',
  archived:  'Archived',
}

const PAYMENT_COLORS = {
  unpaid:       'bg-red-50 text-red-700',
  deposit_paid: 'bg-amber-50 text-amber-700',
  paid:         'bg-green-50 text-green-700',
}

const PAYMENT_LABELS = {
  unpaid:       'Unpaid',
  deposit_paid: 'Deposit Paid',
  paid:         'Paid',
}

const MEMBER_ROLE_LABELS = {
  lead:         'Lead',
  photographer: 'Photographer',
  videographer: 'Videographer',
  editor:       'Editor',
  assistant:    'Assistant',
}

const MEMBER_ROLE_COLORS = {
  lead:         'bg-accent/10 text-accent',
  photographer: 'bg-amber-50 text-amber-700',
  videographer: 'bg-blue-50 text-blue-700',
  editor:       'bg-green-50 text-green-700',
  assistant:    'bg-slate-100 text-slate-600',
}

const REVISION_STATUS_LABELS = {
  pending_creative_review: 'Creative Review',
  pending_client_review:   'Client Review',
  pending_editor:          'Back to Editor',
  approved:                'Approved',
}

const REVISION_STATUS_COLORS = {
  pending_creative_review: 'bg-amber-50 text-amber-700',
  pending_client_review:   'bg-blue-50 text-blue-700',
  pending_editor:          'bg-purple-50 text-purple-700',
  approved:                'bg-green-50 text-green-700',
}

function fmt$(n) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function fmtBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── Add Member Modal ──────────────────────────────────────────────────────────
function AddMemberModal({ projectId, existingIds, onClose, onAdded }) {
  const [profiles, setProfiles] = useState([])
  const [role, setRole]         = useState('photographer')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url')
      .in('role', ['admin', 'creative'])
      .order('full_name')
      .then(({ data }) => setProfiles((data || []).filter((p) => !existingIds.includes(p.id))))
  }, [existingIds])

  const handleAdd = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await addMember(projectId, selected, role)
      onAdded()
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Add Team Member</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <div className="mb-3">
          <label className="label">Role on project</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(MEMBER_ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto mb-4">
          {profiles.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">No available team members</p>
          )}
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                selected === p.id ? 'border-accent/30 bg-accent/5' : 'border-border hover:border-border-strong'
              }`}
            >
              <Avatar name={p.full_name} url={p.avatar_url} size={8} />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-text-primary">{p.full_name}</p>
                <p className="text-xs text-text-muted capitalize">{p.role}</p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selected === p.id ? 'bg-accent border-accent' : 'border-border-strong'
              }`}>
                {selected === p.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleAdd}
            disabled={!selected || saving}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Project Modal ────────────────────────────────────────────────────────
function EditProjectModal({ project, onClose, onSaved }) {
  const [clients, setClients]   = useState([])
  const [creatives, setCreatives] = useState([])
  const [form, setForm] = useState({
    name:        project.name || '',
    type:        project.type || '',
    client_id:   project.client_id || '',
    location:    project.location || '',
    shoot_date:  project.shoot_date || '',
    start_date:  project.start_date || '',
    due_date:    project.due_date || '',
    creative_id: project.creative_id || '',
    editor_id:   project.editor_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    supabase.from('clients').select('id, name, contact_name').order('name')
      .then(({ data }) => setClients(data || []))
    supabase.from('profiles').select('id, full_name, role').in('role', ['admin', 'creative']).order('full_name')
      .then(({ data }) => setCreatives(data || []))
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      await updateProject(project.id, {
        name:        form.name.trim(),
        type:        form.type || null,
        client_id:   form.client_id || null,
        location:    form.location || null,
        shoot_date:  form.shoot_date || null,
        start_date:  form.start_date || null,
        due_date:    form.due_date || null,
        creative_id: form.creative_id || null,
        editor_id:   form.editor_id || null,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-text-primary">Edit Project</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="label">Project Name *</label>
            <input type="text" className="input" value={form.name} onChange={set('name')} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={set('type')}>
                <option value="">— None —</option>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Client</label>
              <select className="input" value={form.client_id} onChange={set('client_id')}>
                <option value="">— No client —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.contact_name || c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Location</label>
            <input type="text" className="input" placeholder="e.g. Studio A, Downtown LA" value={form.location} onChange={set('location')} />
          </div>

          <div>
            <label className="label">Shoot Date</label>
            <input type="date" className="input" value={form.shoot_date} onChange={set('shoot_date')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={form.start_date} onChange={set('start_date')} />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" value={form.due_date} onChange={set('due_date')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Creative (Shooter)</label>
              <select className="input" value={form.creative_id} onChange={set('creative_id')}>
                <option value="">— Unassigned —</option>
                {creatives.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Editor</label>
              <select className="input" value={form.editor_id} onChange={set('editor_id')}>
                <option value="">— Unassigned —</option>
                {creatives.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Stage Progress Bar ────────────────────────────────────────────────────────
function StageBar({ currentStage, isAdmin, onStageClick }) {
  const currentIdx = DISPLAY_STAGES.findIndex((s) => s.key === currentStage)
  // For planning stages (briefing, pre_production), map to index 0
  const effectiveIdx = currentStage === 'pre_production' ? 0 : currentIdx

  return (
    <div className="bg-white rounded-2xl border border-border p-5 mb-6">
      <p className="text-xs font-semibold text-text-muted mb-3 uppercase tracking-wide">Stage Progress</p>
      <div className="flex items-center gap-0">
        {DISPLAY_STAGES.map((s, i) => {
          const isCurrent = i === effectiveIdx
          const isPast    = i < effectiveIdx
          return (
            <div key={s.key} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex items-center w-full">
                {i > 0 && (
                  <div className={`h-0.5 flex-1 ${isPast || isCurrent ? 'bg-green-400' : 'bg-border'}`} />
                )}
                <button
                  onClick={() => isAdmin && onStageClick(s.key)}
                  disabled={!isAdmin}
                  title={s.label}
                  className={`w-3 h-3 rounded-full shrink-0 border-2 transition-all ${
                    isCurrent
                      ? 'border-accent bg-accent scale-125'
                      : isPast
                      ? 'border-green-500 bg-green-500'
                      : 'border-border bg-white'
                  } ${isAdmin ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
                />
                {i < DISPLAY_STAGES.length - 1 && (
                  <div className={`h-0.5 flex-1 ${isPast ? 'bg-green-400' : 'bg-border'}`} />
                )}
              </div>
              <span className={`text-[9px] font-medium text-center leading-tight ${
                isCurrent ? 'text-accent' : isPast ? 'text-green-600' : 'text-text-muted/60'
              }`}>
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const { project, loading, error: loadError, refetch } = useProject(id)

  // Edit modal
  const [showEdit, setShowEdit] = useState(false)

  // Notes
  const [notes, setNotes]               = useState('')
  const [notesSaving, setNS]            = useState(false)
  const [notesSaved, setNSaved]         = useState(false)

  // Status
  const [status, setStatus]             = useState('')

  // Team modal
  const [showAddMember, setShowAdd]     = useState(false)

  // Danger zone
  const [deleteStep, setDeleteStep]     = useState(0)
  const [deleteTyped, setDeleteTyped]   = useState('')
  const [deleting, setDeleting]         = useState(false)
  const [archiving, setArchiving]       = useState(false)

  const [actionError, setActionError]   = useState('')

  // Shoot uploads + notes + revisions
  const [shootUploads, setShootUploads] = useState([])
  const [shootNotes, setShootNotes]     = useState([])
  const [revisions, setRevisions]       = useState([])
  const [loadingExtras, setLoadingExtras] = useState(false)

  // Assigned creative/editor profiles
  const [creativeProfile, setCreativeProfile] = useState(null)
  const [editorProfile, setEditorProfile]     = useState(null)

  // Inline assign state
  const [assignProfiles, setAssignProfiles]         = useState([])
  const [selectedCreative, setSelectedCreative]     = useState('')
  const [selectedEditor, setSelectedEditor]         = useState('')
  const [assigningCreative, setAssigningCreative]   = useState(false)
  const [assigningEditor, setAssigningEditor]       = useState(false)
  const [showCreativeSelect, setShowCreativeSelect] = useState(false)
  const [showEditorSelect, setShowEditorSelect]     = useState(false)

  useEffect(() => {
    if (project) {
      setNotes(project.notes || '')
      setStatus(project.status || 'active')
    }
  }, [project])

  useEffect(() => {
    if (!id) return
    setLoadingExtras(true)
    Promise.all([
      supabase.from('shoot_uploads').select('*').eq('project_id', id).order('created_at'),
      supabase.from('shoot_notes').select('*, profiles(id, full_name, avatar_url)').eq('project_id', id).order('created_at'),
      supabase.from('project_revisions').select('*, profiles(id, full_name)').eq('project_id', id).order('revision_number'),
    ]).then(([uploads, notes, revs]) => {
      setShootUploads(uploads.data || [])
      setShootNotes(notes.data || [])
      setRevisions(revs.data || [])
      setLoadingExtras(false)
    })
  }, [id])

  useEffect(() => {
    if (!project) return
    if (project.creative_id) {
      supabase.from('profiles').select('id, full_name, avatar_url').eq('id', project.creative_id).single()
        .then(({ data }) => setCreativeProfile(data))
    } else {
      setCreativeProfile(null)
    }
    if (project.editor_id) {
      supabase.from('profiles').select('id, full_name, avatar_url').eq('id', project.editor_id).single()
        .then(({ data }) => setEditorProfile(data))
    } else {
      setEditorProfile(null)
    }
  }, [project])

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('profiles').select('id, full_name, role').in('role', ['admin', 'creative']).order('full_name')
      .then(({ data }) => setAssignProfiles(data || []))
  }, [isAdmin])

  const handleAssignCreative = async () => {
    if (!selectedCreative) return
    setAssigningCreative(true)
    try {
      await updateProject(id, { creative_id: selectedCreative })
      setShowCreativeSelect(false)
      setSelectedCreative('')
      refetch()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setAssigningCreative(false)
    }
  }

  const handleAssignEditor = async () => {
    if (!selectedEditor) return
    setAssigningEditor(true)
    try {
      await updateProject(id, { editor_id: selectedEditor })
      setShowEditorSelect(false)
      setSelectedEditor('')
      refetch()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setAssigningEditor(false)
    }
  }

  const handleStageClick = async (stage) => {
    if (!isAdmin) return
    await updateProject(id, { stage })
    refetch()
  }

  const handleStatusChange = async (e) => {
    const val = e.target.value
    setStatus(val)
    await updateProject(id, { status: val })
    refetch()
  }

  const handleSaveNotes = async () => {
    setNS(true)
    try {
      await updateProject(id, { notes })
      setNSaved(true)
      setTimeout(() => setNSaved(false), 2500)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setNS(false)
    }
  }

  const handleRemoveMember = async (profileId) => {
    try {
      await removeMember(id, profileId)
      refetch()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const handleArchive = async () => {
    setArchiving(true)
    try {
      await updateProject(id, { status: 'archived' })
      navigate('/projects')
    } catch (err) {
      setActionError(err.message)
      setArchiving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await supabase.from('projects').delete().eq('id', id)
      navigate('/projects')
    } catch (err) {
      setActionError(err.message)
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  if (loadError || !project) return (
    <div className="p-8">
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6">
        <ArrowLeft size={14} /> Back to Projects
      </Link>
      <p className="text-sm text-text-muted">{loadError || 'Project not found.'}</p>
    </div>
  )

  const members   = project.project_members || []
  const today     = startOfDay(new Date())
  const dueDate   = project.due_date ? parseISO(project.due_date) : null
  const startDate = project.start_date ? parseISO(project.start_date) : null
  const shootDate = project.shoot_date ? parseISO(project.shoot_date) : null
  const isOD      = dueDate && isBefore(dueDate, today)
  const daysLeft  = dueDate ? differenceInDays(dueDate, today) : null

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-5 transition-colors">
        <ArrowLeft size={14} /> Back to Projects
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {project.type && (
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_COLORS[project.type] || 'bg-surface-2 text-text-muted'}`}>
                {TYPE_LABELS[project.type]}
              </span>
            )}
            {isAdmin ? (
              <select
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border-0 outline-none cursor-pointer ${STATUS_COLORS[status] || 'bg-surface-2 text-text-muted'}`}
                value={status}
                onChange={handleStatusChange}
              >
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[status] || 'bg-surface-2 text-text-muted'}`}>
                {STATUS_LABELS[status] || status}
              </span>
            )}
            {project.clients && (
              <span className="text-xs text-text-muted">
                {project.clients.contact_name || project.clients.name}
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowEdit(true)} className="btn-secondary shrink-0">
            Edit Project
          </button>
        )}
      </div>

      {actionError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{actionError}</div>
      )}

      {/* Stage progress */}
      <StageBar currentStage={project.stage} isAdmin={isAdmin} onStageClick={handleStageClick} />

      {/* Project info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><CalendarDays size={11} /> Shoot Date</p>
          <p className="text-sm font-semibold text-text-primary">
            {shootDate ? format(shootDate, 'MMM d, yyyy') : '—'}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><MapPin size={11} /> Location</p>
          <p className="text-sm font-semibold text-text-primary truncate" title={project.location}>
            {project.location || '—'}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1">
            {isOD ? <AlertCircle size={11} className="text-red-500" /> : <CalendarDays size={11} />} Due Date
          </p>
          <p className={`text-sm font-semibold ${isOD ? 'text-red-600' : 'text-text-primary'}`}>
            {dueDate ? format(dueDate, 'MMM d, yyyy') : '—'}
          </p>
        </div>
      </div>

      {/* Assigned creative + editor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-text-muted mb-3 flex items-center gap-1"><Camera size={11} /> Assigned Creative</p>
          {creativeProfile ? (
            <div className="flex items-center gap-3">
              <Avatar name={creativeProfile.full_name} url={creativeProfile.avatar_url} size={9} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">{creativeProfile.full_name}</p>
                <p className="text-xs text-text-muted">Photographer / Videographer</p>
              </div>
              {isAdmin && !showCreativeSelect && (
                <button
                  onClick={() => { setShowCreativeSelect(true); setSelectedCreative('') }}
                  className="text-xs text-accent hover:text-accent/80 font-medium shrink-0"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Not assigned</p>
          )}
          {isAdmin && (showCreativeSelect || !creativeProfile) && (
            <div className={`flex items-center gap-2 ${creativeProfile ? 'mt-3' : ''}`}>
              <select
                className="input flex-1 text-sm"
                value={selectedCreative}
                onChange={(e) => setSelectedCreative(e.target.value)}
              >
                <option value="">— Select creative —</option>
                {assignProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              <button
                onClick={handleAssignCreative}
                disabled={!selectedCreative || assigningCreative}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 shrink-0"
              >
                {assigningCreative ? <Loader2 size={12} className="animate-spin" /> : null}
                Assign
              </button>
              {showCreativeSelect && (
                <button onClick={() => setShowCreativeSelect(false)} className="btn-ghost p-1.5 shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-text-muted mb-3 flex items-center gap-1"><Scissors size={11} /> Assigned Editor</p>
          {editorProfile ? (
            <div className="flex items-center gap-3">
              <Avatar name={editorProfile.full_name} url={editorProfile.avatar_url} size={9} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">{editorProfile.full_name}</p>
                <p className="text-xs text-text-muted">Editor</p>
              </div>
              {isAdmin && !showEditorSelect && (
                <button
                  onClick={() => { setShowEditorSelect(true); setSelectedEditor('') }}
                  className="text-xs text-accent hover:text-accent/80 font-medium shrink-0"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Not assigned</p>
          )}
          {isAdmin && (showEditorSelect || !editorProfile) && (
            <div className={`flex items-center gap-2 ${editorProfile ? 'mt-3' : ''}`}>
              <select
                className="input flex-1 text-sm"
                value={selectedEditor}
                onChange={(e) => setSelectedEditor(e.target.value)}
              >
                <option value="">— Select editor —</option>
                {assignProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              <button
                onClick={handleAssignEditor}
                disabled={!selectedEditor || assigningEditor}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 shrink-0"
              >
                {assigningEditor ? <Loader2 size={12} className="animate-spin" /> : null}
                Assign
              </button>
              {showEditorSelect && (
                <button onClick={() => setShowEditorSelect(false)} className="btn-ghost p-1.5 shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left (wider) */}
        <div className="lg:col-span-2 space-y-5">

          {/* Shoot Uploads */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Upload size={14} className="text-text-muted" /> Footage Uploads
              </h2>
              <span className="text-xs text-text-muted">{shootUploads.length} file{shootUploads.length !== 1 ? 's' : ''}</span>
            </div>
            {loadingExtras ? (
              <Loader2 size={16} className="animate-spin text-text-muted" />
            ) : shootUploads.length === 0 ? (
              <p className="text-sm text-text-muted">No footage uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {shootUploads.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                      <Film size={14} className="text-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{f.file_name}</p>
                      <p className="text-xs text-text-muted">{fmtBytes(f.file_size)} · {format(new Date(f.created_at), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shoot Notes */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <StickyNote size={14} className="text-text-muted" /> Shoot Notes
            </h2>
            {loadingExtras ? (
              <Loader2 size={16} className="animate-spin text-text-muted" />
            ) : shootNotes.length === 0 ? (
              <p className="text-sm text-text-muted">No shoot notes yet.</p>
            ) : (
              <div className="space-y-4">
                {shootNotes.map((n) => (
                  <div key={n.id} className="bg-surface-2 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar name={n.profiles?.full_name} url={n.profiles?.avatar_url} size={6} />
                      <p className="text-xs font-medium text-text-primary">{n.profiles?.full_name || 'Unknown'}</p>
                      <span className="text-xs text-text-muted">{format(new Date(n.created_at), 'MMM d, yyyy')}</span>
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Revisions */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <FileVideo size={14} className="text-text-muted" /> Revisions
            </h2>
            {loadingExtras ? (
              <Loader2 size={16} className="animate-spin text-text-muted" />
            ) : revisions.length === 0 ? (
              <p className="text-sm text-text-muted">No revisions uploaded yet.</p>
            ) : (
              <div className="space-y-3">
                {revisions.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                    <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                      <FileVideo size={16} className="text-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary">Revision {r.revision_number}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${REVISION_STATUS_COLORS[r.status] || 'bg-surface-2 text-text-muted'}`}>
                          {REVISION_STATUS_LABELS[r.status] || r.status}
                        </span>
                        <span className="text-xs text-text-muted">{format(new Date(r.created_at), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/projects/${id}/revision/${r.id}`)}
                      className="btn-secondary flex items-center gap-1.5 text-xs shrink-0"
                    >
                      <Eye size={13} /> View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team card */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary">Team</h2>
              {isAdmin && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1"
                >
                  <Plus size={12} /> Add member
                </button>
              )}
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-text-muted">No team members yet.</p>
            ) : (
              <div className="space-y-2.5">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <Avatar name={m.profiles?.full_name} url={m.profiles?.avatar_url} size={9} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{m.profiles?.full_name || '—'}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${MEMBER_ROLE_COLORS[m.role] || 'bg-surface-2 text-text-muted'}`}>
                        {MEMBER_ROLE_LABELS[m.role] || m.role}
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveMember(m.profiles?.id)}
                        className="text-text-muted hover:text-red-500 transition-colors"
                        title="Remove member"
                      >
                        <UserMinus size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Internal Notes card */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-primary">Internal Notes</h2>
              <span className="text-xs text-text-muted flex items-center gap-1"><StickyNote size={11} /> Admin only</span>
            </div>
            <textarea
              className="input w-full min-h-[100px] resize-y"
              placeholder="Project notes, context, reminders…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSaveNotes}
            />
            <button
              onClick={handleSaveNotes}
              disabled={notesSaving}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-50 mt-3"
            >
              {notesSaving ? <Loader2 size={13} className="animate-spin" /> : notesSaved ? <Check size={13} /> : null}
              {notesSaved ? 'Saved!' : 'Save Notes'}
            </button>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Timeline card */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-1.5">
              <Clock size={14} /> Timeline
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Start</span>
                <span className="font-medium text-text-primary">
                  {startDate ? format(startDate, 'MMM d, yyyy') : '—'}
                </span>
              </div>
              {shootDate && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Shoot</span>
                  <span className="font-medium text-text-primary">{format(shootDate, 'MMM d, yyyy')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Due</span>
                <span className={`font-medium ${isOD ? 'text-red-600' : 'text-text-primary'}`}>
                  {dueDate ? format(dueDate, 'MMM d, yyyy') : '—'}
                </span>
              </div>
              {daysLeft != null && (
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="text-text-muted">{isOD ? 'Overdue by' : 'Days left'}</span>
                  <span className={`font-semibold ${isOD ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-text-primary'}`}>
                    {Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Quick Links</h2>
            <div className="space-y-1.5">
              <Link
                to={project.clients?.id ? `/messages?client=${project.clients.id}` : '/messages'}
                className="flex items-center gap-2 text-sm text-accent hover:underline"
              >
                <MessageSquare size={14} /> Messages
              </Link>
              <Link
                to={project.clients?.id ? `/videos?client=${project.clients.id}` : '/videos'}
                className="flex items-center gap-2 text-sm text-accent hover:underline"
              >
                <Film size={14} /> Video Review
              </Link>
              <Link
                to={`/projects/${id}/creative`}
                className="flex items-center gap-2 text-sm text-accent hover:underline"
              >
                <Camera size={14} /> Workflow View
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      {isAdmin && (
        <div className="mt-6 bg-white rounded-2xl border border-red-100 p-5">
          <h2 className="text-sm font-semibold text-red-600 mb-4">Danger Zone</h2>
          <div className="space-y-3">
            {project.status !== 'archived' && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Archive project</p>
                  <p className="text-xs text-text-muted">Mark as archived — data is preserved.</p>
                </div>
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-all disabled:opacity-50"
                >
                  {archiving ? <Loader2 size={13} className="animate-spin" /> : null}
                  Archive
                </button>
              </div>
            )}

            <div className={project.status !== 'archived' ? 'border-t border-border pt-3' : ''}>
              {deleteStep === 0 && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Delete project</p>
                    <p className="text-xs text-text-muted">Permanently remove this project and all members.</p>
                  </div>
                  <button
                    onClick={() => setDeleteStep(1)}
                    className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-all"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              )}
              {deleteStep === 1 && (
                <div className="space-y-2">
                  <p className="text-sm text-text-primary">
                    Type <strong>{project.name}</strong> to confirm:
                  </p>
                  <input
                    className="input w-full"
                    value={deleteTyped}
                    onChange={(e) => setDeleteTyped(e.target.value)}
                    placeholder={project.name}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setDeleteStep(0); setDeleteTyped('') }} className="btn-secondary flex-1">
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleteTyped !== project.name || deleting}
                      className="flex-1 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-1.5"
                    >
                      {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Delete permanently
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddMember && (
        <AddMemberModal
          projectId={id}
          existingIds={members.map((m) => m.profiles?.id).filter(Boolean)}
          onClose={() => setShowAdd(false)}
          onAdded={refetch}
        />
      )}

      {showEdit && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEdit(false)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
