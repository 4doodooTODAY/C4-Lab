import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, X, Loader2, FolderKanban, Search, ChevronRight,
  CalendarDays, AlertCircle
} from 'lucide-react'
import { useProjects, createProject } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import { format, isAfter, addDays, isBefore, startOfDay } from 'date-fns'

// ── Constants ──────────────────────────────────────────────────────────────────
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

const STAGE_LABELS = {
  briefing:        'Briefing',
  pre_production:  'Pre-Production',
  production:      'Production',
  post_production: 'Post-Production',
  review:          'Review',
  revisions:       'Revisions',
  delivered:       'Delivered',
}

const STAGE_COLORS = {
  briefing:        'bg-slate-100 text-slate-600',
  pre_production:  'bg-blue-50 text-blue-600',
  production:      'bg-amber-50 text-amber-600',
  post_production: 'bg-purple-50 text-purple-600',
  review:          'bg-orange-50 text-orange-600',
  revisions:       'bg-red-50 text-red-600',
  delivered:       'bg-green-50 text-green-600',
}

const STAGE_DOT = {
  briefing:        'bg-slate-400',
  pre_production:  'bg-blue-500',
  production:      'bg-amber-500',
  post_production: 'bg-purple-500',
  review:          'bg-orange-500',
  revisions:       'bg-red-500',
  delivered:       'bg-green-500',
}

const PAYMENT_COLORS = {
  unpaid:       'bg-red-50 text-red-600',
  deposit_paid: 'bg-amber-50 text-amber-600',
  paid:         'bg-green-50 text-green-600',
}

const PAYMENT_LABELS = {
  unpaid:       'Unpaid',
  deposit_paid: 'Deposit Paid',
  paid:         'Paid',
}

const IN_CONTROL = {
  briefing:        'Admin',
  pre_production:  'Admin',
  production:      'Photographer / Videographer',
  post_production: 'Editor',
  review:          'Client',
  revisions:       'Client',
  delivered:       'Admin',
}

