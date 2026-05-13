import { useState, useEffect } from 'react'
import { Plus, X, Loader2, Users, Copy, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDistanceToNow } from 'date-fns'

const ROLES = ['creative', 'client', 'admin']
const ROLE_COLORS = {
  admin:    'bg-purple-100 text-purple-700',
  creative: 'bg-blue-100 text-blue-700',
  client:   'bg-green-100 text-green-700',
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function CreateUserModal({ onClose, onCreated }) {
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

  if (sent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 z-10 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={22} className="text-green-600" />
          </div>
          <h2 className="text-base font-semibold text-text-primary mb-1">Invite sent!</h2>
          <p className="text-sm text-text-secondary mb-5">
            {email} will receive an email with a link to set their password and access C4 Lab.
          </p>
          <button onClick={onClose} className="btn-primary w-full">Done</button>
        </div>
      </div>
    )
  }

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
            They'll receive an email invite with a link to set their own password.
          </p>

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Send Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Users</h1>
          <p className="text-sm text-text-secondary mt-0.5">Manage team and client accounts</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Create Account
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : users.length === 0 ? (
        <div className="card p-12 text-center">
          <Users size={36} className="mx-auto text-surface-3 mb-3" />
          <p className="text-sm text-text-muted">No users yet — create the first account</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">User</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Role</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-semibold shrink-0">
                        {getInitials(u.full_name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{u.full_name || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[u.role] || 'bg-surface-3 text-text-muted'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.must_change_password ? (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        Pending first login
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CreateUserModal onClose={() => setShowModal(false)} onCreated={fetchUsers} />
      )}
    </div>
  )
}
