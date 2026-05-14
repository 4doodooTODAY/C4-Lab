import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Check, Trash2, X, Plus, UserMinus,
  CalendarDays, DollarSign, MessageSquare, Film, StickyNote,
  AlertCircle, Clock
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
  { key: 'briefing',        label: 'Briefing' },
  { key: 'pre_production',  label: 'Pre-Production' },
  { key: 'production',      label: 'Production' },
  { key: 'post_production', label: 'Post-Production' },
  { key: 'review',          label: 'Review' },
  { key: 'revisions',       label: 'Revisions' },
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

// Who has control at each stage
const IN_CONTROL_LABEL = {
  briefing:        { label: 'Admin', role: 'admin' },
  pre_production:  { label: 'Admin', role: 'admin' },
  production:      { label: 'Photographer / Videographer', role: 'photographer' },
  post_production: { label: 'Editor', role: 'editor' },
  review:          { label: 'Client', role: null },
  revisions:       { label: 'Client', role: null },
  delivered:       { label: 'Admin', role: 'admin' },
}

function fmt$(n) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
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

// ── Stage Progress Bar ────────────────────────────────────────────────────────
function StageBar({ currentStage, isAdmin, onStageClick }) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage)
  return (
    <div className="bg-white rounded-2xl border border-border p-5 mb-6">
      <p className="text-xs font-semibold text-text-muted mb-3 uppercase tracking-wide">Stage Progress</p>
      <div className="flex items-center gap-0">
        {STAGES.map((s, i) => {
          const isCurrent = i === currentIdx
          const isPast    = i < currentIdx
          const isFuture  = i > currentIdx
          return (
            <div key={s.key} className="flex-1 flex flex-col items-center gap-1.5">
              {/* Connector line before */}
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
                {i < STAGES.length - 1 && (
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

// ── In Control Banner ─────────────────────────────────────────────────────────
function InControlBanner({ stage, members }) {
  const ctrl   = IN_CONTROL_LABEL[stage] || { label: 'Admin', role: 'admin' }
  const person = ctrl.role
    ? members.find((m) => m.role === ctrl.role || m.profiles?.role === ctrl.role)
    : null

  return (
    <div className="bg-accent/5 border border-accent/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
      {person ? (
        <Avatar name={person.profiles?.full_name} url={person.profiles?.avatar_url} size={9} />
      ) : (
        <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center">
          <span className="text-accent font-bold text-sm">C4</span>
        </div>
      )}
      <div>
        <p className="text-xs text-text-muted">Currently in control</p>
        <p className="text-sm font-semibold text-text-primary">
          {person ? person.profiles?.full_name : ctrl.label}
        </p>
        {person && (
          <p className="text-xs text-text-muted capitalize">{MEMBER_ROLE_LABELS[person.role] || person.role}</p>
        )}
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

  // Inline edit state
  const [editingName, setEditingName]   = useState(false)
  const [nameDraft, setNameDraft]       = useState('')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)

  // Notes
  const [notes, setNotes]               = useState('')
  const [notesSaving, setNS]            = useState(false)
  const [notesSaved, setNSaved]         = useState(false)

  // Payment
  const [payStatus, setPayStatus]       = useState('')
  const [paidAmount, setPaidAmount]     = useState('')
  const [paymentSaving, setPaySaving]   = useState(false)
  const [paymentSaved, setPaySaved]     = useState(false)

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

  useEffect(() => {
    if (project) {
      setNameDraft(project.name || '')
      setNotes(project.notes || '')
      setPayStatus(project.payment_status || 'unpaid')
      setPaidAmount(project.paid_amount ?? '')
      setStatus(project.status || 'active')
    }
  }, [project])

  // ── Helpers ──
  const save = async (data) => {
    setSaving(true)
    try {
      await updateProject(id, data)
      refetch()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleNameSave = async () => {
    if (!nameDraft.trim()) return
    setEditingName(false)
    await save({ name: nameDraft.trim() })
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

  const handleSavePayment = async () => {
    setPaySaving(true)
    try {
      await updateProject(id, {
        payment_status: payStatus,
        paid_amount: paidAmount !== '' ? Number(paidAmount) : 0,
      })
      refetch()
      setPaySaved(true)
      setTimeout(() => setPaySaved(false), 2500)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setPaySaving(false)
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

  // ── Loading / error ──
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
  const isOD      = dueDate && isBefore(dueDate, today)
  const daysLeft  = dueDate ? differenceInDays(dueDate, today) : null
  const budget    = project.budget ?? null
  const paid      = Number(paidAmount) || 0
  const remaining = budget != null ? budget - paid : null

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-5 transition-colors">
        <ArrowLeft size={14} /> Back to Projects
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  className="input text-xl font-bold flex-1"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false) }}
                  autoFocus
                />
                <button onClick={handleNameSave} className="btn-primary flex items-center gap-1">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                </button>
                <button onClick={() => setEditingName(false)} className="btn-secondary">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => isAdmin && setEditingName(true)}
                className={`text-2xl font-bold text-text-primary text-left block ${isAdmin ? 'hover:text-accent transition-colors cursor-pointer' : 'cursor-default'}`}
                title={isAdmin ? 'Click to edit' : undefined}
              >
                {project.name}
              </button>
            )}
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
        </div>
      </div>

      {actionError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{actionError}</div>
      )}

      {/* Stage progress */}
      {isAdmin ? (
        <StageBar currentStage={project.stage} isAdmin={true} onStageClick={handleStageClick} />
      ) : (
        <StageBar currentStage={project.stage} isAdmin={false} onStageClick={() => {}} />
      )}

      {/* In control banner */}
      <InControlBanner stage={project.stage} members={members} />

      {/* 4-col info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><CalendarDays size={11} /> Start Date</p>
          <p className="text-sm font-semibold text-text-primary">
            {startDate ? format(startDate, 'MMM d, yyyy') : '—'}
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
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><DollarSign size={11} /> Budget</p>
          <p className="text-sm font-semibold text-text-primary">{fmt$(budget)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><DollarSign size={11} /> Paid</p>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">{fmt$(project.paid_amount)}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PAYMENT_COLORS[project.payment_status] || ''}`}>
              {PAYMENT_LABELS[project.payment_status]}
            </span>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left (wider) */}
        <div className="lg:col-span-2 space-y-5">
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

          {/* Notes card */}
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
          {/* Payment card */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-border p-5">
              <h2 className="text-sm font-semibold text-text-primary mb-4">Payment</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Budget</span>
                  <span className="font-semibold text-text-primary">{fmt$(budget)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Paid</span>
                  <span className="font-semibold text-green-600">{fmt$(paid)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="text-text-muted">Remaining</span>
                  <span className={`font-semibold ${remaining != null && remaining > 0 ? 'text-red-600' : 'text-text-primary'}`}>
                    {remaining != null ? fmt$(remaining) : '—'}
                  </span>
                </div>
                <div>
                  <label className="label">Payment Status</label>
                  <select className="input" value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
                    <option value="unpaid">Unpaid</option>
                    <option value="deposit_paid">Deposit Paid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div>
                  <label className="label">Paid Amount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleSavePayment}
                  disabled={paymentSaving}
                  className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {paymentSaving ? <Loader2 size={13} className="animate-spin" /> : paymentSaved ? <Check size={13} /> : null}
                  {paymentSaved ? 'Saved!' : 'Update Payment'}
                </button>
              </div>
            </div>
          )}

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
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      {isAdmin && (
        <div className="mt-6 bg-white rounded-2xl border border-red-100 p-5">
          <h2 className="text-sm font-semibold text-red-600 mb-4">Danger Zone</h2>
          <div className="space-y-3">
            {/* Archive */}
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

            {/* Delete */}
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
    </div>
  )
}
