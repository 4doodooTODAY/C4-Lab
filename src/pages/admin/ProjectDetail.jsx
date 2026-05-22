import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Check, Trash2, X, Plus,
  CalendarDays, MessageSquare, Film, StickyNote,
  AlertCircle, MapPin, Upload, FileVideo, Eye,
  Camera, Scissors, Pencil, Download, PlayCircle, User,
  Sparkles, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { useProject, updateProject } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { notify, notifyAdmins } from '../../lib/notify'
import Avatar from '../../components/ui/Avatar'
import { format, parseISO } from 'date-fns'
import { fmtTime } from '../../lib/time'
import { forceDownload, uploadToR2 } from '../../lib/r2'

// ── Constants ─────────────────────────────────────────────────────────────────
const DISPLAY_STAGES = [
  { key: 'pitch',           label: 'Pitch' },
  { key: 'production',      label: 'Shoot' },
  { key: 'post_production', label: 'Editing' },
  { key: 'review',          label: 'Review' },
  { key: 'delivered',       label: 'Delivered' },
]

// Map all DB stage values to the nearest DISPLAY_STAGES key
const STAGE_DISPLAY_MAP = {
  pitch:           'pitch',
  briefing:        'production',
  pre_production:  'production',
  production:      'production',
  post_production: 'post_production',
  review:          'review',
  revisions:       'review',
  ready_to_post:   'delivered',
  delivered:       'delivered',
}

const STAGE_CURRENT_LABELS = {
  pitch:           'Pitch — Awaiting Approval',
  briefing:        'Setup & Planning',
  pre_production:  'Pre-Production',
  production:      'Shoot / Footage Upload',
  post_production: 'Editing',
  review:          'In Review',
  revisions:       'Revisions',
  ready_to_post:   'Ready to Post',
  delivered:       'Delivered',
}

// Who needs to act at each stage
const WHOS_UP = {
  pitch:           { who: 'client',     label: 'Client / Admin', msg: 'Awaiting pitch approval before work begins.' },
  briefing:        { who: 'admin',      label: 'Admin',          msg: 'Set up the project and begin when ready.' },
  pre_production:  { who: 'admin',      label: 'Admin',          msg: 'Schedule the shoot.' },
  production:      { who: 'creative',   label: 'Photographer',   msg: 'Upload footage + notes after the shoot.' },
  post_production: { who: 'editor',     label: 'Editor',         msg: 'Upload the first cut — it goes to the photographer first.' },
  review:          { who: 'varies',     label: 'Review Cycle',   msg: 'Photographer → Client → Editor until approved.' },
  revisions:       { who: 'editor',     label: 'Editor',         msg: 'Client requested changes — upload a revision.' },
  ready_to_post:   { who: 'admin',      label: 'Admin',          msg: 'Client approved! Post it online and mark complete.' },
  delivered:       { who: 'done',       label: 'Complete',       msg: 'Project delivered.' },
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
  pending_photographer_review: 'Photographer Review',
  pending_admin_review:        'Admin Review',
  pending_creative_review:     'Creative Review',   // legacy
  pending_client_review:       'Client Review',
  pending_editor:              'Back to Editor',
  approved:                    'Approved',
}

