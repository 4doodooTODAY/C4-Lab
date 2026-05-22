import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Building2, Users2, CalendarDays, FolderKanban,
  Inbox, Plus, X, Loader2, Edit2, MapPin, Clock, Check,
  Camera, Film, ExternalLink, Trash2, ChevronRight, AlertCircle,
  Link as LinkIcon, FileText, LayoutList, HardDrive, Image, File,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Avatar from '../../components/ui/Avatar'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { useClientCreatives, assignCreative, removeCreativeAssignment } from '../../hooks/useClientCreatives'
import { useShoots, createShoot, updateShoot } from '../../hooks/useShoots'
import { useContentDrafts, createDraft, updateDraft } from '../../hooks/useContentDrafts'
import { fmtTime } from '../../lib/time'
import { forceDownload } from '../../lib/r2'
import ShootDetailModal from '../../components/shoots/ShootDetailModal'

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
  post_production: 'Post-Production', review: 'Review', revisions: 'Revisions', delivered: 'Delivered', ready_to_post: 'Ready to Post',
}
const STAGE_COLORS = {
  briefing: 'bg-slate-100 text-slate-600', pre_production: 'bg-blue-50 text-blue-600',
  production: 'bg-amber-50 text-amber-700', post_production: 'bg-purple-50 text-purple-600',
  review: 'bg-orange-50 text-orange-600', revisions: 'bg-red-50 text-red-600',
  delivered: 'bg-green-50 text-green-700',
  ready_to_post: 'bg-blue-50 text-blue-600',
}

