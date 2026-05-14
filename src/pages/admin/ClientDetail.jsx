import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Check, Trash2, Lock, Unlock, Mail, Phone,
  Building2, Users, AlertTriangle, StickyNote, FileText, Upload, X
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { format, formatDistanceToNow } from 'date-fns'
import Avatar from '../../components/ui/Avatar'
import { useCreatives } from '../../hooks/useClients'

async function callAction(body, session) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// ── Assign Team Modal ─────────────────────────────────────────────────────────
function AssignTeamModal({ clientId, creatives, assignedIds, onClose, onSave }) {
  const [selected, setSelected] = useState(new Set(assignedIds))
  const [saving, setSaving] = useState(false)

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const toAdd = [...selected].filter((id) => !assignedIds.includes(id))
    const toRemove = assignedIds.filter((id) => !selected.has(id))

    await Promise.all([
      ...toAdd.map((profile_id) =>
        supabase.from('client_access').insert([{ client_id: clientId, profile_id }])
      ),
      ...toRemove.map((profile_id) =>
        supabase.from('client_access').delete().eq('client_id', clientId).eq('profile_id', profile_id)
      ),
    ])
    onSave([...selected])
    onClose()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Assign Team</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <p className="text-xs text-text-muted mb-4">Select creatives and admins who can access this client's work.</p>
        <div className="space-y-1.5 max-h-72 overflow-y-auto mb-4">
          {creatives.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">No team members found</p>
          )}
          {creatives.map((c) => {
            const active = selected.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                  active ? 'border-accent/30 bg-accent/5' : 'border-border hover:border-border-strong'
                }`}
              >
                <Avatar name={c.full_name} url={c.avatar_url} size={8} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-text-primary">{c.full_name}</p>
                  <p className="text-xs text-text-muted capitalize">{c.role}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  active ? 'bg-accent border-accent' : 'border-border-strong'
                }`}>
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const allCreatives = useCreatives()

  const [client, setClient] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [assignedIds, setAssignedIds] = useState([])
  const [assignedProfiles, setAssignedProfiles] = useState([])
  const [contentRequests, setContentRequests] = useState([])
  const [footageUploads, setFootageUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Editable contact fields
  const [editName, setEditName] = useState('')
  const [editBusiness, setEditBusiness] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Notes
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  // Team modal
  const [showTeamModal, setShowTeamModal] = useState(false)

  // Danger zone
  const [isLocked, setIsLocked] = useState(false)
  const [locking, setLocking] = useState(false)
  const [deleteStep, setDeleteStep] = useState(0)
  const [deleteTyped, setDeleteTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      const [clientRes, accessRes] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .single(),
        supabase
          .from('client_access')
          .select('profile_id, profiles(id, full_name, role, avatar_url, tags)')
          .eq('client_id', id),
      ])

      if (clientRes.data) {
        const c = clientRes.data
        setClient(c)
        setEditName(c.contact_name || '')
        setEditBusiness(c.name || '')
        setEditEmail(c.email || '')
        setEditPhone(c.phone || '')
        setNotes(c.notes || '')

        // Load auth user if we have a profile_id (to check locked status)
        if (c.profile_id) {
          try {
            const auth = await callAction({ action: 'get_user', user_id: c.profile_id }, session)
            if (auth.user) {
              setAuthUser(auth.user)
              setIsLocked(!!auth.user.banned_until)
            }
          } catch (_) {}
        }
      }

      if (accessRes.data) {
        setAssignedIds(accessRes.data.map((a) => a.profile_id))
        setAssignedProfiles(accessRes.data.map((a) => a.profiles).filter(Boolean))
      }

      // Content requests for this client
      if (clientRes.data?.profile_id) {
        const [reqRes, uploadRes] = await Promise.all([
          supabase
            .from('content_requests')
            .select('id, title, status, created_at')
            .eq('profile_id', clientRes.data.profile_id)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('media')
            .select('id, title, created_at, storage_path')
            .eq('uploaded_by', clientRes.data.profile_id)
            .order('created_at', { ascending: false })
            .limit(10),
        ])
        if (reqRes.data) setContentRequests(reqRes.data)
        if (uploadRes.data) setFootageUploads(uploadRes.data)
      }

      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [id])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await callAction({
        action: 'update_client',
        client_id: id,
        contact_name: editName,
        business: editBusiness,
        email: editEmail,
        phone: editPhone,
      }, session)
      setClient((c) => ({ ...c, contact_name: editName, name: editBusiness, email: editEmail, phone: editPhone }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    setNotesSaving(true)
    await supabase.from('clients').update({ notes }).eq('id', id)
    setNotesSaving(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2500)
  }

  const handleLockToggle = async () => {
    if (!client?.profile_id) return
    setLocking(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await callAction({ action: isLocked ? 'unlock_user' : 'lock_user', user_id: client.profile_id }, session)
      setIsLocked((v) => !v)
    } catch (err) {
      setError(err.message)
    } finally {
      setLocking(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (client?.profile_id) {
        await callAction({ action: 'delete_user', user_id: client.profile_id }, session)
      }
      await supabase.from('clients').delete().eq('id', id)
      navigate('/admin/clients')
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  const handleResendInvite = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await callAction({ action: 'resend_invite', email: client.email, full_name: client.contact_name, role: 'client' }, session)
      alert(`Invite resent to ${client.email}`)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  if (!client) return (
    <div className="p-8">
      <Link to="/admin/clients" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6">
        <ArrowLeft size={14} /> Back to Clients
      </Link>
      <p className="text-sm text-text-muted">Client not found.</p>
    </div>
  )

  const isPending = !client.profile_id || authUser?.user_metadata?.must_change_password

  const STATUS_BADGE = {
    new:         { label: 'New', class: 'bg-blue-50 text-blue-600' },
    in_progress: { label: 'In Progress', class: 'bg-amber-50 text-amber-600' },
    in_review:   { label: 'In Review', class: 'bg-purple-50 text-purple-600' },
    done:        { label: 'Done', class: 'bg-green-50 text-green-600' },
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/admin/clients" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to Clients
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Avatar name={client.contact_name || client.name} size={14} />
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-text-primary">{client.contact_name || '—'}</h1>
            {isLocked && (
              <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Locked</span>
            )}
            {isPending ? (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Invite pending</span>
            ) : (
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
            <span className="flex items-center gap-1"><Building2 size={13} /> {client.name || '—'}</span>
            {authUser?.last_sign_in_at && (
              <span>· Last seen {formatDistanceToNow(new Date(authUser.last_sign_in_at), { addSuffix: true })}</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Contact Info */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Contact Info</h2>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Contact Name</label>
                <input className="input w-full" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Business Name</label>
                <input className="input w-full" value={editBusiness} onChange={(e) => setEditBusiness(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
              <input type="email" className="input w-full" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Phone</label>
              <input type="tel" className="input w-full" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="(555) 000-0000" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
                {saved ? 'Saved!' : 'Save Changes'}
              </button>
              {isPending && client.email && (
                <button type="button" onClick={handleResendInvite} className="btn-secondary flex items-center gap-1.5">
                  <Mail size={13} /> Resend Invite
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Assigned Team */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Assigned Team</h2>
            <button onClick={() => setShowTeamModal(true)} className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1">
              <Users size={12} /> Manage
            </button>
          </div>
          {assignedProfiles.length === 0 ? (
            <p className="text-sm text-text-muted">No team members assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {assignedProfiles.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <Avatar name={p.full_name} url={p.avatar_url} size={8} />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{p.full_name}</p>
                    <p className="text-xs text-text-muted capitalize">{p.role}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content Requests */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Content Requests</h2>
          {contentRequests.length === 0 ? (
            <p className="text-sm text-text-muted">No content requests yet.</p>
          ) : (
            <div className="space-y-2">
              {contentRequests.map((req) => {
                const s = STATUS_BADGE[req.status] || STATUS_BADGE.new
                return (
                  <div key={req.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-text-muted shrink-0" />
                      <p className="text-sm text-text-primary">{req.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.class}`}>{s.label}</span>
                      <span className="text-xs text-text-muted">{format(new Date(req.created_at), 'MMM d')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footage Uploads */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Footage Uploads</h2>
          {footageUploads.length === 0 ? (
            <p className="text-sm text-text-muted">No footage uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {footageUploads.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <Upload size={13} className="text-text-muted shrink-0" />
                    <p className="text-sm text-text-primary">{m.title || 'Untitled'}</p>
                  </div>
                  <span className="text-xs text-text-muted">{format(new Date(m.created_at), 'MMM d, yyyy')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Internal Notes */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Internal Notes</h2>
            <span className="text-xs text-text-muted flex items-center gap-1"><StickyNote size={11} /> Admin only</span>
          </div>
          <textarea
            className="input w-full min-h-[100px] resize-y"
            placeholder="Add notes about this client — preferences, context, reminders..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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

        {/* Activity */}
        {authUser && (
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Activity</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Last sign in</span>
                <span className="text-text-primary font-medium">
                  {authUser.last_sign_in_at ? format(new Date(authUser.last_sign_in_at), 'MMM d, yyyy h:mm a') : 'Never'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Account created</span>
                <span className="text-text-primary font-medium">
                  {authUser.created_at ? format(new Date(authUser.created_at), 'MMM d, yyyy') : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Email confirmed</span>
                <span className={`font-medium ${authUser.email_confirmed_at ? 'text-green-600' : 'text-amber-600'}`}>
                  {authUser.email_confirmed_at ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="card p-6 border-red-100">
          <h2 className="text-sm font-semibold text-red-600 mb-4">Danger Zone</h2>
          <div className="space-y-3">
            {/* Lock / Unlock — only if account exists */}
            {client.profile_id && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">{isLocked ? 'Unlock account' : 'Lock account'}</p>
                  <p className="text-xs text-text-muted">{isLocked ? 'Allow this client to sign in again' : 'Prevent this client from signing in'}</p>
                </div>
                <button onClick={handleLockToggle} disabled={locking}
                  className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
                    isLocked ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                  }`}>
                  {locking ? <Loader2 size={13} className="animate-spin" /> : isLocked ? <Unlock size={13} /> : <Lock size={13} />}
                  {isLocked ? 'Unlock' : 'Lock'}
                </button>
              </div>
            )}

            <div className={client.profile_id ? 'border-t border-border pt-3' : ''}>
              {deleteStep === 0 && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Remove client</p>
                    <p className="text-xs text-text-muted">Permanently delete this client account</p>
                  </div>
                  <button onClick={() => setDeleteStep(1)}
                    className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-all">
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              )}
              {deleteStep === 1 && (
                <div className="space-y-2">
                  <p className="text-sm text-text-primary">
                    Type <strong>{client.contact_name || client.name}</strong> to confirm:
                  </p>
                  <input
                    className="input w-full"
                    value={deleteTyped}
                    onChange={(e) => setDeleteTyped(e.target.value)}
                    placeholder={client.contact_name || client.name}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setDeleteStep(0); setDeleteTyped('') }} className="btn-secondary flex-1">Cancel</button>
                    <button
                      onClick={handleDelete}
                      disabled={(deleteTyped !== (client.contact_name || client.name)) || deleting}
                      className="flex-1 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-1.5">
                      {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Delete permanently
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showTeamModal && (
        <AssignTeamModal
          clientId={id}
          creatives={allCreatives}
          assignedIds={assignedIds}
          onClose={() => setShowTeamModal(false)}
          onSave={(newIds) => {
            setAssignedIds(newIds)
            setAssignedProfiles(allCreatives.filter((c) => newIds.includes(c.id)))
          }}
        />
      )}
    </div>
  )
}
