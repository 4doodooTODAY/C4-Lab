import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ArrowLeft, Mail, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')

  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistName, setWaitlistName] = useState('')
  const [waitlistNotes, setWaitlistNotes] = useState('')
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

  const handleForgot = async (e) => {
    e.preventDefault()
    setResetLoading(true)
    setResetError('')
    try {
      // Branded reset email (from C4C Lab) with a scanner-proof token link —
      // avoids Supabase's default sender and redirect-allowlist pitfalls.
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'forgot_password', email: resetEmail.trim() }),
      })
      if (!res.ok) throw new Error('Could not send the reset email — try again.')
      setResetSent(true)
    } catch (err) {
      setResetError(err.message)
    } finally {
      setResetLoading(false)
    }
  }

  const handleWaitlist = async (e) => {
    e.preventDefault()
    setWaitlistLoading(true)
    setWaitlistStatus(null)
    try {
      // Edge function stores the signup AND emails the team — one email per signup
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          name: waitlistName.trim(),
          email: waitlistEmail.trim(),
          notes: waitlistNotes.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'failed')
      if (data.status === 'already') {
        setWaitlistStatus('already')
      } else {
        setWaitlistStatus('success')
        setWaitlistEmail(''); setWaitlistName(''); setWaitlistNotes('')
      }
    } catch {
      setWaitlistStatus('error')
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
        {/* Login / Forgot card */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">

          {/* ── LOGIN VIEW ── */}
          {mode === 'login' && (
            <>
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">Password</label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setResetEmail(email); setResetSent(false); setResetError('') }}
                      className="text-xs text-accent hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                      title={showPassword ? 'Hide password' : 'Show password'}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
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
            </>
          )}

          {/* ── FORGOT PASSWORD VIEW ── */}
          {mode === 'forgot' && (
            <>
              <button
                onClick={() => setMode('login')}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary mb-4 transition-colors"
              >
                <ArrowLeft size={13} /> Back to sign in
              </button>

              {resetSent ? (
                <div className="text-center py-2">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <Mail size={20} className="text-green-600" />
                  </div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Check your email</h2>
                  <p className="text-sm text-text-muted mb-4">
                    We sent a reset link to <span className="font-medium text-text-primary">{resetEmail}</span>.
                    Click it to set a new password.
                  </p>
                  <button onClick={() => setMode('login')} className="btn-secondary w-full">
                    Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-text-primary mb-0.5">Reset password</h2>
                  <p className="text-sm text-text-muted mb-5">
                    Enter your email and we'll send you a reset link.
                  </p>
                  <form onSubmit={handleForgot} className="space-y-3">
                    <div>
                      <label className="label">Email</label>
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="input"
                        required
                        autoFocus
                      />
                    </div>
                    {resetError && (
                      <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        {resetError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {resetLoading && <Loader2 size={14} className="animate-spin" />}
                      Send Reset Link
                    </button>
                  </form>
                </>
              )}
            </>
          )}
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
            <form onSubmit={handleWaitlist} className="space-y-2">
              <div className="flex gap-2 flex-col sm:flex-row">
                <input
                  type="text"
                  value={waitlistName}
                  onChange={(e) => setWaitlistName(e.target.value)}
                  placeholder="Your name"
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  required
                />
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  required
                />
              </div>
              <textarea
                value={waitlistNotes}
                onChange={(e) => setWaitlistNotes(e.target.value)}
                placeholder="Optional — tell us what area you work in (photography, video, agency…)"
                rows={2}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
              />
              <button
                type="submit"
                disabled={waitlistLoading}
                className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
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
