import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Loader2, Users, Check, Trash2, AlertTriangle, Mail, ChevronRight, Shield, Palette, Briefcase } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, formatDistanceToNow, startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import Avatar, { TagBadge } from '../../components/ui/Avatar'

const ROLES = ['creative', 'editor', 'client', 'admin']

// ─── Weekly per-user stats ────────────────────────────────────────────────────
function MiniRing({ value, peak, color, size = 56, stroke = 6 }) {
  const R = (size - stroke) / 2
  const circ = 2 * Math.PI * R
  const fill = peak > 0 ? Math.min(value / peak, 1) : 0
  const offset = circ * (1 - fill)
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={R} fill="none" stroke="#f1f0fe" strokeWidth={stroke} />
      {value > 0 && (
        <circle cx={c} cy={c} r={R} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: 'stroke-dashoffset 0.35s ease' }} />
      )}
    </svg>
  )
}

function WeeklyUserStats() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [creatives, setCreatives] = useState([])  // { id, full_name, avatar_url, count }
  const [editors,   setEditors]   = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const base     = startOfWeek(new Date(), { weekStartsOn: 1 })
      const wkStart  = addWeeks(base, weekOffset)
      const wkEnd    = endOfWeek(wkStart, { weekStartsOn: 1 })
      const wkStartD = format(wkStart, 'yyyy-MM-dd')
      const wkEndD   = format(wkEnd,   'yyyy-MM-dd')

      const [profilesRes, shootsRes, revisionsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, role')
          .in('role', ['creative', 'editor'])
          .order('full_name'),
        // Shoots done by photographer this week
        supabase.from('shoots').select('photographer_id')
          .not('photographer_id', 'is', null)
          .gte('shoot_date', wkStartD)
          .lte('shoot_date', wkEndD),
        // Revisions uploaded by editor this week
        supabase.from('project_revisions').select('uploaded_by')
          .not('uploaded_by', 'is', null)
          .gte('created_at', wkStart.toISOString())
          .lte('created_at', wkEnd.toISOString()),
      ])

      if (cancelled) return

      const profiles = profilesRes.data || []

      // Count shoots per photographer
      const shootCounts = {}
      ;(shootsRes.data || []).forEach(({ photographer_id }) => {
        shootCounts[photographer_id] = (shootCounts[photographer_id] || 0) + 1
      })

      // Count revisions per editor
      const revCounts = {}
      ;(revisionsRes.data || []).forEach(({ uploaded_by }) => {
        revCounts[uploaded_by] = (revCounts[uploaded_by] || 0) + 1
      })

      const creativeList = profiles
        .filter((p) => p.role === 'creative')
        .map((p) => ({ ...p, count: shootCounts[p.id] || 0 }))

      const editorList = profiles
        .filter((p) => p.role === 'editor')
        .map((p) => ({ ...p, count: revCounts[p.id] || 0 }))

      const peakC = Math.max(...creativeList.map((p) => p.count), 1)
      const peakE = Math.max(...editorList.map((p) => p.count), 1)

      setCreatives(creativeList.map((p) => ({ ...p, peak: peakC })))
      setEditors(editorList.map((p) => ({ ...p, peak: peakE })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [weekOffset])

  const base      = startOfWeek(new Date(), { weekStartsOn: 1 })
  const wkStart   = addWeeks(base, weekOffset)
  const wkEnd     = endOfWeek(wkStart, { weekStartsOn: 1 })
  const isCurrent = weekOffset === 0
  const weekLabel = isCurrent
    ? 'This Week'
    : `${format(wkStart, 'MMM d')} – ${format(wkEnd, 'MMM d')}`

  const UserCard = ({ user, color, sublabel }) => (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className="relative">
        <MiniRing value={user.count} peak={user.peak} color={color} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-bold text-text-primary">{user.count}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-medium text-text-primary truncate max-w-[72px]">
          {user.full_name?.split(' ')[0] || '—'}
        </p>
        <p className="text-[10px] text-text-muted">{sublabel}</p>
      </div>
    </div>
  )

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Weekly Output</h2>
          <p className="text-xs text-text-muted mt-0.5">Shoots done · Revisions submitted</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset((o) => o - 1)}
            className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-surface-3 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="text-xs font-medium text-text-secondary w-36 text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset((o) => Math.min(0, o + 1))} disabled={isCurrent}
            className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-surface-3 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-5">
          {/* Creatives / Photographers */}
          {creatives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-3">Photographers · shoots</p>
              <div className="flex gap-6 flex-wrap">
                {creatives.map((u) => <UserCard key={u.id} user={u} color="#6C63FF" sublabel="shoots" />)}
              </div>
            </div>
          )}
          {/* Editors */}
          {editors.length > 0 && creatives.length > 0 && (
            <div className="border-t border-border pt-4" />
          )}
          {editors.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-3">Editors · revisions</p>
              <div className="flex gap-6 flex-wrap">
                {editors.map((u) => <UserCard key={u.id} user={u} color="#10b981" sublabel="submitted" />)}
              </div>
            </div>
          )}
          {creatives.length === 0 && editors.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">No creatives or editors yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

function callUserAction(body, session) {
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  })
}