// ── New Shoot Modal ────────────────────────────────────────────────────────────
function NewShootModal({ clientId, onClose, onCreated }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    title: '', creative_notes: '', shoot_date: '', shoot_time: '', location: '', status: 'scheduled',
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
        creative_notes: form.creative_notes || null,
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
            <label className="label">Creative Notes</label>
            <p className="text-xs text-text-muted mb-1">(only visible to creative team)</p>
            <textarea className="input resize-none" rows={3} value={form.creative_notes} onChange={set('creative_notes')} placeholder="What are we shooting?" />
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
    { label: 'Drafts',   value: drafts.filter((d) => d.status !== 'scrapped' && d.status !== 'approved').length, color: 'text-amber-600' },
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
  const [detailShoot, setDetailShoot] = useState(null)
  const [deleteShootConfirm, setDeleteShootConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

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

  const handleHardDeleteShoot = async (shootId) => {
    setDeleting(true)
    try {
      await supabase.from('shoots').delete().eq('id', shootId)
      await refetch()
      setDeleteShootConfirm(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const today = startOfDay(new Date())
  const upcoming = shoots.filter((s) => s.shoot_date && !isBefore(parseISO(s.shoot_date), today))
  const past     = shoots.filter((s) => !s.shoot_date || isBefore(parseISO(s.shoot_date), today))

  const ShootCard = ({ shoot }) => (
    <div className="card p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetailShoot(shoot)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{shoot.title}</p>
          <div className="flex flex-wrap gap-3 mt-1.5">
            {shoot.shoot_date && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <CalendarDays size={11} />
                {format(parseISO(shoot.shoot_date), 'EEE, MMM d yyyy')}
                {shoot.shoot_time && ` at ${fmtTime(shoot.shoot_time)}`}
              </span>
            )}
            {shoot.location && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <MapPin size={11} /> {shoot.location}
              </span>
            )}
          </div>
          {shoot.creative_notes && <p className="text-xs text-text-secondary mt-1.5 line-clamp-2">{shoot.creative_notes}</p>}
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
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDeleteShootConfirm(shoot.id)
              }}
              className="text-[10px] text-text-muted hover:text-red-500 transition-colors p-1"
              title="Delete shoot"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                const next = shoot.status === 'scheduled' ? 'completed' : 'scheduled'
                updateShoot(shoot.id, { status: next })
                refetch()
              }}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                shoot.status === 'scheduled'
                  ? 'bg-green-50 text-green-700 hover:bg-green-100'
                  : 'bg-surface-2 text-text-muted hover:bg-surface-3'
              }`}
            >
              {shoot.status === 'scheduled' ? <><Check size={11} /> Mark Done</> : 'Reopen'}
            </button>
          </div>
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

      {detailShoot && (
        <ShootDetailModal
          shoot={detailShoot}
          clientId={clientId}
          clientName={client?.name || ''}
          onClose={() => setDetailShoot(null)}
        />
      )}

      {/* Delete shoot confirmation modal */}
      {deleteShootConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteShootConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h2 className="text-base font-bold text-text-primary text-center mb-1">Delete shoot?</h2>
            <p className="text-xs text-text-muted text-center mb-5">
              This will permanently delete the shoot and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteShootConfirm(null)} disabled={deleting} className="flex-1 btn-secondary">Cancel</button>
              <button
                onClick={() => handleHardDeleteShoot(deleteShootConfirm)}
                disabled={deleting}
                className="flex-1 py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Content Drafts ────────────────────────────────────────────────────────
function ContentTab({ clientId, shoots, projects, onRefetchProjects }) {
  const { drafts, loading, refetch } = useContentDrafts(clientId)
  const navigate = useNavigate()
  const [showNew, setShowNew]   = useState(false)
  const [updating, setUpdating] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const createProjectFromDraft = async (draft) => {
    const { data: proj, error: projErr } = await supabase.from('projects').insert({
      name:        draft.title || `${DRAFT_TYPE_LABELS[draft.type] || 'Content'} Project`,
      client_id:   draft.client_id || clientId,
      draft_id:    draft.id,
      stage:       'pitch',
      target_date: draft.target_date || null,
      due_date:    draft.target_date || null,
      shoot_id:    draft.shoot_id || null,
      concept:     draft.concept || null,
      status:      'active',
    }).select('id').single()
    if (projErr) { console.error('Project creation failed:', projErr.message); throw projErr }

    // Auto-assign first available editor for this client
    const { data: team } = await supabase
      .from('client_creatives')
      .select('profile_id, role')
      .eq('client_id', draft.client_id || clientId)
      .in('role', ['editor', 'creative'])
      .limit(1)

    if (team?.length) {
      await supabase.from('projects').update({ editor_id: team[0].profile_id }).eq('id', proj.id)
    }

    // Mark draft as converted so it disappears from concepts view
    await supabase.from('content_drafts').update({ status: 'converted' }).eq('id', draft.id)

    return proj
  }

  const handleStatus = async (draftId, status) => {
    setUpdating(draftId)
    try {
      await updateDraft(draftId, { status })
      if (status === 'approved') {
        const draft = drafts.find((d) => d.id === draftId)
        if (draft) {
          const proj = await createProjectFromDraft(draft)
          await onRefetchProjects?.()
          await refetch()
          // Navigate straight to the new project
          navigate(`/projects/${proj.id}`)
          return
        }
      }
      await refetch()
    } catch (err) {
      alert(err.message)
    } finally {
      setUpdating(null)
    }
  }

  const handleCreateProject = async (draft) => {
    setUpdating(draft.id)
    try {
      const proj = await createProjectFromDraft(draft)
      await onRefetchProjects?.()
      navigate(`/projects/${proj.id}`)
    } catch (err) {
      alert('Could not create project: ' + err.message)
    } finally {
      setUpdating(null)
    }
  }

  const handleHardDelete = async (draftId) => {
    setUpdating(draftId)
    try {
      await supabase.from('content_drafts').delete().eq('id', draftId)
      await refetch()
      setDeleteConfirm(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setUpdating(null)
    }
  }

  const pending  = drafts.filter((d) => d.status === 'pending_client')
  const approved = drafts.filter((d) => d.status === 'approved')
  const other    = drafts.filter((d) => d.status === 'declined' || d.status === 'scrapped')

  const [editDraft, setEditDraft] = useState(null) // draft being edited
  const [editForm, setEditForm]   = useState({})
  const [editSaving, setEditSaving] = useState(false)

  const openEdit = (draft) => {
    setEditDraft(draft)
    setEditForm({
      type:              draft.type || 'post',
      title:             draft.title || '',
      concept:           draft.concept || '',
      target_date:       draft.target_date || '',
      shoot_id:          draft.shoot_id || '',
      inspiration_links: (draft.inspiration_links || []).join('\n'),
    })
  }

  const saveEdit = async () => {
    if (!editDraft) return
    setEditSaving(true)
    const links = editForm.inspiration_links.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
    await supabase.from('content_drafts').update({
      type:              editForm.type,
      title:             editForm.title || null,
      concept:           editForm.concept || null,
      target_date:       editForm.target_date || null,
      shoot_id:          editForm.shoot_id || null,
      inspiration_links: links.length ? links : null,
    }).eq('id', editDraft.id)
    setEditSaving(false)
    setEditDraft(null)
    refetch()
  }

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
            <div className="flex flex-col gap-1 mt-1.5">
              {draft.inspiration_links.map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noreferrer"
                  className="text-[10px] text-accent hover:underline flex items-center gap-1 truncate max-w-xs">
                  <LinkIcon size={9} className="shrink-0" /> {link}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => openEdit(draft)} title="Edit" className="p-1.5 text-text-muted hover:text-accent transition-colors">
            <Edit2 size={13} />
          </button>
          {draft.status === 'scrapped' ? (
            <button onClick={() => setDeleteConfirm(draft.id)} disabled={!!updating}
              title="Permanently delete" className="p-1.5 text-text-muted hover:text-red-600 transition-colors">
              <X size={13} />
            </button>
          ) : (
            <button onClick={() => handleStatus(draft.id, 'scrapped')} disabled={!!updating}
              title="Scrap" className="p-1.5 text-text-muted hover:text-red-500 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {draft.status === 'pending_client' && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-border">
          <button onClick={() => handleStatus(draft.id, 'approved')} disabled={!!updating}
            className="btn-primary text-xs flex-1 flex items-center justify-center gap-1">
            {updating === draft.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Approve & Create Project
          </button>
          <button onClick={() => handleStatus(draft.id, 'scrapped')} disabled={!!updating}
            className="btn-secondary text-xs flex-1">
            Decline
          </button>
        </div>
      )}
      {draft.status === 'approved' && (() => {
        const linkedProject = projects?.find((p) => p.draft_id === draft.id)
        return (
          <div className="flex gap-2 mt-2 pt-2 border-t border-border">
            {linkedProject ? (
              <button onClick={() => navigate(`/projects/${linkedProject.id}`)}
                className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1">
                <ChevronRight size={11} /> View Project
              </button>
            ) : (
              <button onClick={() => handleCreateProject(draft)} disabled={!!updating}
                className="btn-primary text-xs flex-1 flex items-center justify-center gap-1">
                {updating === draft.id ? <Loader2 size={11} className="animate-spin" /> : <FolderKanban size={11} />}
                Create Project
              </button>
            )}
          </div>
        )
      })()}
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
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Approved → In Projects</h3>
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

      {editDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditDraft(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-text-primary">Edit Concept</h2>
              <button onClick={() => setEditDraft(null)} className="btn-ghost p-1.5"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={editForm.type} onChange={e => setEditForm(f => ({...f, type: e.target.value}))}>
                    {Object.entries(DRAFT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Post Date</label>
                  <input type="date" className="input" value={editForm.target_date} onChange={e => setEditForm(f => ({...f, target_date: e.target.value}))} />
                </div>
              </div>
              <div>
                <label className="label">Title / Hook</label>
                <input className="input" value={editForm.title} onChange={e => setEditForm(f => ({...f, title: e.target.value}))} />
              </div>
              <div>
                <label className="label">Concept</label>
                <textarea className="input resize-none" rows={4} value={editForm.concept} onChange={e => setEditForm(f => ({...f, concept: e.target.value}))} />
              </div>
              {shoots.length > 0 && (
                <div>
                  <label className="label">Linked Shoot</label>
                  <select className="input" value={editForm.shoot_id} onChange={e => setEditForm(f => ({...f, shoot_id: e.target.value}))}>
                    <option value="">None</option>
                    {shoots.map(s => <option key={s.id} value={s.id}>{s.title}{s.shoot_date ? ` — ${format(parseISO(s.shoot_date), 'MMM d')}` : ''}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Inspiration Links</label>
                <textarea className="input resize-none text-xs" rows={3} value={editForm.inspiration_links} onChange={e => setEditForm(f => ({...f, inspiration_links: e.target.value}))} placeholder="One URL per line..." />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setEditDraft(null)} className="btn-secondary">Cancel</button>
                <button onClick={saveEdit} disabled={editSaving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                  {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hard delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h2 className="text-base font-bold text-text-primary text-center mb-1">Permanently delete concept?</h2>
            <p className="text-xs text-text-muted text-center mb-5">
              This cannot be undone. The concept and all its data will be removed permanently.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} disabled={!!updating} className="flex-1 btn-secondary">Cancel</button>
              <button
                onClick={() => handleHardDelete(deleteConfirm)}
                disabled={!!updating}
                className="flex-1 py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updating ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Projects ──────────────────────────────────────────────────────────────
function ProjectsTab({ clientId, projects, onRefetch }) {
  const navigate = useNavigate()
  const [teamMembers, setTeamMembers] = useState([])
  const [assigningTo, setAssigningTo] = useState(null) // project id being assigned
  const [selectedEditor, setSelectedEditor] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!clientId) return
    supabase
      .from('client_creatives')
      .select('profile_id, profiles(id, full_name, role)')
      .eq('client_id', clientId)
      .then(({ data }) => setTeamMembers((data || []).map((d) => d.profiles).filter(Boolean)))
  }, [clientId])

  const handleAssign = async (projectId) => {
    if (!selectedEditor) return
    setSaving(true)
    await supabase.from('projects').update({ editor_id: selectedEditor }).eq('id', projectId)
    setAssigningTo(null)
    setSelectedEditor('')
    setSaving(false)
    onRefetch?.()
  }

  if (!projects.length) return (
    <div className="card p-10 text-center">
      <FolderKanban size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">No projects yet</p>
      <p className="text-sm text-text-muted mt-1">Projects are created automatically when a concept is approved.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {projects.map((p) => {
        const editorName = p.profiles?.full_name
        const isAssigning = assigningTo === p.id
        return (
          <div key={p.id} className="card p-4">
            <div
              onClick={() => navigate(`/projects/${p.id}`)}
              className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">{p.name}</p>
                  {!editorName && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertCircle size={9} /> Waiting for editor
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {p.due_date && (
                    <p className="text-xs text-text-muted">Due {format(parseISO(p.due_date), 'MMM d, yyyy')}</p>
                  )}
                  {editorName && (
                    <p className="text-xs text-text-muted flex items-center gap-1">
                      <Users2 size={10} /> {editorName}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] || 'bg-surface-2 text-text-muted'}`}>
                  {STAGE_LABELS[p.stage] || p.stage}
                </span>
                {p.stage === 'delivered' && (
                  <span className="text-[10px] text-green-600 font-semibold flex items-center gap-0.5">
                    <Check size={9} /> Posted Online
                  </span>
                )}
                {p.stage === 'ready_to_post' && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      await supabase.from('projects').update({ stage: 'delivered' }).eq('id', p.id)
                      onRefetch?.()
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                  >
                    Mark as Posted
                  </button>
                )}
              </div>
              <ChevronRight size={14} className="text-text-muted shrink-0" />
            </div>

            {/* Assign editor row */}
            {!isAssigning ? (
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <p className="text-xs text-text-muted">
                  {editorName ? `Editor: ${editorName}` : 'No editor assigned yet'}
                </p>
                <button
                  onClick={() => { setAssigningTo(p.id); setSelectedEditor(p.editor_id || '') }}
                  className="text-xs text-accent hover:underline font-medium"
                >
                  {editorName ? 'Change editor' : 'Assign editor'}
                </button>
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                <select
                  className="input text-sm flex-1"
                  value={selectedEditor}
                  onChange={(e) => setSelectedEditor(e.target.value)}
                  autoFocus
                >
                  <option value="">— Select editor —</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name} ({m.role})</option>
                  ))}
                </select>
                <button
                  onClick={() => handleAssign(p.id)}
                  disabled={!selectedEditor || saving}
                  className="btn-primary text-sm px-3 disabled:opacity-50 flex items-center gap-1"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Save
                </button>
                <button onClick={() => setAssigningTo(null)} className="btn-ghost p-2">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )
      })}
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

