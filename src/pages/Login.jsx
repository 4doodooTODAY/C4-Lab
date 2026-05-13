import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistStatus, setWaitlistStatus] = useState(null) // 'success' | 'error' | null

  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleWaitlist = async (e) => {
    e.preventDefault()
    setWaitlistLoading(true)
    setWaitlistStatus(null)
    const { error } = await supabase.from('waitlist').insert([{ email: waitlistEmail.trim() }])
    if (error) {
      setWaitlistStatus(error.code === '23505' ? 'already' : 'error')
    } else {
      setWaitlistStatus('success')
      setWaitlistEmail('')
    }
    setWaitlistLoading(false)
  }

  return (
    <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center p-4 gap-6">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-base leading-none">C4</span>
        </div>
        <div>
          <p className="text-white font-semibold leading-tight">C4 Lab</p>
          <p className="text-white/40 text-xs leading-tight">Connect Four Creative</p>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {/* Login card */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h1 className="text-lg font-bold text-text-primary mb-0.5">Sign in</h1>
          <p className="text-sm text-text-muted mb-5">Access is by invitation only</p>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                required
              />
            </div>

            {loginError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loginLoading && <Loader2 size={14} className="animate-spin" />}
              Sign In
            </button>
          </form>
        </div>

        {/* Waitlist card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <p className="text-white/80 text-sm leading-relaxed mb-4">
            We're launching with a private system for our internal team and clients, while building a
            curated waitlist of agencies and creatives for early access. This allows us to refine the
            platform in real-time while generating a pipeline of high-quality users ahead of a full release.
          </p>

          {waitlistStatus === 'success' ? (
            <p className="text-sm font-medium text-green-400">
              ✓ You're on the list — we'll be in touch.
            </p>
          ) : (
            <form onSubmit={handleWaitlist} className="flex gap-2">
              <input
                type="email"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                required
              />
              <button
                type="submit"
                disabled={waitlistLoading}
                className="btn-primary shrink-0 flex items-center gap-1.5 disabled:opacity-50"
              >
                {waitlistLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                Join the Waitlist
              </button>
            </form>
          )}

          {waitlistStatus === 'already' && (
            <p className="text-xs text-white/50 mt-2">That email is already on the waitlist.</p>
          )}
          {waitlistStatus === 'error' && (
            <p className="text-xs text-red-400 mt-2">Something went wrong — try again.</p>
          )}
        </div>
      </div>
    </div>
  )
}