function InviteModal({ onClose, onCreated }) {
  const { createUser } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('creative')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createUser({ email: email.trim(), full_name: fullName.trim(), role })
      setSent(true)
      onCreated()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (sent) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 z-10 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <Check size={22} className="text-green-600" />
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1">Invite sent!</h2>
        <p className="text-sm text-text-secondary mb-5">
          {email} will receive an email with a link to set their password.
        </p>
        <button onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-text-primary">Invite User</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith" className="input" autoFocus required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com" className="input" required />
          </div>
          <div>
            <label className="label">Role</label>
            <div className="flex gap-2">
              {ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                    role === r ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-surface-2'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-text-muted bg-surface-2 rounded-lg px-3 py-2">
            They'll get an email with a link to set their own password.
          </p>
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Send Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteModal({ user, onClose, onDeleted }) {
  const [step, setStep] = useState(1)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setStep(3)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await callUserAction({ action: 'delete_user', user_id: user.id }, session)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err.message)
      setStep(2)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={step !== 3 ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        {step === 1 && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text-primary">Remove user?</h2>
                <p className="text-xs text-text-muted">This will delete {user.full_name}'s account.</p>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-5">All data will be permanently removed. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => setStep(2)} className="flex-1 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
                Yes, remove
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text-primary">Are you sure?</h2>
                <p className="text-xs text-text-muted">Type their name to confirm.</p>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              Type <span className="font-semibold text-text-primary">{user.full_name}</span> to confirm.
            </p>
            <input className="input w-full mb-4" placeholder={user.full_name}
              value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDelete} disabled={typed !== user.full_name}
                className="flex-1 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium">
                Delete permanently
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <div className="text-center py-4">
            <Loader2 size={24} className="animate-spin text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-secondary">Removing user...</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section config ───────────────────────────────────────────────────────────
const SECTIONS = [
  { role: 'admin',    label: 'Admins',    icon: Shield,   color: 'text-purple-600', bg: 'bg-purple-50' },
  { role: 'creative', label: 'Creatives', icon: Palette,  color: 'text-blue-600',   bg: 'bg-blue-50'   },
  { role: 'editor',   label: 'Editors',   icon: Briefcase, color: 'text-green-600',  bg: 'bg-green-50'  },
]

function UserRow({ u, onDelete, onNavigate, onResend, resending, resent }) {
  const isPending = u.must_change_password
  return (
    <tr
      className="hover:bg-surface-2 transition-colors cursor-pointer"
      onClick={() => onNavigate(u.id)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={u.full_name} url={u.avatar_url} size={8} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary leading-tight">{u.full_name || '—'}</p>
            {u.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {u.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {isPending ? (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Invite pending</span>
        ) : (
          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 justify-end">
          {isPending && (
            <button onClick={() => onResend(u)} disabled={resending === u.id}
              className="flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50">
              {resending === u.id ? <Loader2 size={11} className="animate-spin" /> :
                resent === u.id ? <Check size={11} className="text-green-500" /> : <Mail size={11} />}
              {resent === u.id ? 'Sent!' : 'Resend'}
            </button>
          )}
          <button onClick={() => onDelete(u)}
            className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
          <ChevronRight size={14} className="text-text-muted" />
        </div>
      </td>
    </tr>
  )
}

export default function UserManagement() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [resending, setResending] = useState(null)
  const [resent, setResent] = useState(null)

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name', { ascending: true })
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const handleResend = async (user) => {
    setResending(user.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await callUserAction({ action: 'resend_invite', email: user.email || '', full_name: user.full_name, role: user.role }, session)
      setResent(user.id)
      setTimeout(() => setResent(null), 3000)
    } catch (err) { console.error(err) }
    finally { setResending(null) }
  }

  const byRole = (role) => users.filter((u) => u.role === role)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Users</h1>
          <p className="text-sm text-text-secondary mt-0.5">{users.length} total · manage team and client accounts</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Invite User
        </button>
      </div>

      <WeeklyUserStats />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(({ role, label, icon: Icon, color, bg }) => {
            const group = byRole(role)
            return (
              <div key={role}>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-6 h-6 rounded-md ${bg} flex items-center justify-center`}>
                    <Icon size={13} className={color} />
                  </div>
                  <h2 className="text-sm font-semibold text-text-primary">{label}</h2>
                  <span className="text-xs text-text-muted">({group.length})</span>
                </div>

                {group.length === 0 ? (
                  <div className="card px-4 py-5 text-sm text-text-muted">No {label.toLowerCase()} yet.</div>
                ) : (
                  <div className="card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-surface-2">
                          <th className="text-left text-xs font-semibold text-text-muted px-4 py-2.5">Name</th>
                          <th className="text-left text-xs font-semibold text-text-muted px-4 py-2.5">Status</th>
                          <th className="text-left text-xs font-semibold text-text-muted px-4 py-2.5">Added</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.map((u) => (
                          <UserRow
                            key={u.id}
                            u={u}
                            onNavigate={(id) => navigate(`/admin/users/${id}`)}
                            onDelete={setDeleteTarget}
                            onResend={handleResend}
                            resending={resending}
                            resent={resent}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onCreated={fetchUsers} />}
      {deleteTarget && (
        <DeleteModal user={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={fetchUsers} />
      )}
    </div>
  )
}