// ── New Project Modal ──────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const [clients, setClients]     = useState([])
  const [clientsLoaded, setCL]    = useState(false)
  const [form, setForm]           = useState({
    name: '', client_id: '',
  })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Load clients on mount
  useState(() => {
    supabase.from('clients').select('id, name, contact_name').order('name').then(({ data }) => {
      setClients(data || [])
      setCL(true)
    })
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        name:      form.name.trim(),
        client_id: form.client_id || null,
        stage:     'briefing',
        created_by: user?.id,
      }
      const row = await createProject(payload)
      onCreated(row.id)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">New Project</h2>
            <p className="text-xs text-text-muted mt-0.5">Fill in the details to create a project.</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Project Name *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Brand Campaign Q3"
              value={form.name}
              onChange={set('name')}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="label">Client</label>
            <select className="input" value={form.client_id} onChange={set('client_id')}>
              <option value="">— No client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.contact_name || c.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, onClick }) {
  const today  = startOfDay(new Date())
  const due    = project.due_date ? new Date(project.due_date) : null
  const isOD   = due && isBefore(due, today)
  const isSoon = due && !isOD && isBefore(due, addDays(today, 7))

  const members = project.project_members || []
  const visible = members.slice(0, 3)
  const overflow = members.length - 3

  const clientName = project.clients?.contact_name || project.clients?.name || '—'

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-border p-5 hover:shadow-md hover:border-border-strong transition-all cursor-pointer flex flex-col gap-3"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{project.name}</p>
          <p className="text-xs text-text-muted mt-0.5 truncate">{clientName}</p>
        </div>
        {project.type && (
          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[project.type] || 'bg-surface-2 text-text-muted'}`}>
            {TYPE_LABELS[project.type]}
          </span>
        )}
      </div>

      {/* Stage badge */}
      <div className="flex items-center gap-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${STAGE_DOT[project.stage] || 'bg-gray-400'}`} />
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[project.stage] || 'bg-surface-2 text-text-muted'}`}>
          {STAGE_LABELS[project.stage] || project.stage}
        </span>
      </div>

      {/* Due date + payment */}
      <div className="flex items-center justify-between gap-2">
        {due ? (
          <div className={`flex items-center gap-1 text-xs font-medium ${isOD ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-text-muted'}`}>
            {isOD && <AlertCircle size={11} />}
            <CalendarDays size={11} />
            {isOD ? 'Overdue · ' : ''}{format(due, 'MMM d')}
          </div>
        ) : (
          <span className="text-xs text-text-muted">No due date</span>
        )}
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PAYMENT_COLORS[project.payment_status] || 'bg-surface-2 text-text-muted'}`}>
          {PAYMENT_LABELS[project.payment_status] || project.payment_status}
        </span>
      </div>

      {/* Team avatars + in-control */}
      <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border">
        <div className="flex -space-x-1.5">
          {visible.map((m) => (
            <Avatar
              key={m.id}
              name={m.profiles?.full_name}
              url={m.profiles?.avatar_url}
              size={6}
              className="border-2 border-white"
            />
          ))}
          {overflow > 0 && (
            <div className="w-6 h-6 rounded-full bg-surface-3 border-2 border-white flex items-center justify-center text-[9px] font-semibold text-text-muted">
              +{overflow}
            </div>
          )}
          {members.length === 0 && (
            <span className="text-xs text-text-muted">No team</span>
          )}
        </div>
        <span className="text-[10px] text-text-muted truncate">{IN_CONTROL[project.stage] || '—'}</span>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Projects() {
  const navigate = useNavigate()
  const { projects, loading } = useProjects()
  const [showNew, setShowNew]   = useState(false)
  const [search, setSearch]     = useState('')
  const [filterType, setFT]     = useState('')
  const [filterStage, setFS]    = useState('')
  const [filterPayment, setFP]  = useState('')

  const today = startOfDay(new Date())
  const nextWeek = addDays(today, 7)

  // Stats
  const total       = projects.length
  const activeCount = projects.filter((p) => p.status === 'active').length
  const dueThisWeek = projects.filter((p) => {
    if (!p.due_date) return false
    const d = new Date(p.due_date)
    return !isBefore(d, today) && isBefore(d, nextWeek)
  }).length
  const unpaidCount = projects.filter((p) => p.payment_status === 'unpaid').length

  // Filter
  const filtered = projects.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType && p.type !== filterType) return false
    if (filterStage && p.stage !== filterStage) return false
    if (filterPayment && p.payment_status !== filterPayment) return false
    return true
  })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Projects</h1>
          <p className="text-sm text-text-secondary mt-0.5">{total} project{total !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> New Project
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total',        value: total,       color: 'text-text-primary' },
          { label: 'Active',       value: activeCount, color: 'text-green-600' },
          { label: 'Due This Week',value: dueThisWeek, color: 'text-amber-600' },
          { label: 'Unpaid',       value: unpaidCount, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-border p-4">
            <p className="text-xs text-text-muted mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            className="input pl-8"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={filterType} onChange={(e) => setFT(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input w-auto" value={filterStage} onChange={(e) => setFS(e.target.value)}>
          <option value="">All stages</option>
          {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input w-auto" value={filterPayment} onChange={(e) => setFP(e.target.value)}>
          <option value="">All payments</option>
          {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <FolderKanban size={36} className="mx-auto text-text-muted/30 mb-3" />
          <p className="text-sm font-semibold text-text-primary mb-1">
            {projects.length === 0 ? 'No projects yet' : 'No projects match your filters'}
          </p>
          <p className="text-sm text-text-muted">
            {projects.length === 0 ? 'Create your first project to get started.' : 'Try adjusting your search or filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
        </div>
      )}

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => navigate(`/projects/${id}`)}
        />
      )}
    </div>
  )
}