const REVISION_STATUS_COLORS = {
  pending_photographer_review: 'bg-amber-50 text-amber-700',
  pending_admin_review:        'bg-orange-50 text-orange-700',
  pending_creative_review:     'bg-amber-50 text-amber-700',
  pending_client_review:       'bg-blue-50 text-blue-700',
  pending_editor:              'bg-purple-50 text-purple-700',
  approved:                    'bg-green-50 text-green-700',
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

// ── Pitch Approval Panel (admin) ──────────────────────────────────────────────
function PitchApprovalPanel({ project, profile, onApproved, onRefresh }) {
  const [approving,  setApproving]  = useState(false)
  const [notes,      setNotes]      = useState(project.pitch_notes || '')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const handleApprove = async () => {
    setApproving(true); setError('')
    try {
      await updateProject(project.id, {
        stage:             'pre_production',
        pitch_approved_by: profile.id,
        pitch_approved_at: new Date().toISOString(),
      })
      // Notify the creative
      if (project.creative_id) {
        await notify({
          profileId: project.creative_id, actorId: profile.id, type: 'pitch_approved',
          title: `"${project.name}" pitch approved — schedule the shoot`,
          body:  'The pitch has been approved. Schedule the shoot and begin production.',
          link:  `/projects/${project.id}`,
        })
      }
      // Notify client
      if (project.client_id) {
        const { data: c } = await supabase.from('clients').select('profile_id').eq('id', project.client_id).maybeSingle()
        if (c?.profile_id) {
          await notify({
            profileId: c.profile_id, actorId: profile.id, type: 'pitch_approved',
            title: `"${project.name}" is approved and in motion!`,
            body:  'Your project has been approved by the admin. Work is beginning.',
            link:  `/my-projects`,
          })
        }
      }
      onApproved()
    } catch (err) {
      setError(err.message)
    } finally {
      setApproving(false)
    }
  }

  const handleSaveNotes = async () => {
    setSaving(true)
    await updateProject(project.id, { pitch_notes: notes })
    setSaving(false)
    onRefresh()
  }

  return (
    <div className="mb-6 bg-gradient-to-br from-accent/5 to-purple-50 border border-accent/20 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-accent" />
        <h3 className="text-sm font-bold text-text-primary">Pitch Review</h3>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">Awaiting Approval</span>
      </div>

      {project.concept && (
        <div className="bg-white rounded-xl px-4 py-3 mb-3 border border-accent/10">
          <p className="text-xs text-text-muted font-medium mb-1">Project Brief</p>
          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{project.concept}</p>
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-text-muted font-medium mb-1 block">Admin notes / feedback for client</label>
        <div className="flex gap-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes visible to the client…"
            className="input flex-1 min-h-[72px] resize-none text-sm"
          />
          <button onClick={handleSaveNotes} disabled={saving} className="btn-secondary self-end px-3 disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <button
        onClick={handleApprove}
        disabled={approving}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {approving ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
        Approve Pitch & Begin Pre-Production
      </button>
    </div>
  )
}

// ── Stage Progress Bar ────────────────────────────────────────────────────────
function StageBar({ currentStage, isAdmin, onStageClick }) {
  const stageToIdx = {
    pitch: 0,
    briefing: 1, pre_production: 1, production: 1,
    post_production: 2,
    review: 3, revisions: 3,
    ready_to_post: 4, delivered: 4,
  }
  const effectiveIdx = stageToIdx[currentStage] ?? 0

  return (
    <div className="bg-white rounded-2xl border border-border p-5 mb-4">
      <p className="text-xs font-semibold text-text-muted mb-3 uppercase tracking-wide">Project Timeline</p>
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
        {isAdmin && <p className="text-xs text-text-muted">Click a dot to jump to that stage.</p>}
      </div>
    </div>
  )
}

// ── Who's Up Banner ───────────────────────────────────────────────────────────
function WhosUpBanner({ stage, editorProfile, creativeProfile, onBeginProject, isAdmin }) {
  const info = WHOS_UP[stage] || WHOS_UP.briefing
  if (info.who === 'done') return null

  const personName =
    info.who === 'editor'    ? (editorProfile?.full_name   || 'Editor (unassigned)') :
    info.who === 'creative'  ? (creativeProfile?.full_name || 'Photographer (unassigned)') :
    info.who === 'client'    ? 'Client' :
    info.who === 'varies'    ? null :
    info.who === 'admin'     ? 'Admin' : null

  const colorMap = {
    admin:    'bg-blue-50 border-blue-200 text-blue-900',
    editor:   'bg-purple-50 border-purple-200 text-purple-900',
    client:   'bg-amber-50 border-amber-200 text-amber-900',
    creative: 'bg-green-50 border-green-200 text-green-900',
    varies:   'bg-gray-50 border-gray-200 text-gray-900',
  }
  const badgeMap = {
    admin:    'bg-blue-100 text-blue-700',
    editor:   'bg-purple-100 text-purple-700',
    client:   'bg-amber-100 text-amber-700',
    creative: 'bg-green-100 text-green-700',
    varies:   'bg-gray-100 text-gray-700',
  }

  return (
    <div className={`rounded-2xl border p-4 mb-4 flex items-center justify-between gap-4 ${colorMap[info.who]}`}>
      <div className="flex items-center gap-3">
        <User size={16} className="shrink-0 opacity-60" />
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeMap[info.who]}`}>
              UP NEXT: {info.label.toUpperCase()}
            </span>
            {personName && <span className="text-sm font-semibold">{personName}</span>}
          </div>
          <p className="text-xs opacity-75">{info.msg}</p>
        </div>
      </div>
      {stage === 'briefing' && isAdmin && (
        <button
          onClick={onBeginProject}
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-colors shadow-sm"
        >
          <PlayCircle size={15} /> Begin Project
        </button>
      )}
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

  // Link existing shoot
  const [clientShoots, setClientShoots]     = useState([])
  const [showLinkShoot, setShowLinkShoot]   = useState(false)
  const [linkingShoot, setLinkingShoot]     = useState(false)
  const [selectedLinkShoot, setSelectedLinkShoot] = useState('')

  // Shoot uploads + notes + revisions
  const [shootUploads, setShootUploads] = useState([])
  const [shootNotes, setShootNotes]     = useState([])
  const [revisions, setRevisions]       = useState([])
  const [loadingExtras, setLoadingExtras] = useState(false)

  // Direct project media upload
  const mediaInputRef = useRef(null)
  const [mediaFiles, setMediaFiles]           = useState([])
  const [uploadingMedia, setUploadingMedia]   = useState(false)
  const [mediaUploadError, setMediaUploadError] = useState('')
  const [mediaDragOver, setMediaDragOver]     = useState(false)

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
      const shootTitle = `${project.name} — Shoot`
      const timeStr    = newShootTime || '09:00'
      const startAt    = new Date(`${newShootDate}T${timeStr}:00`)
      const endAt      = new Date(startAt.getTime() + 2 * 60 * 60 * 1000)

      // 1. Create calendar event
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: evtData } = await supabase.from('calendar_events').insert({
        title:      shootTitle,
        event_type: 'in_person',
        start_at:   startAt.toISOString(),
        end_at:     endAt.toISOString(),
        all_day:    false,
        location:   newShootLocation || null,
        created_by: authUser.id,
      }).select().single()

      // 2. Insert the project shoot, linking back to the calendar event
      await supabase.from('project_shoots').insert({
        project_id:        id,
        shoot_date:        newShootDate,
        shoot_time:        newShootTime  || null,
        location:          newShootLocation || null,
        title:             shootTitle,
        status:            'scheduled',
        calendar_event_id: evtData?.id || null,
      })

      // 3. Add team members + client to calendar_event_members so everyone sees it
      if (evtData) {
        const memberIds = [project.editor_id].filter(Boolean)

        // Resolve client's profile_id (clients table links to profiles via profile_id)
        if (project.client_id) {
          const { data: clientRow } = await supabase
            .from('clients')
            .select('profile_id')
            .eq('id', project.client_id)
            .maybeSingle()
          if (clientRow?.profile_id) memberIds.push(clientRow.profile_id)
        }

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
    // Look up the linked calendar event before deleting so we can clean it up
    const { data: shootRow } = await supabase
      .from('project_shoots')
      .select('calendar_event_id')
      .eq('id', shootId)
      .maybeSingle()

    await supabase.from('project_shoots').delete().eq('id', shootId)

    if (shootRow?.calendar_event_id) {
      // Cascade deletes calendar_event_members automatically (FK on delete cascade)
      await supabase.from('calendar_events').delete().eq('id', shootRow.calendar_event_id)
    }

    fetchShoots()
  }

  const handleLinkShoot = async () => {
    if (!selectedLinkShoot) return
    setLinkingShoot(true)
    await updateProject(id, { shoot_id: selectedLinkShoot })
    setShowLinkShoot(false)
    setSelectedLinkShoot('')
    setLinkingShoot(false)
    refetch()
  }

  useEffect(() => {
    if (!project?.client_id) return
    supabase.from('shoots').select('id, title, shoot_date, shoot_time, location, status')
      .eq('client_id', project.client_id)
      .order('shoot_date', { ascending: false })
      .then(({ data }) => setClientShoots(data || []))
  }, [project?.client_id])

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
    supabase.from('profiles').select('id, full_name, role').in('role', ['admin', 'creative', 'editor']).order('full_name')
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

  const handleStageClick = async (displayStageKey) => {
    if (!isAdmin) return
    // Map display stage keys back to real DB values
    const dbStage = {
      pitch:           'pitch',
      production:      'production',
      post_production: 'post_production',
      review:          'review',
      delivered:       'delivered',
    }[displayStageKey] || displayStageKey
    await updateProject(id, { stage: dbStage })
    refetch()
  }

  const handleBeginProject = async () => {
    // "Begin Project" from briefing/pre_production → move to production
    const next = project.stage === 'pitch' ? 'pre_production' : 'production'
    await updateProject(id, { stage: next })
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

  const handleMediaUpload = async () => {
    if (!mediaFiles.length) return
    setUploadingMedia(true)
    setMediaUploadError('')
    try {
      for (const file of mediaFiles) {
        const { publicUrl } = await uploadToR2({
          file,
          category:    'footage',
          clientName:  project.clients?.name || project.clients?.contact_name || 'client',
          projectName: project.name,
          folderType:  'projects',
        })
        const { error: dbErr } = await supabase.from('shoot_uploads').insert({
          project_id:  id,
          client_id:   project.client_id || null,
          file_name:   file.name,
          file_url:    publicUrl,
          file_size:   file.size,
          uploaded_by: profile.id,
        })
        if (dbErr) throw new Error(dbErr.message)
      }
      // Refresh uploads list
      const { data } = await supabase.from('shoot_uploads').select('*').eq('project_id', id).order('created_at')
      setShootUploads(data || [])
      setMediaFiles([])
    } catch (err) {
      setMediaUploadError(err.message)
    } finally {
      setUploadingMedia(false)
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

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-5 transition-colors">
        <ArrowLeft size={14} /> Back to Projects
      </Link>

      {/* ── READY TO POST BANNER ── */}
      {project.stage === 'ready_to_post' && isAdmin && (
        <div className="mb-6 rounded-2xl bg-green-500 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-green-500/20">
          <div>
            <p className="text-lg font-bold text-white">🎉 Client approved this video!</p>
            <p className="text-sm text-green-100 mt-0.5">Post it online, then mark the project complete.</p>
          </div>
          <button
            onClick={async () => { await updateProject(id, { stage: 'delivered' }); refetch() }}
            className="shrink-0 px-6 py-3 rounded-xl bg-white text-green-700 text-sm font-bold hover:bg-green-50 transition-colors flex items-center gap-2 shadow"
          >
            <Check size={16} /> Mark as Posted & Complete
          </button>
        </div>
      )}

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

      {/* Who's Up */}
      <WhosUpBanner
        stage={project.stage}
        editorProfile={editorProfile}
        creativeProfile={creativeProfile}
        onBeginProject={handleBeginProject}
        isAdmin={isAdmin}
      />

      {/* ── Pitch Approval Panel (admin can approve or push to client) ───── */}
      {project.stage === 'pitch' && isAdmin && (
        <PitchApprovalPanel
          project={project}
          profile={profile}
          onApproved={() => { updateProject(id, { stage: 'pre_production', pitch_approved_by: profile.id, pitch_approved_at: new Date().toISOString() }); refetch() }}
          onRefresh={refetch}
        />
      )}

      {/* Mark as Posted */}
      {project.stage === 'ready_to_post' && isAdmin && (
        <div className="mb-6 p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-900">Client approved this video ✅</p>
            <p className="text-xs text-blue-600 mt-0.5">Once posted online, mark it complete.</p>
          </div>
          <button
            onClick={async () => { await updateProject(id, { stage: 'delivered' }); refetch() }}
            className="shrink-0 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Check size={14} /> Mark as Posted
          </button>
        </div>
      )}

      {/* Project info — inline editable */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-6">
        <p className="text-xs font-semibold text-text-muted mb-4 uppercase tracking-wide">Project Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
          <InlineField
            label="Post Date"
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
          {project.shoot_id && (() => {
            const linked = clientShoots.find(s => s.id === project.shoot_id)
            if (!linked) return null
            return (
              <div className="flex items-center gap-2 py-1.5 mb-2 bg-accent/5 rounded-lg px-2">
                <Camera size={13} className="text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-accent">{linked.title}</p>
                  {linked.shoot_date && (
                    <p className="text-xs text-text-muted">
                      {format(parseISO(linked.shoot_date), 'MMM d, yyyy')}
                      {linked.shoot_time && ` · ${fmtTime(linked.shoot_time)}`}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <button onClick={() => updateProject(id, { shoot_id: null }).then(refetch)}
                    className="text-text-muted hover:text-red-500 transition-colors" title="Unlink">
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })()}
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
                      {s.shoot_time && ` · ${fmtTime(s.shoot_time)}`}
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
              <div>
                <button
                  onClick={() => setShowAddShoot(true)}
                  className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1 mt-1"
                >
                  <Plus size={12} /> Add Shoot
                </button>
                {!showLinkShoot && (
                  <button onClick={() => setShowLinkShoot(true)}
                    className="text-xs text-text-muted hover:text-accent font-medium flex items-center gap-1 mt-1">
                    <Camera size={12} /> Link Existing Shoot
                  </button>
                )}
                {showLinkShoot && (
                  <div className="flex gap-2 mt-2">
                    <select className="input text-sm py-1 flex-1" value={selectedLinkShoot}
                      onChange={e => setSelectedLinkShoot(e.target.value)}>
                      <option value="">— Select a shoot —</option>
                      {clientShoots.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.title}{s.shoot_date ? ` · ${format(parseISO(s.shoot_date), 'MMM d, yyyy')}` : ''}
                        </option>
                      ))}
                    </select>
                    <button onClick={handleLinkShoot} disabled={!selectedLinkShoot || linkingShoot}
                      className="btn-primary text-xs px-3 shrink-0 disabled:opacity-50">
                      {linkingShoot ? <Loader2 size={12} className="animate-spin" /> : 'Link'}
                    </button>
                    <button onClick={() => { setShowLinkShoot(false); setSelectedLinkShoot('') }}
                      className="btn-ghost p-1.5 shrink-0"><X size={13} /></button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Assigned Team */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-6">
        <p className="text-xs font-semibold text-text-muted mb-4 uppercase tracking-wide">Assigned Team</p>
        <div className="space-y-4">

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

          {/* Footage Uploads */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Upload size={14} className="text-text-muted" /> Footage Uploads
              </h2>
              <span className="text-xs text-text-muted">{shootUploads.length} file{shootUploads.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Drop zone — always visible, click to open file picker */}
            <div
              onDragOver={(e) => { e.preventDefault(); setMediaDragOver(true) }}
              onDragLeave={() => setMediaDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setMediaDragOver(false)
                setMediaFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)])
              }}
              onClick={() => !uploadingMedia && mediaInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-all mb-4 ${
                uploadingMedia
                  ? 'opacity-50 cursor-not-allowed border-border'
                  : mediaDragOver
                  ? 'border-accent bg-accent/5 cursor-copy'
                  : 'border-border hover:border-accent/50 hover:bg-surface-2/50 cursor-pointer'
              }`}
            >
              <Upload size={20} className="mx-auto text-text-muted mb-1.5" />
              <p className="text-sm font-medium text-text-primary">
                Drop files here or <span className="text-accent">click to browse</span>
              </p>
              <p className="text-xs text-text-muted mt-0.5">Videos, photos, and more from your computer or camera roll</p>
              <input
                ref={mediaInputRef}
                type="file"
                multiple
                accept="video/*,image/*,.mov,.mp4,.avi,.mkv,.raw,.cr2,.arw,.zip"
                className="hidden"
                onChange={(e) => setMediaFiles((prev) => [...prev, ...Array.from(e.target.files)])}
              />
            </div>

            {/* Staged files + upload button */}
            {mediaFiles.length > 0 && (
              <div className="mb-4 space-y-2">
                {mediaFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-surface-2/60 rounded-lg px-3 py-2">
                    <Film size={12} className="text-text-muted shrink-0" />
                    <span className="flex-1 truncate text-text-primary">{f.name}</span>
                    <span className="text-text-muted shrink-0">{fmtBytes(f.size)}</span>
                    {!uploadingMedia && (
                      <button onClick={(e) => { e.stopPropagation(); setMediaFiles((prev) => prev.filter((_, j) => j !== i)) }}>
                        <X size={12} className="text-text-muted hover:text-red-500" />
                      </button>
                    )}
                  </div>
                ))}
                {mediaUploadError && <p className="text-xs text-red-500">{mediaUploadError}</p>}
                <button
                  onClick={handleMediaUpload}
                  disabled={uploadingMedia}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {uploadingMedia
                    ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                    : <><Upload size={14} /> Upload {mediaFiles.length} file{mediaFiles.length !== 1 ? 's' : ''}</>
                  }
                </button>
              </div>
            )}

            {/* Existing uploads */}
            {loadingExtras ? (
              <Loader2 size={16} className="animate-spin text-text-muted" />
            ) : shootUploads.length === 0 ? (
              <p className="text-sm text-text-muted">No footage uploaded yet.</p>
            ) : (
              <div className="space-y-1">
                {shootUploads.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                      <Film size={14} className="text-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{f.file_name}</p>
                      <p className="text-xs text-text-muted">{fmtBytes(f.file_size)} · {new Date(f.created_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} EST</p>
                    </div>
                    {f.file_url && (
                      <button
                        onClick={() => forceDownload(f.file_url, f.file_name)}
                        className="text-text-muted hover:text-accent transition-colors shrink-0"
                        title="Download"
                      >
                        <Download size={13} />
                      </button>
                    )}
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
                    <div className="flex items-center gap-2 shrink-0">
                      {r.video_url && (
                        <button onClick={() => forceDownload(r.video_url, `revision-${r.revision_number}.mp4`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 transition-colors">
                          <Download size={12} /> Download
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/projects/${id}/revision/${r.id}`)}
                        className="btn-secondary flex items-center gap-1.5 text-xs"
                      >
                        <Eye size={13} /> View
                      </button>
                    </div>
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
