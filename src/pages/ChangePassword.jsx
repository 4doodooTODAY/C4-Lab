import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock, User, Mail, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ROLE_LABELS = { admin: 'Admin', creative: 'Creative', client: 'Client' }
const ROLE_COLORS = {
  admin:    'text-purple-700 bg-purple-50',
  creative: 'text-blue-700 bg-blue-50',
  client:   'text-green-700 bg-green-50',
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function ChangePassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { profile, user } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setLoading(false); return }

    await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id)

    navigate('/')
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-base leading-none">C4</span>
          </div>
          <div>
            <p className="text-white font-semibold leading-tight">C4 Lab</p>
            <p className="text-white/40 text-xs leading-tight">Connect Four Creative</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="px-6 pt-6 pb-5 border-b border-border">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Lock size={16} className="text-accent" />
              </div>
              <div>
                <h1 className="text-base font-bold text-text-primary">Welcome to C4 Lab</h1>
                <p className="text-xs text-text-muted">Create your password to get started</p>
              </div>
            </div>
          </div>

          {/* Account info — pre-filled by admin, read only */}
          <div className="px-6 py-4 bg-surface-2 border-b border-border space-y-3">
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Your account</p>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center shrink-0 text-accent text-xs font-bold">
                {getInitials(profile?.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {profile?.full_name || '—'}
                </p>
                <p className="text-xs text-text-muted truncate">{user?.email || '—'}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize shrink-0 ${ROLE_COLORS[profile?.role] || 'bg-surface-3 text-text-muted'}`}>
                {ROLE_LABELS[profile?.role] || profile?.role || '—'}
              </span>
            </div>
          </div>

          {/* Password form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
            <div>
              <label className="label">Create Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="input"
                required
                minLength={8}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Same as above"
                className="input"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Set Password & Enter C4 Lab
            </button>
          </form>
        </div>

        <p className="text-center text-white/30 text-xs mt-5">
          This link was sent by your C4 Lab admin. If you weren't expecting this, ignore it.
        </p>
      </div>
    </div>
  )
}
