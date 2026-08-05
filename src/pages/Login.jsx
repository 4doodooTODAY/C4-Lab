import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, ArrowLeft, ArrowRight, Mail, Eye, EyeOff,
  Camera, Scissors, Sparkles, Check, MessageSquareText,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Capacitor } from '@capacitor/core'
import LogoBadge from '../components/ui/Logo'
import FallingDisks from '../components/ui/FallingDisks'

// On a phone, auto-focusing a field pops the keyboard the instant the app
// opens, covering the screen. Only autofocus on the web.
const AUTOFOCUS = !Capacitor.isNativePlatform()

// The two paths people can apply through. Clients don't self-apply; they get an
// invite link by text and email, so they're intentionally not an option here.
const ROLES = {
  creative: {
    label: 'Creative',
    tagline: 'Photographer, videographer, or marketing agency',
    icon: Camera,
    // stored on the application so the team knows who's knocking
    note: 'Creative (photographer / videographer / marketing agency)',
  },
  visionary: {
    label: 'Visionary',
    tagline: 'An editor ready to apply and join the team',
    icon: Scissors,
    note: 'Visionary / Editor (applying to join)',
  },
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [mode, setMode] = useState('login') // 'login' | 'forgot' | 'choose' | 'apply'
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')

  const [applyRole, setApplyRole] = useState(null) // 'creative' | 'visionary'
  const [applyEmail, setApplyEmail] = useState('')
  const [applyName, setApplyName] = useState('')
  const [applyPhone, setApplyPhone] = useState('')
  const [applyNotes, setApplyNotes] = useState('')
  const [applyLoading, setApplyLoading] = useState(false)
  const [applyStatus, setApplyStatus] = useState(null) // 'success' | 'already' | 'error' | null

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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'forgot_password', email: resetEmail.trim() }),
      })
      if (!res.ok) throw new Error('Could not send the reset email. Try again.')
      setResetSent(true)
    } catch (err) {
      setResetError(err.message)
    } finally {
      setResetLoading(false)
    }
  }

  const openChoose = () => {
    setMode('choose')
    setApplyStatus(null)
  }

  const chooseRole = (role) => {
    setApplyRole(role)
    setApplyStatus(null)
    setMode('apply')
  }

  const handleApply = async (e) => {
    e.preventDefault()
    setApplyLoading(true)
    setApplyStatus(null)
    try {
      const roleNote = ROLES[applyRole]?.note || 'Applicant'
      // Reuse the waitlist pipeline: it stores the application and emails the
      // team. The role is prepended to notes so it lands in that one email.
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          name: applyName.trim(),
          email: applyEmail.trim(),
          role: applyRole,
          phone: applyPhone.trim(),
          notes: `[Applying as: ${roleNote} | Phone: ${applyPhone.trim() || 'not given'}] ${applyNotes.trim()}`.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'failed')
      setApplyStatus(data.status === 'already' ? 'already' : 'success')
    } catch {
      setApplyStatus('error')
    }
    setApplyLoading(false)
  }

  return (
    <div
      className="app-ground min-h-screen flex items-center justify-center p-4"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <FallingDisks />
      <div className="relative z-10 w-full max-w-4xl grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-center">
        {/* Brand + display moment */}
        <div className="space-y-6">
          <div className="anim-rise flex items-center gap-3">
            <div className="shrink-0"><LogoBadge size={40} /></div>
            <div>
              <p className="font-display text-text-primary font-semibold leading-tight">C4C Lab</p>
              <p className="text-text-muted text-xs leading-tight">Connect Four Creative</p>
            </div>
          </div>
          <h1 className="anim-rise d1 display max-w-md">Four Moves Ahead</h1>
          <p className="anim-rise d2 text-text-secondary text-sm max-w-sm leading-relaxed">
            Shoots, edits, reviews, and approvals for your whole team, in one place.
          </p>
        </div>

        <div className="w-full max-w-sm justify-self-center lg:justify-self-end">
          <div className="anim-rise d2 card p-6">

            {/* ── SIGN IN ── */}
            {mode === 'login' && (
              <>
                <h2 className="font-display text-xl text-text-primary mb-0.5">Sign in</h2>
                <p className="text-sm text-text-muted mb-5">Welcome back to the fource.</p>

                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <label className="label">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com" className="input" required autoFocus={AUTOFOCUS} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="label mb-0">Password</label>
                      <button type="button"
                        onClick={() => { setMode('forgot'); setResetEmail(email); setResetSent(false); setResetError('') }}
                        className="text-xs text-accent hover:underline">
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={password}
                        onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                        className="input pr-10" required />
                      <button type="button" onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {loginError && (
                    <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-sm px-3 py-2">{loginError}</p>
                  )}

                  <button type="submit" disabled={loginLoading}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                    {loginLoading && <Loader2 size={14} className="animate-spin" />}
                    Sign in
                  </button>
                </form>

                {/* Create account entry */}
                <div className="flex items-center gap-3 my-4">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-text-muted uppercase tracking-wider">New here?</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <button onClick={openChoose}
                  className="btn-secondary w-full flex items-center justify-center gap-2">
                  Create an account <ArrowRight size={14} />
                </button>
              </>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {mode === 'forgot' && (
              <>
                <button onClick={() => setMode('login')}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary mb-4 transition-colors">
                  <ArrowLeft size={13} /> Back to sign in
                </button>

                {resetSent ? (
                  <div className="text-center py-2">
                    <div className="w-12 h-12 rounded-full bg-status-approved-bg flex items-center justify-center mx-auto mb-3">
                      <Mail size={20} className="text-status-approved" />
                    </div>
                    <h2 className="font-display text-lg text-text-primary mb-1">Check your email</h2>
                    <p className="text-sm text-text-muted mb-4">
                      Your reset link is on its way to <span className="font-medium text-text-primary">{resetEmail}</span>.
                    </p>
                    <button onClick={() => setMode('login')} className="btn-secondary w-full">Back to sign in</button>
                  </div>
                ) : (
                  <>
                    <h2 className="font-display text-xl text-text-primary mb-0.5">Reset password</h2>
                    <p className="text-sm text-text-muted mb-5">Enter your email and you'll get a reset link.</p>
                    <form onSubmit={handleForgot} className="space-y-3">
                      <div>
                        <label className="label">Email</label>
                        <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="you@example.com" className="input" required autoFocus={AUTOFOCUS} />
                      </div>
                      {resetError && (
                        <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-sm px-3 py-2">{resetError}</p>
                      )}
                      <button type="submit" disabled={resetLoading}
                        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                        {resetLoading && <Loader2 size={14} className="animate-spin" />}
                        Send reset link
                      </button>
                    </form>
                  </>
                )}
              </>
            )}

            {/* ── CHOOSE ROLE ── */}
            {mode === 'choose' && (
              <>
                <button onClick={() => setMode('login')}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary mb-4 transition-colors">
                  <ArrowLeft size={13} /> Back to sign in
                </button>

                <h2 className="font-display text-xl text-text-primary mb-0.5">Which four-ce are you?</h2>
                <p className="text-sm text-text-muted mb-5">Pick the one that fits and we'll connect.</p>

                <div className="space-y-3">
                  {Object.entries(ROLES).map(([key, r], i) => {
                    const Icon = r.icon
                    return (
                      <button key={key} onClick={() => chooseRole(key)}
                        className={`anim-rise d${i + 1} w-full text-left flex items-center gap-3 rounded-lg border border-border bg-surface/40 p-4 hover:border-accent/50 hover:bg-accent/5 transition-all group`}>
                        <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                          <Icon size={20} className="text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text-primary">{r.label}</p>
                          <p className="text-xs text-text-muted leading-snug">{r.tagline}</p>
                        </div>
                        <ArrowRight size={16} className="text-text-muted group-hover:text-accent transition-colors shrink-0" />
                      </button>
                    )
                  })}
                </div>

                {/* Clients don't self-apply */}
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface/40 border border-border px-3 py-2.5">
                  <MessageSquareText size={13} className="text-text-muted shrink-0 mt-0.5" />
                  <p className="text-[11px] text-text-muted leading-snug">
                    A client? No sign-up needed. Your creative sends you a join link by text and email.
                  </p>
                </div>
              </>
            )}

            {/* ── APPLY ── */}
            {mode === 'apply' && (
              <>
                <button onClick={() => setMode('choose')}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary mb-4 transition-colors">
                  <ArrowLeft size={13} /> Back
                </button>

                {applyStatus === 'success' ? (
                  <div className="text-center py-2">
                    <div className="w-12 h-12 rounded-full bg-status-approved-bg flex items-center justify-center mx-auto mb-3">
                      <Check size={20} className="text-status-approved" />
                    </div>
                    <h2 className="font-display text-lg text-text-primary mb-1">You're on the four-cast</h2>
                    <p className="text-sm text-text-muted mb-4">
                      Application in. If it's a fit, we'll connect and send your invite. Keep an eye on your inbox.
                    </p>
                    <button onClick={() => setMode('login')} className="btn-secondary w-full">Back to sign in</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Sparkles size={16} className="text-accent" />
                      <h2 className="font-display text-xl text-text-primary">Apply as {ROLES[applyRole]?.label}</h2>
                    </div>
                    <p className="text-sm text-text-muted mb-5">{ROLES[applyRole]?.tagline}.</p>

                    <form onSubmit={handleApply} className="space-y-3">
                      <div>
                        <label className="label">Your name</label>
                        <input type="text" value={applyName} onChange={(e) => setApplyName(e.target.value)}
                          placeholder="Full name" className="input" required autoFocus={AUTOFOCUS} />
                      </div>
                      <div>
                        <label className="label">Email</label>
                        <input type="email" value={applyEmail} onChange={(e) => setApplyEmail(e.target.value)}
                          placeholder="you@email.com" className="input" required />
                      </div>
                      <div>
                        <label className="label">Phone number</label>
                        <input type="tel" value={applyPhone} onChange={(e) => setApplyPhone(e.target.value)}
                          placeholder="(555) 555-5555" className="input" required />
                      </div>
                      <div>
                        <label className="label">
                          {applyRole === 'creative' ? 'What do you shoot, and a link to your work' : 'Your editing style, and a link to your reel'}
                        </label>
                        <textarea value={applyNotes} onChange={(e) => setApplyNotes(e.target.value)}
                          placeholder={applyRole === 'creative'
                            ? 'e.g. Real estate + weddings. Portfolio: ...'
                            : 'e.g. Short-form social edits. Reel: ...'}
                          rows={3} className="input resize-none" />
                      </div>

                      {applyStatus === 'already' && (
                        <p className="text-xs text-text-muted">That email already applied. We'll be in touch.</p>
                      )}
                      {applyStatus === 'error' && (
                        <p className="text-xs text-status-overdue-text">Something went wrong. Try again.</p>
                      )}

                      <button type="submit" disabled={applyLoading}
                        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                        {applyLoading && <Loader2 size={14} className="animate-spin" />}
                        Send application
                      </button>
                    </form>
                  </>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
