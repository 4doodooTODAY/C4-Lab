import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Building2, Users2, CalendarDays, FolderKanban,
  Inbox, Plus, X, Loader2, Edit2, MapPin, Clock, Check,
  Camera, Film, ExternalLink, Trash2, ChevronRight, AlertCircle,
  Link as LinkIcon, FileText, LayoutList,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Avatar from '../../components/ui/Avatar'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { useClientCreatives, assignCreative, removeCreativeAssignment } from '../../hooks/useClientCreatives'
import { useShoots, createShoot, updateShoot } from '../../hooks/useShoots'
import { useContentDrafts, createDraft, updateDraft } from '../../hooks/useContentDrafts'

// ── Helpers ────────────────────────────────────────────────────────────────────
const DRAFT_TYPE_LABELS = {
  post: 'Post', reel: 'Reel', story: 'Story', carousel: 'Carousel', other: 'Other',
}
const DRAFT_STATUS_COLORS = {
  pending_client: 'bg-amber-50 text-amber-700 border-amber-200',
  approved:       'bg-green-50 text-green-700 border-green-200',
  declined:       'bg-red-50 text-red-700 border-red-200',
  scrapped:       'bg-gray-100 text-gray-500 border-gray-200',
}
const DRAFT_STATUS_LABELS = {
  pending_client: 'Awaiting Client',
  approved:       'Approved',
  declined:       'Declined',
  scrapped:       'Scrapped',
}
const SHOOT_STATUS_COLORS = {
  scheduled:  'bg-blue-50 text-blue-700',
  completed:  'bg-green-50 text-green-700',
  cancelled:  'bg-red-50 text-red-600',
}
const STAGE_LABELS = {
  briefing: 'Briefing', pre_production: 'Pre-Production', production: 'Production',
  post_production: 'Post-Production', review: 'Review', revisions: 'Revisions', delivered: 'Delivered',
}
const STAGE_COLORS = {
  briefing: 'bg-slate-100 text-slate-600', pre_production: 'bg-blue-50 text-blue-600',
  production: 'bg-amber-50 text-amber-700', post_production: 'bg-purple-50 text-purple-600',
  review: 'bg-orange-50 text-orange-600', revisions: 'bg-red-50 text-red-600',
  delivered: 'bg-green-50 text-green-700',
}