// ── Files Tab (Storage Browser) ────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (!bytes) return ''
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB'
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(1) + ' KB'
}

function fileIconAdmin(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return Film
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'raw', 'cr2', 'arw'].includes(ext)) return Image
  return File
}

function FilesTab({ clientId }) {
  const { shoots, loading: shootsLoading } = useShoots(clientId)
  const [uploads, setUploads]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    if (!clientId) return
    supabase
      .from('shoot_uploads')
      .select('id, file_name, file_url, file_size, shoot_id, created_at, notes, uploaded_by')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setUploads(data || []); setLoading(false) })
  }, [clientId])

  if (shootsLoading || loading) return (
    <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
  )

  // Group uploads by shoot_id
  const byShoot = {}
  uploads.forEach((u) => {
    const key = u.shoot_id || 'unlinked'
    if (!byShoot[key]) byShoot[key] = []
    byShoot[key].push(u)
  })

  const groups = [
    ...shoots.map((s) => ({ key: s.id, label: s.title, date: s.shoot_date, files: byShoot[s.id] || [] })),
    ...(byShoot['unlinked']?.length ? [{ key: 'unlinked', label: 'Other Uploads', date: null, files: byShoot['unlinked'] }] : []),
  ].filter((g) => g.files.length > 0)

  const totalFiles = uploads.length
  const totalSize  = uploads.reduce((sum, u) => sum + (u.file_size || 0), 0)

  if (!groups.length) return (
    <div className="card p-10 text-center">
      <HardDrive size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">No files uploaded yet</p>
      <p className="text-sm text-text-muted mt-1">Creative team members upload footage after shoots.</p>
    </div>
  )

  const toggleGroup = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }))

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-text-muted bg-surface-2/60 rounded-xl px-4 py-3">
        <span><span className="font-semibold text-text-primary">{totalFiles}</span> file{totalFiles !== 1 ? 's' : ''}</span>
        <span className="text-border">·</span>
        <span><span className="font-semibold text-text-primary">{fmtBytes(totalSize)}</span> total</span>
        <span className="text-border">·</span>
        <span><span className="font-semibold text-text-primary">{groups.length}</span> shoot{groups.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Shoot folders */}
      {groups.map(({ key, label, date, files }) => {
        const isOpen = expanded[key] !== false // default open
        return (
          <div key={key} className="card overflow-hidden">
            <button
              onClick={() => toggleGroup(key)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-2/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Camera size={15} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{label}</p>
                  <p className="text-xs text-text-muted">
                    {files.length} file{files.length !== 1 ? 's' : ''}
                    {' · '}{fmtBytes(files.reduce((s, f) => s + (f.file_size || 0), 0))}
                    {date && ` · ${format(parseISO(date), 'MMM d, yyyy')}`}
                  </p>
                </div>
              </div>
              <ChevronRight size={14} className={`text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>

            {isOpen && (
              <div className="border-t border-border divide-y divide-border/50">
                {files.map((file) => {
                  const Icon = fileIconAdmin(file.file_name)
                  return (
                    <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors">
                      <Icon size={14} className="text-text-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{file.file_name || 'Unnamed file'}</p>
                        <p className="text-xs text-text-muted">
                          {fmtBytes(file.file_size)}
                          {' · '}
                          {format(new Date(file.created_at), 'MMM d, h:mm a')}
                        </p>
                        {file.notes && <p className="text-xs text-text-secondary italic mt-0.5">"{file.notes}"</p>}
                      </div>
                      {file.file_url && (
                        <button
                          onClick={() => forceDownload(file.file_url, file.file_name)}
                          className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5"
                          title="Download file"
                        >
                          <ExternalLink size={13} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview',  icon: Building2 },
  { id: 'shoots',   label: 'Shoots',    icon: Camera },
  { id: 'content',  label: 'Concepts',  icon: FileText },
  { id: 'projects', label: 'Projects',  icon: FolderKanban },
  { id: 'files',    label: 'Files',     icon: HardDrive },
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
      supabase.from('projects').select('id, name, stage, due_date, created_at, editor_id, profiles!editor_id(full_name)').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('content_requests').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    ]).then(([clientRes, projRes, reqRes]) => {
      setClient(clientRes.data)
      setProjects(projRes.data || [])
      setRequests(reqRes.data || [])
      setLoading(false)
    })
  }, [id])

  const refetchProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('id, name, stage, due_date, created_at, editor_id, profiles!editor_id(full_name)').eq('client_id', id).order('created_at', { ascending: false })
    setProjects(data || [])
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
      {tab === 'shoots'   && <ShootsTab   clientId={id} client={client} />}
      {tab === 'content'  && <ContentTab  clientId={id} shoots={shoots} projects={projects} onRefetchProjects={refetchProjects} />}
      {tab === 'projects' && <ProjectsTab clientId={id} projects={projects} onRefetch={refetchProjects} />}
      {tab === 'files'    && <FilesTab    clientId={id} />}
      {tab === 'requests' && <RequestsTab requests={requests} />}
    </div>
  )
}
