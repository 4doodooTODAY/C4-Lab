import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Check, Lock, Unlock, Trash2, Mail, Key, AlertTriangle, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, formatDistanceToNow } from 'date-fns'

const ROLES = ['creative', 'client', 'admin']
const ROLE_COLORS = {
  admin:    'text-purple-700 bg-purple-50 border-purple-200',
  creative: 'text-blue-700 bg-blue-50 border-blue-200',
  client:   'text-green-700 bg-green-50 border-green-200',
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

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

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()

  const [profile, setProfile] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)

  const [locking, setLocking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteStep, setDeleteStep] = useState(0)
  const [deleteTyped, setDeleteTyped] = useState('')

  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const [profileRes, authRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        callAction({ action: 'get_user', user_id: id }, session),
      ])
      if (profileRes.data) {
        setProfile(profileRes.data)
        setEditName(profileRes.data.full_name || '')
        setEditRole(profileRes.data.role || 'creative')
      }
      if (authRes.user) {
        setAuthUser(authRes.user)
        setEditEmail(authRes.user.email || '')
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
      await callAction({ action: 'update_user', user_id: id, email: editEmail, full_name: editName, role: editRole }, session)
      setProfile((p) => ({ ...p, full_name: editName, role: editRole }))
      setAuthUser((u) => ({ ...u, email: editEmail }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSetPassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    setPwSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await callAction({ action: 'set_password', user_id: id, password: newPassword }, session)
      setNewPassword('')
      setPwSaved(true)
      setTimeout(() => setPwSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setPwSaving(false)
    }
  }

  const handleResetEmail = async () => {
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await callAction({ action: 'reset_password', email: editEmail }, session)
      alert(`Password reset email sent to ${editEmail}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleLockToggle = async () => {
    const isLocked = !!authUser?.banned_until
    setLocking(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await callAction({ action: isLocked ? 'unlock_user' : 'lock_user', user_id: id }, session)
      setAuthUser((u) => ({ ...u, banned_until: isLocked ? null : new Date(Date.now() + 1e12).toISOString() }))
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
      await callAction({ action: 'delete_user', user_id: id }, session)
      navigate('/admin/users')
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-24"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
  )

  const isLocked = !!authUser?.banned_until
  const lastSeen = authUser?.last_sign_in_at
  const createdAt = authUser?.created_at

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to Users
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center text-accent text-lg font-bold shrink-0">
          {getInitials(profile?.full_name)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary">{profile?.full_name || '—'}</h1>
            {isLocked && (
              <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                Locked
              </span>
            )}
          </div>
          <p className="text-text-muted text-sm">{authUser?.email}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
            {lastSeen && <span>Last seen {formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}</span>}
            {createdAt && <span>· Joined {format(new Date(createdAt), 'MMM d, yyyy')}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Edit profile */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Account Info</h2>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Full Name</label>
              <input className="input w-full" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
              <input type="email" className="input w-full" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">Role</label>
              <div className="flex gap-2">
                {ROLES.map((r) => (
                  <button key={r} type="button" onClick={() => setEditRole(r)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all capitalize ${
                      editRole === r ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-surface-2'
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
              {saved ? 'Saved!' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Activity */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Activity</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Last sign in</span>
              <span className="text-text-primary font-medium">
                {lastSeen ? format(new Date(lastSeen), 'MMM d, yyyy h:mm a') : 'Never'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Account created</span>
              <span className="text-text-primary font-medium">
                {createdAt ? format(new Date(createdAt), 'MMM d, yyyy') : '—'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Status</span>
              <span className={`font-medium ${isLocked ? 'text-red-600' : profile?.must_change_password ? 'text-amber-600' : 'text-green-600'}`}>
                {isLocked
                  ? 'Locked'
                  : profile?.must_change_password
                  ? 'Invite pending'
                  : lastSeen
                  ? `Active ${formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}`
                  : 'Active'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Email confirmed</span>
              <span className={`font-medium ${authUser?.email_confirmed_at ? 'text-green-600' : 'text-amber-600'}`}>
                {authUser?.email_confirmed_at ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Password</h2>
          <form onSubmit={handleSetPassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Set New Password</label>
              <input type="password" className="input w-full" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={pwSaving || !newPassword} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                {pwSaving ? <Loader2 size={13} className="animate-spin" /> : pwSaved ? <Check size={13} /> : <Key size={13} />}
                {pwSaved ? 'Password set!' : 'Set Password'}
              </button>
              <button type="button" onClick={handleResetEmail} className="btn-secondary flex items-center gap-1.5">
                <Mail size={13} /> Send Reset Email
              </button>
            </div>
          </form>
        </div>

        {/* Danger zone */}
        {currentUser?.id !== id && (
          <div className="card p-6 border-red-100">
            <h2 className="text-sm font-semibold text-red-600 mb-4">Danger Zone</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">{isLocked ? 'Unlock account' : 'Lock account'}</p>
                  <p className="text-xs text-text-muted">{isLocked ? 'Allow this user to sign in again' : 'Prevent this user from signing in'}</p>
                </div>
                <button onClick={handleLockToggle} disabled={locking}
                  className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
                    isLocked ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                  }`}>
                  {locking ? <Loader2 size={13} className="animate-spin" /> : isLocked ? <Unlock size={13} /> : <Lock size={13} />}
                  {isLocked ? 'Unlock' : 'Lock'}
                </button>
              </div>

              <div className="border-t border-border pt-3">
                {deleteStep === 0 && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-primary">Delete account</p>
                      <p className="text-xs text-text-muted">Permanently remove this user</p>
                    </div>
                    <button onClick={() => setDeleteStep(1)}
                      className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-all">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                )}
                {deleteStep === 1 && (
                  <div className="space-y-2">
                    <p className="text-sm text-text-primary">Type <strong>{profile?.full_name}</strong> to confirm:</p>
                    <input className="input w-full" value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder={profile?.full_name} />
                    <div className="flex gap-2">
                      <button onClick={() => { setDeleteStep(0); setDeleteTyped('') }} className="btn-secondary flex-1">Cancel</button>
                      <button onClick={handleDelete} disabled={deleteTyped !== profile?.full_name || deleting}
                        className="flex-1 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
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
    </div>
  )
}