// ── New Shoot Modal ────────────────────────────────────────────────────────────
function NewShootModal({ clientId, onClose, onCreated }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    title: '', description: '', shoot_date: '', shoot_time: '', location: '', status: 'scheduled',
  })
  const [clientTeam,    setClientTeam]    = useState([])
  const [selectedMember, setSelectedMember] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Load team members assigned to this client
  useEffect(() => {
    if (!clientId) return
    supabase
      .from('client_creatives')
      .select('profile_id, role, profiles(id, full_name, role)')
      .eq('client_id', clientId)
      .then(({ data }) => setClientTeam((data || []).map((a) => ({ ...a.profiles, assignedRole: a.role }))))
  }, [clientId])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        client_id:   clientId,
        title:       form.title.trim(),
        description: form.description || null,
        shoot_date:  form.shoot_date || null,
        shoot_time:  form.shoot_time || null,
        location:    form.location || null,
        status:      form.status,
        created_by:  user?.id,
      }
      const row = await createShoot(payload)

      // Auto-create a calendar event for the shoot
      if (form.shoot_date) {
        const timeStr = form.shoot_time || '09:00'
        const startAt = new Date(`${form.shoot_date}T${timeStr}:00`)
        const endAt   = new Date(startAt.getTime() + 4 * 60 * 60 * 1000) // 4hr block
        const memberIds = selectedMember ? [selectedMember] : []
        const { data: evtData } = await supabase.from('calendar_events').insert({
          title:      `${form.title.trim()} — Shoot`,
          event_type: 'shoot',
          start_at:   startAt.toISOString(),
          end_at:     endAt.toISOString(),
          all_day:    !form.shoot_time,
          location:   form.location || null,
          shoot_id:   row.id,
          client_id:  clientId,
          created_by: user?.id,
        }).select('id').single()
        if (evtData?.id) {
          await supabase.from('shoots').update({ calendar_event_id: evtData.id }).eq('id', row.id)
          // Add selected member to calendar event
          if (memberIds.length) {
            await supabase.from('calendar_event_members').insert(
              memberIds.map((profile_id) => ({ event_id: evtData.id, profile_id }))
            )
          }
        }
      }

      onCreated(row)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-text-primary">Schedule Shoot</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Shoot Name *</label>
            <input className="input" value={form.title} onChange={set('title')} placeholder="e.g. Spring Campaign Shoot" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.shoot_date} onChange={set('shoot_date')} />
            </div>
            <div>
              <label className="label">Time</label>
              <input type="time" className="input" value={form.shoot_time} onChange={set('shoot_time')} />
            </div>
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={set('location')} placeholder="Address or venue name" />
          </div>

          {/* Assign a team member */}
          <div>
            <label className="label">Photographer / Videographer</label>
            <select className="input" value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}>
              <option value="">— None —</option>
              {clientTeam.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
            {clientTeam.length === 0 && (
              <p className="text-xs text-text-muted mt-1">No team assigned to this client yet.</p>
            )}
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={set('description')} placeholder="What are we shooting?" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── New Draft Modal ────────────────────────────────────────────────────────────
function NewDraftModal({ clientId, shoots, onClose, onCreated }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    title: '', type: 'post', concept: '', target_date: '',
    shoot_id: '', inspiration_links: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const links = form.inspiration_links
        .split(/[\n,]+/)
        .map((l) => l.trim())
        .filter(Boolean)
      const row = await createDraft({
        client_id:         clientId,
        title:             form.title.trim() || null,
        type:              form.type || null,
        concept:           form.concept || null,
        target_date:       form.target_date || null,
        shoot_id:          form.shoot_id || null,
        inspiration_links: links.length ? links : null,
        status:            'pending_client',
        created_by:        user?.id,
      })
      onCreated(row)
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
          <h2 className="text-base font-semibold text-text-primary">New Content Draft</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={set('type')}>
                {Object.entries(DRAFT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Target Date</label>
              <input type="date" className="input" value={form.target_date} onChange={set('target_date')} />
            </div>
          </div>
          <div>
            <label className="label">Title / Hook</label>
            <input className="input" value={form.title} onChange={set('title')} placeholder="Short title or post hook..." autoFocus />
          </div>
          <div>
            <label className="label">Concept</label>
            <textarea className="input resize-none" rows={4} value={form.concept} onChange={set('concept')} placeholder="Describe the concept, message, tone, visuals..." />
          </div>
          {shoots.length > 0 && (
            <div>
              <label className="label">Linked Shoot (optional)</label>
              <select className="input" value={form.shoot_id} onChange={set('shoot_id')}>
                <option value="">None</option>
                {shoots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}{s.shoot_date ? ` — ${format(parseISO(s.shoot_date), 'MMM d')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">Inspiration Links</label>
            <textarea className="input resize-none text-xs" rows={3} value={form.inspiration_links} onChange={set('inspiration_links')} placeholder="One URL per line or comma-separated..." />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Draft
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Tab: Overview ──────────────────────────────────────────────────────────────
function OverviewTab({ client, shoots, drafts, projects, requests }) {
  const { assignments, loading: aLoading, refetch: refetchA } = useClientCreatives(client.id)
  const [allProfiles, setAllProfiles] = useState([])
  const [adding, setAdding]           = useState(false)
  const [selProfile, setSelProfile]   = useState('')
  const [selRole, setSelRole]         = useState('creative')
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, role, avatar_url').neq('role', 'client').order('full_name').then(({ data }) => {
      setAllProfiles(data || [])
    })
  }, [])

  const assignedIds = assignments.map((a) => a.profile_id)
  const available   = allProfiles.filter((p) => !assignedIds.includes(p.id))

  const handleAssign = async () => {
    if (!selProfile) return
    setSaving(true)
    try {
      await assignCreative(client.id, selProfile, selRole)
      await refetchA()
      setAdding(false)
      setSelProfile('')
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id) => {
    try {
      await removeCreativeAssignment(id)
      await refetchA()
    } catch (err) {
      alert(err.message)
    }
  }

  const stats = [
    { label: 'Shoots',   value: shoots.length,                                 color: 'text-blue-600' },
    { label: 'Drafts',   value: drafts.filter((d) => d.status !== 'scrapped').length, color: 'text-amber-600' },
    { label: 'Projects', value: projects.length,                               color: 'text-purple-600' },
    { label: 'Requests', value: requests.length,                               color: 'text-green-600' },
  ]

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Client info */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Client Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex gap-2"><span className="text-text-muted w-28">Company</span><span className="font-medium text-text-primary">{client.name || '—'}</span></div>
          <div className="flex gap-2"><span className="text-text-muted w-28">Contact</span><span className="font-medium text-text-primary">{client.contact_name || '—'}</span></div>
          <div className="flex gap-2"><span className="text-text-muted w-28">Email</span><span className="font-medium text-text-primary">{client.contact_email || client.email || '—'}</span></div>
          <div className="flex gap-2"><span className="text-text-muted w-28">Phone</span><span className="font-medium text-text-primary">{client.contact_phone || client.phone || '—'}</span></div>
          {client.notes && <div className="flex gap-2"><span className="text-text-muted w-28">Notes</span><span className="text-text-secondary">{client.notes}</span></div>}
        </div>
      </div>

      {/* Assigned Creatives */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Assigned Team</h3>
          <button onClick={() => setAdding(!adding)} className="btn-secondary text-xs flex items-center gap-1">
            <Plus size={12} /> Add
          </button>
        </div>

        {adding && (
          <div className="flex gap-2 mb-4 p-3 bg-surface-2 rounded-xl">
            <select className="input text-sm flex-1" value={selProfile} onChange={(e) => setSelProfile(e.target.value)}>
              <option value="">Select person...</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
              ))}
            </select>
            <select className="input text-sm w-36" value={selRole} onChange={(e) => setSelRole(e.target.value)}>
              <option value="creative">Creative</option>
              <option value="photographer">Photographer</option>
              <option value="videographer">Videographer</option>
              <option value="editor">Editor</option>
            </select>
            <button onClick={handleAssign} disabled={!selProfile || saving} className="btn-primary text-sm px-3 disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button onClick={() => setAdding(false)} className="btn-ghost p-2"><X size={14} /></button>
          </div>
        )}

        {aLoading ? (
          <div className="py-4 flex justify-center"><Loader2 size={16} className="animate-spin text-text-muted" /></div>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No team members assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <Avatar name={a.profiles?.full_name} url={a.profiles?.avatar_url} size={8} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{a.profiles?.full_name || '—'}</p>
                  <p className="text-xs text-text-muted capitalize">{a.role}</p>
                </div>
                <button onClick={() => handleRemove(a.id)} className="text-text-muted hover:text-red-500 transition-colors p-1">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Shoots ────────────────────────────────────────────────────────────────
function ShootsTab({ clientId, client }) {
  const { shoots, loading, refetch } = useShoots(clientId)
  const [showNew, setShowNew] = useState(false)
  const [uploadCounts, setUploadCounts] = useState({})

  useEffect(() => {
    if (!clientId) return
    supabase
      .from('shoot_uploads')
      .select('shoot_id', { count: 'exact' })
      .eq('client_id', clientId)
      .then(({ data }) => {
        const counts = {}
        ;(data || []).forEach(({ shoot_id }) => {
          if (shoot_id) counts[shoot_id] = (counts[shoot_id] || 0) + 1
        })
        setUploadCounts(counts)
      })
  }, [clientId, shoots])

  const today = startOfDay(new Date())
  const upcoming = shoots.filter((s) => s.shoot_date && !isBefore(parseISO(s.shoot_date), today))
  const past     = shoots.filter((s) => !s.shoot_date || isBefore(parseISO(s.shoot_date), today))

  const ShootCard = ({ shoot }) => (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{shoot.title}</p>
          <div className="flex flex-wrap gap-3 mt-1.5">
            {shoot.shoot_date && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <CalendarDays size={11} />
                {format(parseISO(shoot.shoot_date), 'EEE, MMM d yyyy')}
                {shoot.shoot_time && ` at ${shoot.shoot_time.slice(0, 5)}`}
              </span>
            )}
            {shoot.location && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <MapPin size={11} /> {shoot.location}
              </span>
            )}
          </div>
          {shoot.description && <p className="text-xs text-text-secondary mt-1.5 line-clamp-2">{shoot.description}</p>}
          {uploadCounts[shoot.id] > 0 && (
            <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
              <Film size={10} /> {uploadCounts[shoot.id]} file{uploadCounts[shoot.id] !== 1 ? 's' : ''} uploaded
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${SHOOT_STATUS_COLORS[shoot.status] || 'bg-surface-2 text-text-muted'}`}>
            {shoot.status}
          </span>
          <button
            onClick={async () => {
              const next = shoot.status === 'scheduled' ? 'completed' : 'scheduled'
              await updateShoot(shoot.id, { status: next })
              refetch()
            }}
            className="text-[10px] text-text-muted hover:text-accent transition-colors"
          >
            {shoot.status === 'scheduled' ? 'Mark done' : 'Reopen'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{shoots.length} shoot{shoots.length !== 1 ? 's' : ''} total</p>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Schedule Shoot
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
      ) : shoots.length === 0 ? (
        <div className="card p-10 text-center">
          <Camera size={32} className="mx-auto text-text-muted/30 mb-3" />
          <p className="text-sm font-semibold text-text-primary">No shoots scheduled yet</p>
          <p className="text-sm text-text-muted mt-1">Schedule the first shoot for this client.</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Upcoming</h3>
              <div className="space-y-3">{upcoming.map((s) => <ShootCard key={s.id} shoot={s} />)}</div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Past</h3>
              <div className="space-y-3">{past.map((s) => <ShootCard key={s.id} shoot={s} />)}</div>
            </div>
          )}
        </>
      )}

      {showNew && (
        <NewShootModal
          clientId={clientId}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refetch() }}
        />
      )}
    </div>
  )
}

