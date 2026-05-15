import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Check, Trash2, X, Plus,
  CalendarDays, MessageSquare, Film, StickyNote,
  AlertCircle, MapPin, Upload, FileVideo, Eye,
  Camera, Scissors, Pencil
} from 'lucide-react'
import { useProject, updateProject } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import { format, parseISO } from 'date-fns'

// ── Constants ─────────────────────────────────────────────────────────────────
const DISPLAY_STAGES = [
  { key: 'briefing',        label: 'Planning' },
  { key: 'production',      label: 'Shooting' },
  { key: 'post_production', label: 'Editing' },
  { key: 'review',          label: 'In Review' },
  { key: 'revisions',       label: 'Revisions' },
  { key: 'delivered',       label: 'Delivered' },
]

const STAGE_CURRENT_LABELS = {
  briefing:        'Planning & Briefing',
  pre_production:  'Pre-Production',
  production:      'Shooting',
  post_production: 'Editing',
  review:          'In Review',
  revisions:       'Revisions',
  delivered:       'Delivered',
}

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

const REVISION_STATUS_LABELS = {
  pending_admin_review:    'Admin Review',
  pending_creative_review: 'Creative Review',
  pending_client_review:   'Client Review',
  pending_editor:          'Back to Editor',
  approved:                'Approved',
}

const REVISION_STATUS_COLORS = {
  pending_admin_review:    'bg-orange-50 text-orange-700',
  pending_creative_review: 'bg-amber-50 text-amber-700',
  pending_client_review:   'bg-blue-50 text-blue-700',
  pending_editor:          'bg-purple-50 text-purple-700',
  approved:                'bg-green-50 text-green-700',
}

function fmtBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── Inline Editable Field ─────────────────────────────────────────────────────
function InlineField({ label, value, displayValue, type = 'text', onSave, icon: Icon, readOnly = false }) {
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState(value || '')
  const [saving, setSaving]     = useState(false)

  const handleEdit = () => {
    if (readOnly) return
    setDraft(value || '')
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const handleCancel = () => {
    setDraft(value || '')
    setEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  return (
    <div className="group">
      <p className="text-xs text-text-muted mb-1 flex items-center gap-1">
        {Icon && <Icon size={11} />} {label}
      </p>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type={type}
            className="input flex-1 text-sm py-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center shrink-0 hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          </button>
          <button
            onClick={handleCancel}
            className="w-7 h-7 rounded-lg border border-border text-text-muted flex items-center justify-center shrink-0 hover:bg-surface-2"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <div
          className={`flex items-center gap-2 ${readOnly ? '' : 'cursor-pointer'}`}
          onClick={handleEdit}
        >
          <span className={`text-sm font-medium flex-1 ${displayValue ? 'text-text-primary' : 'text-text-muted/60 italic'}`}>
            {displayValue || '— Add —'}
          </span>
          {!readOnly && (
            <Pencil
              size={12}
              className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Stage Progress Bar ────────────────────────────────────────────────────────
function StageBar({ currentStage, isAdmin, onStageClick }) {
  const currentIdx = DISPLAY_STAGES.findIndex((s) => s.key === currentStage)
  const effectiveIdx = currentStage === 'pre_production' ? 0 : currentIdx

  return (
    <div className="bg-white rounded-2xl border border-border p-5 mb-4">
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
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-text-primary font-medium">
          Current: <span className="text-accent">{STAGE_CURRENT_LABELS[currentStage] || currentStage}</span>
        </p>
        <p className="text-xs text-text-muted">Stage advances automatically as the team completes work.</p>
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

  // Notes
  const [notes, setNotes]               = useState('')
  const [notesSaving, setNS]            = useState(false)
  const [notesSaved, setNSaved]         = useState(false)

  // Status
  const [status, setStatus]             = useState('')


  // Danger zone
  const [deleteStep, setDeleteStep]     = useState(0)
  const [deleteTyped, setDeleteTyped]   = useState('')
  const [deleting, setDeleting]         = useState(false)
  const [archiving, setArchiving]       = useState(false)

  const [actionError, setActionError]   = useState('')

  // Shoot dates
  const [shoots, setShoots]                 = useState([])
  const [showAddShoot, setShowAddShoot]     = useState(false)
  const [newShootDate, setNewShootDate]     = useState('')
  const [newShootTime, setNewShootTime]     = useState('')
  const [newShootLocation, setNewShootLocation] = useState('')
  const [addingShoot, setAddingShoot]       = useState(false)

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

  const fetchShoots = () => {
    supabase.from('project_shoots').select('*').eq('project_id', id).order('shoot_date')
      .then(({ data }) => setShoots(data || []))
  }

  useEffect(() => {
    if (!id) return
    fetchShoots()
  }, [id])

  const handleAddShoot = async () => {
    if (!newShootDate) return
    setAddingShoot(true)
    try {
      await supabase.from('project_shoots').insert({
        project_id:  id,
        shoot_date:  newShootDate,
        shoot_time:  newShootTime  || null,
        location:    newShootLocation || null,
      })

      // Auto-create a calendar event for this shoot
      const timeStr   = newShootTime || '09:00'
      const startAt   = new Date(`${newShootDate}T${timeStr}:00`)
      const endAt     = new Date(startAt.getTime() + 2 * 60 * 60 * 1000) // default 2hr block
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: evtData } = await supabase.from('calendar_events').insert({
        title:      `${project.name} — Shoot`,
        event_type: 'in_person',
        start_at:   startAt.toISOString(),
        end_at:     endAt.toISOString(),
        all_day:    false,
        location:   newShootLocation || null,
        created_by: authUser.id,
      }).select().single()

      // Add creative + editor as members so they see it
      if (evtData) {
        const memberIds = [project.creative_id, project.editor_id].filter(Boolean)
        if (memberIds.length) {
          await supabase.from('calendar_event_members').insert(
            memberIds.map((profile_id) => ({ event_id: evtData.id, profile_id }))
          )
        }
      }

      setNewShootDate('')
      setNewShootTime('')
      setNewShootLocation('')
      setShowAddShoot(false)
      fetchShoots()
    } finally {
      setAddingShoot(false)
    }
  }

  const handleDeleteShoot = async (shootId) => {
    await supabase.from('project_shoots').delete().eq('id', shootId)
    fetchShoots()
  }

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

  // Inline field save handlers
  const handleSaveField = async (field, value) => {
    await updateProject(id, { [field]: value || null })
    refetch()
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
          </div>
        </div>
      </div>

      {actionError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{actionError}</div>
      )}

      {/* Stage progress */}
      <StageBar currentStage={project.stage} isAdmin={isAdmin} onStageClick={handleStageClick} />

      {/* Advance from Planning — admin must do this manually */}
      {isAdmin && project.stage === 'briefing' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-2 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">Project is in Planning</p>
            <p className="text-xs text-amber-600 mt-0.5">Shoot dates and team are set. Ready to move to production?</p>
          </div>
          <button
            onClick={() => handleStageClick('production')}
            className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-colors"
          >
            Advance to Production →
          </button>
        </div>
      )}

      {/* Project info — inline editable */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-6">
        <p className="text-xs font-semibold text-text-muted mb-4 uppercase tracking-wide">Project Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
          <InlineField
            label="Due Date"
            icon={CalendarDays}
            type="date"
            value={project.due_date || ''}
            displayValue={project.due_date ? format(parseISO(project.due_date), 'MMM d, yyyy') : ''}
            onSave={(v) => handleSaveField('due_date', v)}
            readOnly={!isAdmin}
          />
          <div>
            <p className="text-xs text-text-muted mb-1">Client</p>
            <p className="text-sm font-medium text-text-primary">
              {project.clients ? (project.clients.contact_name || project.clients.name) : <span className="text-text-muted/60 italic">— None —</span>}
            </p>
          </div>
        </div>

        {/* Shoot Dates */}
        <div>
          <p className="text-xs text-text-muted mb-2 flex items-center gap-1">
            <CalendarDays size={11} /> Shoot Dates
          </p>
          {shoots.length === 0 ? (
            <p className="text-sm text-text-muted/60 italic mb-2">No shoot dates added yet.</p>
          ) : (
            <div className="mb-2">
              {shoots.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                  <CalendarDays size={13} className="text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary">
                      {format(parseISO(s.shoot_date), 'MMM d, yyyy')}
                      {s.shoot_time && ` · ${s.shoot_time.slice(0, 5)}`}
                    </span>
                    {s.location && <p className="text-xs text-text-muted truncate">{s.location}</p>}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteShoot(s.id)}
                      className="text-text-muted hover:text-red-500 transition-colors ml-auto"
                      title="Remove shoot date"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isAdmin && (
            showAddShoot ? (
              <div className="space-y-2 mt-2">
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="input text-sm py-1 flex-1"
                    value={newShootDate}
                    onChange={(e) => setNewShootDate(e.target.value)}
                    autoFocus
                  />
                  <input
                    type="time"
                    className="input text-sm py-1 w-32 shrink-0"
                    value={newShootTime}
                    onChange={(e) => setNewShootTime(e.target.value)}
                    placeholder="Time"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input text-sm py-1 flex-1"
                    value={newShootLocation}
                    onChange={(e) => setNewShootLocation(e.target.value)}
                    placeholder="Location (address or venue)"
                  />
                  <button
                    onClick={handleAddShoot}
                    disabled={!newShootDate || addingShoot}
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 shrink-0"
                  >
                    {addingShoot ? <Loader2 size={12} className="animate-spin" /> : null}
                    Add
                  </button>
                  <button
                    onClick={() => { setShowAddShoot(false); setNewShootDate(''); setNewShootTime(''); setNewShootLocation('') }}
                    className="btn-ghost p-1.5 shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddShoot(true)}
                className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1 mt-1"
              >
                <Plus size={12} /> Add Shoot
              </button>
            )
          )}
        </div>
      </div>

      {/* Assigned Team */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-6">
        <p className="text-xs font-semibold text-text-muted mb-4 uppercase tracking-wide">Assigned Team</p>
        <div className="space-y-4">

          {/* Creative row */}
          <div className="flex items-center gap-3">
            <div className="w-6 flex items-center justify-center shrink-0">
              <Camera size={13} className="text-text-muted" />
            </div>
            <span className="text-xs text-text-muted w-14 shrink-0">Creative</span>
            {creativeProfile ? (
              <div className="flex items-center gap-3 flex-1">
                <Avatar name={creativeProfile.full_name} url={creativeProfile.avatar_url} size={8} />
                <p className="text-sm font-medium text-text-primary flex-1">{creativeProfile.full_name}</p>
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
              <button
                onClick={() => isAdmin && setShowCreativeSelect(true)}
                className={`text-sm flex-1 text-left ${isAdmin ? 'text-text-muted/60 italic hover:text-accent transition-colors cursor-pointer' : 'text-text-muted/60 italic'}`}
              >
                Unassigned — {isAdmin ? 'click to assign' : 'not yet assigned'}
              </button>
            )}
          </div>
          {isAdmin && (showCreativeSelect || (!creativeProfile && showCreativeSelect)) && (
            <div className="flex items-center gap-2 ml-10">
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
              <button onClick={() => setShowCreativeSelect(false)} className="btn-ghost p-1.5 shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="border-t border-border" />

          {/* Editor row */}
          <div className="flex items-center gap-3">
            <div className="w-6 flex items-center justify-center shrink-0">
              <Scissors size={13} className="text-text-muted" />
            </div>
            <span className="text-xs text-text-muted w-14 shrink-0">Editor</span>
            {editorProfile ? (
              <div className="flex items-center gap-3 flex-1">
                <Avatar name={editorProfile.full_name} url={editorProfile.avatar_url} size={8} />
                <p className="text-sm font-medium text-text-primary flex-1">{editorProfile.full_name}</p>
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
              <button
                onClick={() => isAdmin && setShowEditorSelect(true)}
                className={`text-sm flex-1 text-left ${isAdmin ? 'text-text-muted/60 italic hover:text-accent transition-colors cursor-pointer' : 'text-text-muted/60 italic'}`}
              >
                Unassigned — {isAdmin ? 'click to assign' : 'not yet assigned'}
              </button>
            )}
          </div>
          {isAdmin && showEditorSelect && (
            <div className="flex items-center gap-2 ml-10">
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
              <button onClick={() => setShowEditorSelect(false)} className="btn-ghost p-1.5 shrink-0">
                <X size={14} />
              </button>
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
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <FileVideo size={14} className="text-text-muted" /> Revisions
              </h2>
            </div>
            <p className="text-xs text-text-muted mb-4">Client can approve at any revision — up to 3 total.</p>
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

        </div>

        {/* Right column */}
        <div className="space-y-5">
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

          {/* Internal Notes */}
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

    </div>
  )
}
