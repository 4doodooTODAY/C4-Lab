import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Check, Trash2, X, Plus,
  CalendarDays, MessageSquare, Film, StickyNote,
  AlertCircle, MapPin, Upload, FileVideo, Eye,
  Camera, Scissors, Pencil, Download, PlayCircle, User,
  Sparkles, ThumbsUp, ThumbsDown, Link2 as LinkIcon, CheckSquare, Square,
} from 'lucide-react'
import { useProject, updateProject } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { notify, notifyAdmins } from '../../lib/notify'
import Avatar from '../../components/ui/Avatar'
import { format, parseISO } from 'date-fns'
import { fmtTime } from '../../lib/time'
import { forceDownload, downloadAll, uploadToR2, fmtBytes, fmtSpeed, fmtEta } from '../../lib/r2'

// ── Constants ─────────────────────────────────────────────────────────────────
const DISPLAY_STAGES = [
  { key: 'pitch',           label: 'Not Started' },
  { key: 'production',      label: 'In Progress' },
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
  production:      'In Progress',
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
  pre_production:  { who: 'admin',      label: 'Admin',          msg: 'Set up the project and assign the team.' },
  production:      { who: 'creative',   label: 'Creative',       msg: 'Upload footage and files for this project.' },
  post_production: { who: 'editor',     label: 'Editor',         msg: 'Upload the first cut — it goes to the creative for review first.' },
  review:          { who: 'varies',     label: 'Review Cycle',   msg: 'Creative → Client → Editor until approved.' },
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


// Same convention as the rest of the app: revision_number 1 is the first cut,
// and each later number is "Revision (n-1)" — so the client and admin agree.
function revisionLabel(n) {
  return n === 1 ? 'First Cut' : `Revision ${n}`
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

// ── Start Project Panel (admin) — replaces legacy "Pitch" stage ───────────────
function PitchApprovalPanel({ project, profile, onApproved }) {
  const [starting, setStarting] = useState(false)
  const [error,    setError]    = useState('')

  const handleStart = async () => {
    setStarting(true); setError('')
    try {
      await updateProject(project.id, { stage: 'pre_production' })
      // Notify client
      if (project.client_id) {
        const { data: c } = await supabase.from('clients').select('profile_id').eq('id', project.client_id).maybeSingle()
        if (c?.profile_id) {
          await notify({
            profileId: c.profile_id, actorId: profile.id, type: 'pitch_approved',
            title: `"${project.name}" is underway!`,
            body:  'Your project has been kicked off and work is beginning.',
            link:  `/my-projects`,
          })
        }
      }
      onApproved()
    } catch (err) {
      setError(err.message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={16} className="text-amber-600" />
        <h3 className="text-sm font-bold text-text-primary">Project Not Started</h3>
      </div>
      <p className="text-xs text-text-muted mb-4">
        This project is waiting to be kicked off. Click below to move it into Pre-Production and start the workflow.
      </p>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      <button
        onClick={handleStart}
        disabled={starting}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {starting ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
        Kick Off Project & Begin Pre-Production
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
    info.who === 'creative'  ? (creativeProfile?.full_name || 'Creative (unassigned)') :
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
  const { profile, isAdmin } = useAuth()

  const { project, loading, error: loadError, refetch } = useProject(id)

  // Notes
  const [notes, setNotes]               = useState('')
  const [notesSaving, setNS]            = useState(false)
  const [notesSaved, setNSaved]         = useState(false)

  // Team notes feed (shoot_notes) — visible to everyone but the client
  const [noteInput, setNoteInput]       = useState('')
  const [postingNote, setPostingNote]   = useState(false)

  // Inspiration links (optional, team-editable)
  const [inspoLinks, setInspoLinks]     = useState([])
  const [inspoInput, setInspoInput]     = useState('')
  const [savingInspo, setSavingInspo]   = useState(false)

  // Linked shoot
  const [shoots, setShoots]             = useState([])
  const [linkShoot, setLinkShoot]       = useState('')
  const [linkingShoot, setLinkingShoot] = useState(false)

  // Footage download (select + progress)
  const [selectedFiles, setSelectedFiles] = useState(() => new Set())
  const [downloading, setDownloading]      = useState(false)
  const [dlProgress, setDlProgress]        = useState({ done: 0, total: 0 })
  const [removingUploads, setRemovingUploads] = useState(false)

  // Status
  const [status, setStatus]             = useState('')


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

  // Direct project media upload
  const mediaInputRef = useRef(null)
  const [mediaFiles, setMediaFiles]           = useState([])
  const [uploadingMedia, setUploadingMedia]   = useState(false)
  const [mediaUploadError, setMediaUploadError] = useState('')
  const [mediaProgress, setMediaProgress]     = useState(0)
  const [mediaStats, setMediaStats]           = useState(null)   // { speed, eta, loaded, total, filesDone, filesTotal }
  const [mediaDragOver, setMediaDragOver]     = useState(false)

  // Admin-only extra revision upload (used when the 3 client revisions run out)
  const extraRevInputRef = useRef(null)
  const [extraRevFile, setExtraRevFile]         = useState(null)
  const [uploadingExtraRev, setUploadingExtraRev] = useState(false)
  const [addingRevSlot, setAddingRevSlot]       = useState(false)
  const [extraRevError, setExtraRevError]       = useState('')
  const [extraRevConvert, setExtraRevConvert]   = useState(null) // HEVC→H.264 transcode state

  // Assigned creative/editor profiles
  const [creativeProfile, setCreativeProfile] = useState(null)
  const [editorProfiles, setEditorProfiles]   = useState([])   // multiple editors

  // Inline assign state
  const [assignProfiles, setAssignProfiles]         = useState([])
  const [selectedCreative, setSelectedCreative]     = useState('')
  const [selectedEditor, setSelectedEditor]         = useState('')
  const [assigningCreative, setAssigningCreative]   = useState(false)
  const [assigningEditor, setAssigningEditor]       = useState(false)
  const [showCreativeSelect, setShowCreativeSelect] = useState(false)
  const [showEditorSelect, setShowEditorSelect]     = useState(false)
  const [removingEditor, setRemovingEditor]         = useState(null)

  useEffect(() => {
    if (project) {
      setNotes(project.notes || '')
      setStatus(project.status || 'active')
      setInspoLinks(project.inspiration_links || [])
    }
  }, [project])

  useEffect(() => {
    if (!id) return
    setLoadingExtras(true)
    const shootId = project?.shoot_id
    Promise.all([
      supabase.from('shoot_uploads').select('*, uploader:profiles!shoot_uploads_uploaded_by_fkey(id, full_name)').eq('project_id', id).order('created_at'),
      supabase.from('shoot_notes').select('*, poster:profiles!shoot_notes_profile_id_fkey(id, full_name, avatar_url), author:profiles!shoot_notes_author_id_fkey(id, full_name, avatar_url)').eq('project_id', id).order('created_at'),
      supabase.from('project_revisions').select('*, profiles(id, full_name)').eq('project_id', id).order('revision_number'),
      shootId
        ? supabase.from('shoot_uploads').select('*, uploader:profiles!shoot_uploads_uploaded_by_fkey(id, full_name)').eq('shoot_id', shootId).order('created_at')
        : Promise.resolve({ data: [] }),
    ]).then(([uploads, notes, revs, shootFootage]) => {
      // Merge project uploads + linked-shoot footage, de-duplicating by id
      const merged = [...(uploads.data || []), ...(shootFootage.data || [])]
      const seen = new Set()
      setShootUploads(merged.filter((f) => (seen.has(f.id) ? false : seen.add(f.id))))
      setShootNotes(notes.data || [])
      setRevisions(revs.data || [])
      setLoadingExtras(false)
    })
  }, [id, project?.shoot_id])

  useEffect(() => {
    if (!project) return
    if (project.creative_id) {
      supabase.from('profiles').select('id, full_name, avatar_url').eq('id', project.creative_id).single()
        .then(({ data }) => setCreativeProfile(data))
    } else {
      setCreativeProfile(null)
    }
    // Fetch all editors from junction table
    supabase
      .from('project_editors')
      .select('profile_id, profiles(id, full_name, avatar_url)')
      .eq('project_id', project.id)
      .then(({ data }) => setEditorProfiles((data || []).map((r) => r.profiles).filter(Boolean)))
  }, [project])

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('profiles').select('id, full_name, role').in('role', ['creative', 'editor', 'admin']).order('full_name')
      .then(({ data }) => setAssignProfiles(data || []))
  }, [isAdmin])

  // Shoots for this client (for the Linked Shoot selector)
  useEffect(() => {
    const clientId = project?.client_id || project?.clients?.id
    if (!clientId) { setShoots([]); return }
    supabase
      .from('shoots')
      .select('id, title, shoot_date')
      .eq('client_id', clientId)
      .order('shoot_date', { ascending: false, nullsFirst: false })
      .then(({ data }) => setShoots(data || []))
  }, [project?.client_id, project?.clients?.id])

  useEffect(() => { setLinkShoot(project?.shoot_id || '') }, [project?.shoot_id])

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
      // Upsert into junction table
      await supabase.from('project_editors').upsert({ project_id: id, profile_id: selectedEditor })
      // Keep editor_id in sync (use first editor as primary for backward compat)
      if (editorProfiles.length === 0) {
        await updateProject(id, { editor_id: selectedEditor })
      }
      // Update local state
      const { data: prof } = await supabase.from('profiles').select('id, full_name, avatar_url').eq('id', selectedEditor).single()
      if (prof) setEditorProfiles((prev) => prev.some((p) => p.id === prof.id) ? prev : [...prev, prof])
      setShowEditorSelect(false)
      setSelectedEditor('')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setAssigningEditor(false)
    }
  }

  const handleRemoveEditor = async (profileId) => {
    setRemovingEditor(profileId)
    try {
      await supabase.from('project_editors').delete().eq('project_id', id).eq('profile_id', profileId)
      const remaining = editorProfiles.filter((p) => p.id !== profileId)
      setEditorProfiles(remaining)
      // Update editor_id to next remaining editor or null
      await updateProject(id, { editor_id: remaining[0]?.id || null })
    } catch (err) {
      setActionError(err.message)
    } finally {
      setRemovingEditor(null)
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

  const handlePostNote = async () => {
    const content = noteInput.trim()
    if (!content) return
    setPostingNote(true)
    try {
      const { data, error } = await supabase
        .from('shoot_notes')
        .insert({ project_id: id, profile_id: profile?.id, content })
        .select('id, content, created_at, profile_id')
      if (error) throw new Error(error.message)
      const row = data?.[0]
      if (row) {
        setShootNotes((prev) => [...prev, {
          ...row,
          poster: { id: profile?.id, full_name: profile?.full_name, avatar_url: profile?.avatar_url },
        }])
      }
      setNoteInput('')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setPostingNote(false)
    }
  }

  const saveInspoLinks = async (next) => {
    setSavingInspo(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .update({ inspiration_links: next })
        .eq('id', id)
        .select('inspiration_links')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error("You don't have permission to edit inspiration links.")
      setInspoLinks(data[0].inspiration_links || next)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setSavingInspo(false)
    }
  }

  const addInspoLink = async () => {
    let url = inspoInput.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    setInspoInput('')
    await saveInspoLinks([...inspoLinks, url])
  }

  const removeInspoLink = async (idx) => {
    await saveInspoLinks(inspoLinks.filter((_, i) => i !== idx))
  }

  const handleLinkShoot = async () => {
    setLinkingShoot(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .update({ shoot_id: linkShoot || null })
        .eq('id', id)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error("You don't have permission to link a shoot to this project.")
      await refetch()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setLinkingShoot(false)
    }
  }

  const toggleFileSelected = (fileId) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      next.has(fileId) ? next.delete(fileId) : next.add(fileId)
      return next
    })
  }

  const downloadList = async (files) => {
    const list = files.filter((f) => f.file_url)
    if (!list.length) return
    setDownloading(true)
    setDlProgress({ done: 0, total: list.length })
    // Concurrent pool instead of one-at-a-time with sleep gaps — much faster.
    await downloadAll(list, {
      concurrency: 4,
      onProgress: (done, total) => setDlProgress({ done, total }),
    })
    setDownloading(false)
  }

  // Admin/creative/editor/team_lead can remove uploaded footage at any time.
  const canRemoveUploads = ['admin', 'creative', 'editor', 'team_lead'].includes(profile?.role)

  const removeUploads = async (files) => {
    const list = (files || []).filter(Boolean)
    if (!list.length) return
    const names = list.length === 1 ? `"${list[0].file_name}"` : `${list.length} files`
    if (!window.confirm(`Are you sure you want to remove ${names}? This can't be undone.`)) return
    const ids = list.map((f) => f.id)
    setRemovingUploads(true)
    const { data, error } = await supabase
      .from('shoot_uploads')
      .delete()
      .in('id', ids)
      .select('id')
    setRemovingUploads(false)
    if (error) {
      window.alert(error.message || "Couldn't remove the file(s).")
      return
    }
    const removed = new Set((data || []).map((d) => d.id))
    if (!removed.size) {
      window.alert("You don't have permission to remove these files.")
      return
    }
    setShootUploads((prev) => prev.filter((f) => !removed.has(f.id)))
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      removed.forEach((rid) => next.delete(rid))
      return next
    })
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
    setMediaProgress(0)
    setMediaStats(null)
    try {
      const files      = [...mediaFiles]
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
      const loadedPer  = new Array(files.length).fill(0)
      let   filesDone  = 0

      const report = (speed, eta) => {
        const loaded = loadedPer.reduce((a, b) => a + b, 0)
        const pct    = totalBytes > 0 ? Math.round((loaded / totalBytes) * 100) : 0
        setMediaProgress(pct)
        setMediaStats({ speed, eta, loaded, total: totalBytes, filesDone, filesTotal: files.length })
      }

      const results = await Promise.all(files.map((file, i) =>
        uploadToR2({
          file,
          category:    'footage',
          clientName:  project.clients?.name || project.clients?.contact_name || 'client',
          projectName: project.name,
          folderType:  'projects',
          onStats: (s) => { loadedPer[i] = s.loaded || 0; report(s.speed, s.eta) },
        }).then((r) => { filesDone++; report(0, null); return { file, publicUrl: r.publicUrl } })
      ))

      for (const { file, publicUrl } of results) {
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
      const { data } = await supabase.from('shoot_uploads').select('*, uploader:profiles!shoot_uploads_uploaded_by_fkey(id, full_name)').eq('project_id', id).order('created_at')
      setShootUploads(data || [])
      setMediaFiles([])
    } catch (err) {
      setMediaUploadError(err.message)
    } finally {
      setUploadingMedia(false)
      setMediaProgress(0)
      setMediaStats(null)
    }
  }

  // Admin adds an extra revision the client can review — for when the 3
  // standard revisions are used up but another cut still needs to go out.
  const reloadRevisions = async () => {
    const { data } = await supabase
      .from('project_revisions')
      .select('*, profiles(id, full_name)')
      .eq('project_id', id)
      .order('revision_number')
    setRevisions(data || [])
  }

  // Step 1: admin opens a new empty revision slot. No video yet — the editor
  // (or admin) fills it in through the normal upload flow. It just becomes the
  // next revision number.
  const handleAddRevisionSlot = async () => {
    setAddingRevSlot(true)
    setExtraRevError('')
    try {
      const latestRev = [...revisions].sort((a, b) => b.revision_number - a.revision_number)[0]
      const nextRevNum = latestRev ? latestRev.revision_number + 1 : 1
      const { error: insErr } = await supabase.from('project_revisions').insert({
        project_id:      id,
        revision_number: nextRevNum,
        status:          'pending_editor',
        uploaded_by:     profile.id,
      })
      if (insErr) throw new Error(insErr.message)
      // Put the project back into review so the editor's upload flow opens up
      await updateProject(id, { stage: 'review' })
      await reloadRevisions()
      refetch()
    } catch (err) {
      setExtraRevError(err.message)
    } finally {
      setAddingRevSlot(false)
    }
  }

  // Step 2 (admin can also do this instead of the editor): upload the video
  // into the open slot. It then goes to the client like any other revision.
  const handleFillRevisionSlot = async (slot) => {
    if (!extraRevFile) return
    setUploadingExtraRev(true)
    setExtraRevError('')
    try {
      const { publicUrl } = await uploadToR2({
        file:        extraRevFile,
        category:    'revisions',
        clientName:  project.clients?.name || project.clients?.contact_name || 'client',
        projectName: project.name,
        folderType:  'projects',
      })
      const { error: updErr } = await supabase.from('project_revisions')
        .update({ video_url: publicUrl, status: 'pending_client_review', uploaded_by: profile.id })
        .eq('id', slot.id)
        .select('id')
      if (updErr) throw new Error(updErr.message)
      await updateProject(id, { stage: 'review' })
      await reloadRevisions()
      setExtraRevFile(null)
      refetch()
    } catch (err) {
      setExtraRevError(err.message)
    } finally {
      setUploadingExtraRev(false)
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
        editorProfile={editorProfiles[0] || null}
        creativeProfile={creativeProfile}
        onBeginProject={handleBeginProject}
        isAdmin={isAdmin}
      />

      {/* ── Editor action CTA — visible when it's the editor's turn ─── */}
      {(() => {
        const isCurrentUserEditor =
          profile?.role === 'editor' ||
          editorProfiles.some((ep) => ep.id === profile?.id) ||
          project.editor_id === profile?.id
        const isCurrentUserCreative =
          profile?.role === 'creative' ||
          project.creative_id === profile?.id

        const stage = project.stage
        const latestRev = [...revisions].sort((a, b) => b.revision_number - a.revision_number)[0]
        const needsEditorUpload =
          (stage === 'post_production' || stage === 'production') &&
          (!latestRev || latestRev.status === 'pending_editor')
        const needsCreativeReview =
          latestRev?.status === 'pending_photographer_review' ||
          latestRev?.status === 'pending_creative_review'

        if (isCurrentUserEditor && needsEditorUpload) {
          const isFirstCut = !latestRev || revisions.length === 0
          return (
            <div className="mb-6 rounded-2xl border-2 border-accent/30 bg-accent/5 p-5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <FileVideo size={20} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">
                    {isFirstCut ? "It's your turn — upload the first cut" : "Upload your revised cut"}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {isFirstCut
                      ? 'Edit the footage and upload your initial cut. It goes to the creative for review before the client sees it.'
                      : 'Address the client feedback and upload your revised version.'}
                  </p>
                </div>
              </div>
              <Link
                to={`/projects/${id}/creative`}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-colors shadow-sm whitespace-nowrap"
              >
                <Upload size={15} /> {isFirstCut ? 'Upload First Cut →' : 'Upload Revision →'}
              </Link>
            </div>
          )
        }

        if (isCurrentUserCreative && needsCreativeReview && latestRev) {
          return (
            <div className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <Eye size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-900">Review the edit before the client sees it</p>
                  <p className="text-xs text-amber-700 mt-0.5">The editor submitted a cut. Leave timeline notes, then pass it to the client.</p>
                </div>
              </div>
              <Link
                to={`/projects/${id}/creative`}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm whitespace-nowrap"
              >
                <Eye size={15} /> Review Now →
              </Link>
            </div>
          )
        }

        return null
      })()}

      {/* ── Pitch Approval Panel (admin can approve or push to client) ───── */}
      {project.stage === 'pitch' && isAdmin && (
        <PitchApprovalPanel
          project={project}
          profile={profile}
          onApproved={() => { refetch() }}
          onRefresh={refetch}
        />
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

      </div>

      {/* Assigned Team */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-6">
        <p className="text-xs font-semibold text-text-muted mb-4 uppercase tracking-wide">Assigned Team</p>
        <div className="space-y-4">

          <div className="border-t border-border" />

          {/* Editor row — multiple editors */}
          <div className="flex gap-3">
            <div className="w-6 flex items-center justify-center shrink-0 mt-1">
              <Scissors size={13} className="text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-muted">Editor{editorProfiles.length !== 1 ? 's' : ''}</span>
                {isAdmin && !showEditorSelect && (
                  <button
                    onClick={() => { setShowEditorSelect(true); setSelectedEditor('') }}
                    className="text-[11px] text-accent hover:text-accent/80 font-medium flex items-center gap-0.5"
                  >
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
              {editorProfiles.length === 0 ? (
                <button
                  onClick={() => isAdmin && setShowEditorSelect(true)}
                  className={`text-sm ${isAdmin ? 'text-text-muted/60 italic hover:text-accent transition-colors cursor-pointer' : 'text-text-muted/60 italic'}`}
                >
                  Unassigned — {isAdmin ? 'click to assign' : 'not yet assigned'}
                </button>
              ) : (
                <div className="space-y-1.5">
                  {editorProfiles.map((ep) => (
                    <div key={ep.id} className="flex items-center gap-2">
                      <Avatar name={ep.full_name} url={ep.avatar_url} size={7} />
                      <p className="text-sm font-medium text-text-primary flex-1">{ep.full_name}</p>
                      {isAdmin && (
                        <button
                          onClick={() => handleRemoveEditor(ep.id)}
                          disabled={removingEditor === ep.id}
                          className="text-text-muted hover:text-red-500 transition-colors"
                        >
                          {removingEditor === ep.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isAdmin && showEditorSelect && (
                <div className="flex items-center gap-2 mt-2">
                  <select
                    className="input flex-1 text-sm"
                    value={selectedEditor}
                    onChange={(e) => setSelectedEditor(e.target.value)}
                  >
                    <option value="">— Select editor —</option>
                    {assignProfiles
                      .filter((p) => !editorProfiles.some((ep) => ep.id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name}{p.role === 'admin' ? ' (admin)' : ''}</option>
                      ))}
                  </select>
                  <button
                    onClick={handleAssignEditor}
                    disabled={!selectedEditor || assigningEditor}
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 shrink-0"
                  >
                    {assigningEditor ? <Loader2 size={12} className="animate-spin" /> : null}
                    Add
                  </button>
                  <button onClick={() => setShowEditorSelect(false)} className="btn-ghost p-1.5 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left (wider) */}
        <div className="lg:col-span-2 space-y-5">

          {/* Linked Shoot — pulls that shoot's footage into this project */}
          <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <LinkIcon size={14} className="text-text-muted" /> Linked Shoot
            </h2>
            <p className="text-xs text-text-muted -mt-0.5">Link a shoot to automatically pull its footage into this project. Optional.</p>
            {shoots.length === 0 ? (
              <p className="text-xs text-text-muted italic">No shoots exist for this client yet.</p>
            ) : (
              <div className="flex gap-2">
                <select className="input flex-1 text-sm" value={linkShoot} disabled={linkingShoot}
                  onChange={(e) => setLinkShoot(e.target.value)}>
                  <option value="">— Not linked to a shoot —</option>
                  {shoots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}{s.shoot_date ? ` · ${format(parseISO(s.shoot_date), 'MMM d, yyyy')}` : ''}
                    </option>
                  ))}
                </select>
                <button onClick={handleLinkShoot} disabled={linkingShoot || linkShoot === (project.shoot_id || '')}
                  className="btn-primary flex items-center gap-1.5 text-sm shrink-0 disabled:opacity-40">
                  {linkingShoot ? <Loader2 size={13} className="animate-spin" /> : <LinkIcon size={13} />}
                  {linkShoot === (project.shoot_id || '') && project.shoot_id ? 'Linked' : 'Link'}
                </button>
              </div>
            )}
          </div>

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
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleMediaUpload}
                    disabled={uploadingMedia}
                    className="btn-primary flex items-center gap-2 shrink-0 disabled:opacity-50"
                  >
                    {uploadingMedia
                      ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                      : <><Upload size={14} /> Upload {mediaFiles.length} file{mediaFiles.length !== 1 ? 's' : ''}</>
                    }
                  </button>
                  {uploadingMedia && mediaStats && (
                    <div className="text-xs text-text-muted flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text-primary">{mediaStats.filesDone}/{mediaStats.filesTotal} files</span>
                      <span className="text-text-muted/40">·</span>
                      <span>{fmtBytes(mediaStats.loaded)} / {fmtBytes(mediaStats.total)}</span>
                      {mediaStats.speed > 0 && <>
                        <span className="text-text-muted/40">·</span>
                        <span className="font-medium text-text-secondary">{fmtSpeed(mediaStats.speed)}</span>
                      </>}
                      {mediaStats.eta != null && mediaStats.eta > 1 && <>
                        <span className="text-text-muted/40">·</span>
                        <span className="font-semibold text-accent">{fmtEta(mediaStats.eta)}</span>
                      </>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Existing uploads */}
            {loadingExtras ? (
              <Loader2 size={16} className="animate-spin text-text-muted" />
            ) : shootUploads.length === 0 ? (
              <p className="text-sm text-text-muted">No footage uploaded yet.</p>
            ) : (
              <div>
                {/* Download toolbar */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <button
                    onClick={() => {
                      const allIds = shootUploads.filter((f) => f.file_url).map((f) => f.id)
                      const allSelected = allIds.every((x) => selectedFiles.has(x))
                      setSelectedFiles(allSelected ? new Set() : new Set(allIds))
                    }}
                    className="text-xs flex items-center gap-1.5 text-text-secondary hover:text-text-primary">
                    {shootUploads.filter((f) => f.file_url).every((f) => selectedFiles.has(f.id)) && shootUploads.some((f) => f.file_url)
                      ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
                    Select all
                  </button>
                  <div className="flex-1" />
                  {selectedFiles.size > 0 && (
                    <button
                      onClick={() => downloadList(shootUploads.filter((f) => selectedFiles.has(f.id)))}
                      disabled={downloading}
                      className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50">
                      <Download size={12} /> Download Selected ({selectedFiles.size})
                    </button>
                  )}
                  {canRemoveUploads && selectedFiles.size > 0 && (
                    <button
                      onClick={() => removeUploads(shootUploads.filter((f) => selectedFiles.has(f.id)))}
                      disabled={removingUploads}
                      className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                      {removingUploads ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                      Remove Selected ({selectedFiles.size})
                    </button>
                  )}
                  <button
                    onClick={() => downloadList(shootUploads)}
                    disabled={downloading}
                    className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50">
                    {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Download All
                  </button>
                </div>

                {/* Progress bar */}
                {downloading && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                      <span>Downloading…</span>
                      <span>{dlProgress.done} / {dlProgress.total}</span>
                    </div>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-accent transition-all"
                        style={{ width: `${dlProgress.total ? (dlProgress.done / dlProgress.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  {shootUploads.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      {f.file_url && (
                        <button onClick={() => toggleFileSelected(f.id)} className="shrink-0" title="Select">
                          {selectedFiles.has(f.id) ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} className="text-text-muted" />}
                        </button>
                      )}
                      <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                        <Film size={14} className="text-text-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{f.file_name}</p>
                        <p className="text-xs text-text-muted">{fmtBytes(f.file_size)} · {new Date(f.created_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} EST</p>
                        {f.uploader?.full_name && (
                          <p className="text-xs text-text-muted truncate">Uploaded by {f.uploader.full_name}</p>
                        )}
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
                      {canRemoveUploads && (
                        <button
                          onClick={() => removeUploads([f])}
                          disabled={removingUploads}
                          className="text-text-muted hover:text-red-600 transition-colors shrink-0 disabled:opacity-40"
                          title="Remove file"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Team Notes — visible to everyone but the client */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <StickyNote size={14} className="text-text-muted" /> Notes
              </h2>
              <span className="text-xs text-text-muted">Visible to your team · not the client</span>
            </div>
            <p className="text-xs text-text-muted mb-4">Shoot notes, context and reminders for everyone working on this project.</p>
            {loadingExtras ? (
              <Loader2 size={16} className="animate-spin text-text-muted" />
            ) : shootNotes.length === 0 ? (
              <p className="text-sm text-text-muted mb-4">No notes yet.</p>
            ) : (
              <div className="space-y-4 mb-4">
                {shootNotes.map((n) => {
                  const who = n.poster || n.author
                  return (
                  <div key={n.id} className="bg-surface-2 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar name={who?.full_name} url={who?.avatar_url} size={6} />
                      <p className="text-xs font-medium text-text-primary">{who?.full_name || 'Unknown'}</p>
                      <span className="text-xs text-text-muted">{format(new Date(n.created_at), 'MMM d, yyyy')}</span>
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{n.content}</p>
                  </div>
                  )
                })}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                className="input flex-1 min-h-[44px] resize-y text-sm"
                placeholder="Add a note for the team…"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePostNote() }}
              />
              <button
                onClick={handlePostNote}
                disabled={!noteInput.trim() || postingNote}
                className="btn-primary flex items-center gap-1.5 disabled:opacity-50 shrink-0">
                {postingNote ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
              </button>
            </div>
          </div>

          {/* Inspiration Links (optional) */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Sparkles size={14} className="text-text-muted" /> Inspiration Links
              </h2>
              <span className="text-xs text-text-muted">Optional</span>
            </div>
            <p className="text-xs text-text-muted mb-4">References, examples or moodboards for this project.</p>
            {inspoLinks.length === 0 ? (
              <p className="text-sm text-text-muted mb-4">No inspiration links yet.</p>
            ) : (
              <div className="space-y-1.5 mb-4">
                {inspoLinks.map((url, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-surface-2/60 rounded-xl">
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-accent hover:underline truncate flex-1">{url}</a>
                    <button onClick={() => removeInspoLink(i)} disabled={savingInspo}
                      className="p-1 text-text-muted hover:text-red-600 rounded-md hover:bg-red-50 disabled:opacity-40 shrink-0"
                      title="Remove link">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="url"
                className="input flex-1 text-sm"
                placeholder="Paste a link (e.g. youtube.com/…)"
                value={inspoInput}
                onChange={(e) => setInspoInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addInspoLink() }}
              />
              <button onClick={addInspoLink} disabled={!inspoInput.trim() || savingInspo}
                className="btn-secondary flex items-center gap-1.5 disabled:opacity-50 shrink-0">
                {savingInspo ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
              </button>
            </div>
          </div>

          {/* Revisions */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                {project?.media_type === 'photo' ? <Camera size={14} className="text-text-muted" /> : <FileVideo size={14} className="text-text-muted" />} Revisions
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
                      {project?.media_type === 'photo' ? <Camera size={16} className="text-text-muted" /> : <FileVideo size={16} className="text-text-muted" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary">{revisionLabel(r.revision_number)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${REVISION_STATUS_COLORS[r.status] || 'bg-surface-2 text-text-muted'}`}>
                          {REVISION_STATUS_LABELS[r.status] || r.status}
                        </span>
                        <span className="text-xs text-text-muted">{format(new Date(r.created_at), 'MMM d, yyyy')}</span>
                      </div>
                      {r.profiles?.full_name && (
                        <p className="text-xs text-text-muted mt-0.5">Uploaded by {r.profiles.full_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.video_url && (
                        <button onClick={() => forceDownload(r.video_url, `revision-${r.revision_number}.mp4`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 transition-colors">
                          <Download size={12} /> Download
                        </button>
                      )}
                      <button
                        onClick={() => navigate(
                          project?.media_type === 'photo'
                            ? `/projects/${id}/photo-revision/${r.id}`
                            : `/projects/${id}/revision/${r.id}`
                        )}
                        className="btn-secondary flex items-center gap-1.5 text-xs"
                      >
                        <Eye size={13} /> View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Admin-only: add an extra revision once the 3 client revisions are used up */}
            {(() => {
              const latestRev = [...revisions].sort((a, b) => b.revision_number - a.revision_number)[0]
              // An open slot = a revision the admin created that still needs a video.
              const openSlot = latestRev && latestRev.status === 'pending_editor' && !latestRev.video_url
                ? latestRev : null
              const revisionsComplete = latestRev && (
                latestRev.status === 'approved' ||
                latestRev.revision_number >= 3 ||
                ['ready_to_post', 'delivered'].includes(project.stage)
              )
              if (!openSlot && !revisionsComplete) return null
              const nextRevNum = latestRev.revision_number + 1
              return (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    <Plus size={12} /> Extra revision <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">Admin only</span>
                  </p>

                  {openSlot ? (
                    <>
                      <p className="text-xs text-text-muted mt-1 mb-2">
                        {revisionLabel(openSlot.revision_number)} is open. You or the editor can upload the video — it goes straight to the client.
                      </p>
                      <input
                        ref={extraRevInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => setExtraRevFile(e.target.files?.[0] || null)}
                      />
                      {extraRevFile ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-primary truncate flex-1">{extraRevFile.name}</span>
                          <button
                            onClick={() => handleFillRevisionSlot(openSlot)}
                            disabled={uploadingExtraRev}
                            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-60"
                          >
                            {uploadingExtraRev ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            {uploadingExtraRev ? (extraRevConvert ? 'Optimizing video…' : 'Uploading…') : 'Upload for client'}
                          </button>
                          {!uploadingExtraRev && (
                            <button onClick={() => setExtraRevFile(null)} className="text-xs text-text-muted hover:text-text-primary">Cancel</button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => extraRevInputRef.current?.click()}
                          className="btn-secondary text-xs flex items-center gap-1.5"
                        >
                          <Upload size={12} /> Upload {project?.media_type === 'photo' ? 'photo' : 'video'}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-text-muted mt-1 mb-2">
                        The client's 3 revisions are used up. Open {revisionLabel(nextRevNum)} — then you or the editor can upload the cut for the client.
                      </p>
                      <button
                        onClick={handleAddRevisionSlot}
                        disabled={addingRevSlot}
                        className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {addingRevSlot ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        {addingRevSlot ? 'Adding…' : `Add ${revisionLabel(nextRevNum)}`}
                      </button>
                    </>
                  )}
                  {extraRevError && <p className="text-xs text-red-500 mt-2">{extraRevError}</p>}
                </div>
              )
            })()}
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
              {project?.media_type !== 'photo' && (
                <Link
                  to={project.clients?.id ? `/videos?client=${project.clients.id}` : '/videos'}
                  className="flex items-center gap-2 text-sm text-accent hover:underline"
                >
                  <Film size={14} /> Video Review
                </Link>
              )}
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