// ── Tab: Content Drafts ────────────────────────────────────────────────────────
function ContentTab({ clientId, shoots }) {
  const { drafts, loading, refetch } = useContentDrafts(clientId)
  const [showNew, setShowNew]   = useState(false)
  const [updating, setUpdating] = useState(null)

  const handleStatus = async (draftId, status) => {
    setUpdating(draftId)
    try {
      await updateDraft(draftId, { status })

      // Auto-create a project when client approves a draft
      if (status === 'approved') {
        const draft = drafts.find((d) => d.id === draftId)
        if (draft) {
          const { error: projErr } = await supabase.from('projects').insert({
            name:        draft.title || `${DRAFT_TYPE_LABELS[draft.type] || 'Content'} Project`,
            client_id:   draft.client_id,
            draft_id:    draft.id,
            stage:       'post_production',
            target_date: draft.target_date || null,
            concept:     draft.concept || null,
            status:      'active',
          })
          if (projErr) console.error('Auto-project creation failed:', projErr.message)
        }
      }

      await refetch()
    } catch (err) {
      alert(err.message)
    } finally {
      setUpdating(null)
    }
  }

  const pending  = drafts.filter((d) => d.status === 'pending_client')
  const approved = drafts.filter((d) => d.status === 'approved')
  const other    = drafts.filter((d) => d.status === 'declined' || d.status === 'scrapped')

  const DraftCard = ({ draft }) => (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-3 text-text-muted">
              {DRAFT_TYPE_LABELS[draft.type] || draft.type || 'Draft'}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${DRAFT_STATUS_COLORS[draft.status]}`}>
              {DRAFT_STATUS_LABELS[draft.status]}
            </span>
            {draft.target_date && (
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <CalendarDays size={9} /> {format(parseISO(draft.target_date), 'MMM d')}
              </span>
            )}
          </div>
          {draft.title && <p className="text-sm font-semibold text-text-primary mt-1.5">{draft.title}</p>}
          {draft.concept && <p className="text-xs text-text-secondary mt-1 line-clamp-3">{draft.concept}</p>}
          {draft.shoots?.title && (
            <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
              <Camera size={10} /> {draft.shoots.title}
            </p>
          )}
          {draft.inspiration_links?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {draft.inspiration_links.slice(0, 3).map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noreferrer"
                  className="text-[10px] text-accent hover:underline flex items-center gap-0.5">
                  <LinkIcon size={9} /> ref {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => handleStatus(draft.id, 'scrapped')} disabled={!!updating}
            title="Scrap" className="p-1.5 text-text-muted hover:text-red-500 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {draft.status === 'pending_client' && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-border">
          <button onClick={() => handleStatus(draft.id, 'approved')} disabled={!!updating}
            className="btn-primary text-xs flex-1 flex items-center justify-center gap-1">
            {updating === draft.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Approve
          </button>
          <button onClick={() => handleStatus(draft.id, 'scrapped')} disabled={!!updating}
            className="btn-secondary text-xs flex-1">
            Decline
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{drafts.length} draft{drafts.length !== 1 ? 's' : ''} total</p>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> New Draft
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
      ) : drafts.length === 0 ? (
        <div className="card p-10 text-center">
          <FileText size={32} className="mx-auto text-text-muted/30 mb-3" />
          <p className="text-sm font-semibold text-text-primary">No content drafts yet</p>
          <p className="text-sm text-text-muted mt-1">Create a draft concept for the client to approve.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Awaiting Client Approval</h3>
              <div className="space-y-3">{pending.map((d) => <DraftCard key={d.id} draft={d} />)}</div>
            </div>
          )}
          {approved.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Approved</h3>
              <div className="space-y-3">{approved.map((d) => <DraftCard key={d.id} draft={d} />)}</div>
            </div>
          )}
          {other.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Declined / Scrapped</h3>
              <div className="space-y-3">{other.map((d) => <DraftCard key={d.id} draft={d} />)}</div>
            </div>
          )}
        </>
      )}

      {showNew && (
        <NewDraftModal
          clientId={clientId}
          shoots={shoots}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refetch() }}
        />
      )}
    </div>
  )
}

// ── Tab: Projects ──────────────────────────────────────────────────────────────
function ProjectsTab({ clientId, projects }) {
  const navigate = useNavigate()
  if (!projects.length) return (
    <div className="card p-10 text-center">
      <FolderKanban size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">No projects yet</p>
      <p className="text-sm text-text-muted mt-1">Projects are created from approved drafts or manually via the Projects page.</p>
    </div>
  )
  return (
    <div className="space-y-3">
      {projects.map((p) => (
        <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
          className="card p-4 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">{p.name}</p>
            {p.due_date && (
              <p className="text-xs text-text-muted mt-0.5">Due {format(parseISO(p.due_date), 'MMM d, yyyy')}</p>
            )}
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] || 'bg-surface-2 text-text-muted'}`}>
            {STAGE_LABELS[p.stage] || p.stage}
          </span>
          <ChevronRight size={14} className="text-text-muted shrink-0" />
        </div>
      ))}
    </div>
  )
}

