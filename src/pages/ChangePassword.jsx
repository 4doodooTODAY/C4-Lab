import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Lock, Camera, ArrowRight, Check, Eye, EyeOff, KeyRound, AlertTriangle } from 'lucide-react'
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

function roleHome(role) {
  if (role === 'admin') return '/admin'
  if (role === 'creative' || role === 'editor') return '/dashboard'
  return '/client'
}

export default function ChangePassword() {
  const [step, setStep] = useState(1) // 1 = set password, 2 = upload photo
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const { profile, user, patchProfile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // ── Invite / recovery link handling (token_hash flow) ──────────────────────
  // Emails link here with ?token_hash=…&type=invite|recovery. The token is
  // single-use, so we DON'T redeem it automatically — email security scanners
  // load pages, and auto-redeeming would burn the link before the human
  // arrives. The person clicks the button; only then do we verify.
  const tokenHash = searchParams.get('token_hash')
  const tokenType = searchParams.get('type') === 'recovery' ? 'recovery' : 'invite'
  const [redeeming, setRedeeming] = useState(false)
  const [redeemError, setRedeemError] = useState('')

  const redeemToken = async () => {
    setRedeeming(true)
    setRedeemError('')
    const { error: otpErr } = await supabase.auth.verifyOtp({
      type: tokenType, token_hash: tokenHash,
    })
    if (otpErr) {
      setRedeemError(
        /expired|invalid/i.test(otpErr.message)
          ? 'This link has expired or was already used. Ask your admin to send a new one.'
          : otpErr.message
      )
      setRedeeming(false)
      return
    }
    // Session is live — drop the token from the URL and continue to password setup
    window.history.replaceState({}, '', '/change-password')
    setRedeeming(false)
  }

  // No token and no session → nothing to do here
  useEffect(() => {
    if (!tokenHash && !authLoading && !user) navigate('/login', { replace: true })
  }, [tokenHash, authLoading, user, navigate])

  // ── Step 1: Set password ───────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')

    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — please try again')), 10000)
      )
      const update = supabase.auth.updateUser({ password })
      const { error: updateError } = await Promise.race([update, timeout])
      if (updateError) {
        const msg = updateError.message || ''
        if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('token')) {
          setError('Your invite link has expired. Ask your admin to resend the invite.')
        } else {
          setError(updateError.message)
        }
        setLoading(false)
        return
      }

      // Clear the must_change_password flag — and WAIT for it. If this is only
      // fire-and-forget, the cached profile still says the password needs
      // changing, so ProtectedRoute bounces the user straight back here and
      // they get stuck in a loop. Update the DB, then update the in-memory
      // profile + cache so the guard lets them through.
      const { error: flagErr } = await supabase
        .from('profiles').update({ must_change_password: false }).eq('id', user.id)
      if (flagErr) console.error('Failed to clear must_change_password:', flagErr)
      patchProfile({ must_change_password: false })

      setStep(2)
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // ── Step 2: Photo upload ───────────────────────────────────────────────────
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG or PNG).')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Photo is too large — please pick one under 5 MB.')
      return
    }
    setError('')
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleUploadAndFinish = async () => {
    if (!photoFile) { finish(); return }
    setUploading(true)
    try {
      const ext = photoFile.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`
      // Never let a hung storage request block signup — 15s cap, then move on
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Upload timed out')), 15000)
      )
      const upload = supabase.storage
        .from('avatars')
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type })
      const { error: upErr } = await Promise.race([upload, timeout])
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq('id', user.id)
    } catch (err) {
      console.error('Avatar upload failed:', err)
      // Don't block — just continue
    }
    finish()
  }

  const finish = () => navigate(roleHome(profile?.role), { replace: true })

  // ── Render ─────────────────────────────────────────────────────────────────
  // Arrived from an email link but not signed in yet → redeem gate first
  if (tokenHash && !user) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-base leading-none">C4</span>
            </div>
            <div>
              <p className="text-white font-semibold leading-tight">C4 Lab</p>
              <p className="text-white/40 text-xs leading-tight">Connect Four Creative</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-2xl px-6 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <KeyRound size={20} className="text-accent" />
            </div>
            <h1 className="text-base font-bold text-text-primary mb-1">
              {tokenType === 'invite' ? 'Welcome to C4 Lab' : 'Reset your password'}
            </h1>
            <p className="text-sm text-text-secondary mb-5">
              {tokenType === 'invite'
                ? "You're one click away — continue to create your password."
                : 'Continue to choose a new password.'}
            </p>
            {redeemError ? (
              <div className="text-left text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 flex items-start gap-2 mb-4">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {redeemError}
              </div>
            ) : null}
            <button
              onClick={redeemToken}
              disabled={redeeming || !!redeemError}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {redeeming ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              {tokenType === 'invite' ? 'Set Up My Account' : 'Continue'}
            </button>
            {redeemError && (
              <button onClick={() => navigate('/login')} className="text-xs text-accent hover:underline mt-3">
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    )
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

          {/* Step indicator */}
          <div className="flex border-b border-border">
            {['Password', 'Photo'].map((label, i) => {
              const n = i + 1
              const done = step > n
              const active = step === n
              return (
                <div key={label} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
                  active ? 'text-accent border-b-2 border-accent' : done ? 'text-green-600' : 'text-text-muted'
                }`}>
                  {done ? <Check size={12} /> : <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold ${active ? 'bg-accent text-white' : 'bg-surface-3 text-text-muted'}`}>{n}</span>}
                  {label}
                </div>
              )
            })}
          </div>

          {/* ── STEP 1 ──────────────────────────────────────────────────── */}
          {step === 1 && (
            <>
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

              {/* Account info */}
              <div className="px-6 py-4 bg-surface-2 border-b border-border space-y-3">
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Your account</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center shrink-0 text-accent text-xs font-bold">
                    {getInitials(profile?.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{profile?.full_name || '—'}</p>
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
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="input pr-10"
                      required
                      minLength={8}
                      autoFocus
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
                <div>
                  <label className="label">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Same as above"
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
                {error && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  Continue
                </button>
              </form>
            </>
          )}

          {/* ── STEP 2 ──────────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="px-6 py-6 space-y-5">
              <div>
                <h1 className="text-base font-bold text-text-primary">Add a profile photo</h1>
                <p className="text-xs text-text-muted mt-0.5">Help your team recognize you. You can always change this later.</p>
              </div>

              {/* Avatar picker */}
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-border hover:border-accent group transition-colors"
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-surface-2 flex flex-col items-center justify-center gap-1">
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-bold">
                        {getInitials(profile?.full_name)}
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={18} className="text-white" />
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-accent hover:underline"
                >
                  {photoPreview ? 'Change photo' : 'Choose a photo'}
                </button>
              </div>

              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="space-y-2 pt-1">
                <button
                  onClick={handleUploadAndFinish}
                  disabled={uploading}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {photoPreview ? 'Save Photo & Enter C4 Lab' : 'Finish Setup'}
                </button>
                <button
                  onClick={finish}
                  type="button"
                  className="btn-secondary w-full text-text-muted"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-white/30 text-xs mt-5">
          This link was sent by your C4 Lab admin. If you weren't expecting this, ignore it.
        </p>
      </div>
    </div>
  )
}