// ── Tab: Requests ──────────────────────────────────────────────────────────────
function RequestsTab({ requests }) {
  const navigate = useNavigate()
  if (!requests.length) return (
    <div className="card p-10 text-center">
      <Inbox size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">No requests yet</p>
      <p className="text-sm text-text-muted mt-1">Content requests from this client will appear here.</p>
    </div>
  )
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="card p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary capitalize">{r.type?.replace('_', ' ') || 'Request'}</p>
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{r.idea || r.file_name || '—'}</p>
            {r.target_date && (
              <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                <CalendarDays size={10} /> Target: {format(parseISO(r.target_date), 'MMM d')}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              r.status === 'new' ? 'bg-amber-50 text-amber-700' :
              r.status === 'in_progress' ? 'bg-blue-50 text-blue-700' :
              r.status === 'done' ? 'bg-green-50 text-green-700' :
              'bg-surface-2 text-text-muted'
            }`}>
              {r.status}
            </span>
            <span className="text-[10px] text-text-muted">{format(new Date(r.created_at), 'MMM d')}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview',  icon: Building2 },
  { id: 'shoots',   label: 'Shoots',    icon: Camera },
  { id: 'content',  label: 'Concepts',  icon: FileText },
  { id: 'projects', label: 'Projects',  icon: FolderKanban },
  { id: 'requests', label: 'Requests',  icon: Inbox },
]

export default function ClientHub() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient]     = useState(null)
  const [projects, setProjects] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('overview')

  const { shoots } = useShoots(id)
  const { drafts }  = useContentDrafts(id)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('projects').select('id, name, stage, due_date, created_at').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('content_requests').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    ]).then(([clientRes, projRes, reqRes]) => {
      setClient(clientRes.data)
      setProjects(projRes.data || [])
      setRequests(reqRes.data || [])
      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  if (!client) return (
    <div className="p-8 text-center text-text-muted">Client not found.</div>
  )

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/clients')} className="btn-ghost p-2">
          <ArrowLeft size={16} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
          <Building2 size={20} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{client.name}</h1>
          {client.contact_name && <p className="text-sm text-text-muted">{client.contact_name}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === tabId
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Icon size={14} />
            {label}
            {tabId === 'requests' && requests.filter((r) => r.status === 'new').length > 0 && (
              <span className="ml-1 w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center">
                {requests.filter((r) => r.status === 'new').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <OverviewTab client={client} shoots={shoots} drafts={drafts} projects={projects} requests={requests} />
      )}
      {tab === 'shoots' && <ShootsTab clientId={id} client={client} />}
      {tab === 'content' && <ContentTab clientId={id} shoots={shoots} />}
      {tab === 'projects' && <ProjectsTab clientId={id} projects={projects} />}
      {tab === 'requests' && <RequestsTab requests={requests} />}
    </div>
  )
}
