import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Loader2, Check, Camera, Scissors, Gem,
  Sparkles, PartyPopper, Rocket,
} from 'lucide-react'
import LogoBadge from '../../components/ui/Logo'
import MysticalSky from '../../components/ui/MysticalSky'

const ROLES = {
  creative: {
    label: 'Creative',
    definition: 'Photographer or videographer.',
    icon: Camera,
  },
  visionary: {
    label: 'Visionary',
    definition: 'Editor.',
    icon: Scissors,
  },
  client: {
    label: 'Client',
    definition: 'Looking for a videographer, photographer, or editor.',
    icon: Gem,
  },
}

export default function Waitlist() {
  const [step, setStep]   = useState('role') // 'role' | 'form' | 'done'
  const [role, setRole]   = useState(null)

  const [name,     setName]     = useState('')
  const [phone,    setPhone]    = useState('')
  const [email,    setEmail]    = useState('')
  const [location, setLocation] = useState('')
  const [notes,    setNotes]    = useState('')
  // Honeypot. Stays empty for real people; bots fill every input they find.
  const [company, setCompany] = useState('')

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const chooseRole = (key) => {
    setRole(key)
    setError('')
    if (key !== 'client') setLocation('') // location only travels with client signups
    setStep('form')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          name:     name.trim(),
          email:    email.trim(),
          phone:    phone.trim(),
          location: location.trim(),
          role,
          notes: notes.trim(),
          company, // honeypot
        }),
      })
      if (res.status === 429) {
        setError('Too many attempts from here. Give it a bit and try again.')
        return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setStep('done')
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const RoleIcon = role ? ROLES[role].icon : null

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        background: 'radial-gradient(120% 100% at 50% -10%, #3a1470 0%, var(--plum) 42%, #12042b 100%)',
      }}
    >
      <MysticalSky />

      <Link
        to="/login"
        className="absolute top-5 left-5 z-20 flex items-center gap-1.5 text-xs font-medium text-white/60 hover:text-white transition-colors"
        style={{ top: 'max(1.25rem, env(safe-area-inset-top))' }}
      >
        <ArrowLeft size={13} /> Back to sign in
      </Link>

      {/* pt clears the absolutely positioned back link above, which otherwise
          crowds the logo on a narrow phone. */}
      <div className="relative z-10 w-full max-w-md pt-8 sm:pt-0">
        {/* Headline moment */}
        <div className="text-center mb-6">
          <div className="anim-rise flex justify-center mb-4">
            <LogoBadge size={44} />
          </div>
          <div className="anim-rise d1 inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide"
            style={{ background: 'rgb(var(--violet-bright-rgb) / 0.18)', color: '#E7D6FF', border: '1px solid rgb(var(--violet-bright-rgb) / 0.4)' }}>
            <Rocket size={12} /> LANDING IN THE APP STORE SEPTEMBER 4TH
          </div>
          <h1 className="anim-rise d2 font-display text-3xl sm:text-4xl font-bold text-white leading-tight">
            Get on the list
          </h1>
          <p className="anim-rise d3 text-white/60 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
            Be first to know the moment C4C Lab lands on your phone. Takes about thirty seconds.
          </p>
        </div>

        {/* Glass card */}
        <div
          className="anim-rise d3 relative rounded-2xl p-6 sm:p-7"
          style={{
            background: 'linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.03))',
            border: '1px solid rgb(255 255 255 / 0.14)',
            boxShadow: '0 24px 60px rgb(0 0 0 / 0.35), 0 0 0 1px rgb(var(--violet-bright-rgb) / 0.06) inset',
            backdropFilter: 'blur(18px)',
          }}
        >
          {/* ── STEP: pick a role ── */}
          {step === 'role' && (
            <>
              <h2 className="font-display text-lg text-white mb-0.5">Which one are you?</h2>
              <p className="text-sm text-white/50 mb-5">Pick what fits. We'll tailor the invite.</p>

              <div className="space-y-2.5">
                {Object.entries(ROLES).map(([key, r], i) => {
                  const Icon = r.icon
                  return (
                    <button
                      key={key}
                      onClick={() => chooseRole(key)}
                      className={`anim-rise d${i + 2} w-full text-left flex items-center gap-3 rounded-xl p-3.5 transition-all group
                        bg-white/[0.04] border border-white/10
                        hover:bg-[rgb(var(--violet-bright-rgb)/0.14)] hover:border-[rgb(var(--violet-bright-rgb)/0.5)]`}
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'rgb(var(--violet-bright-rgb) / 0.22)' }}>
                        <Icon size={18} style={{ color: '#D8B9FF' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{r.label}</p>
                        <p className="text-xs text-white/45 italic leading-snug">{r.definition}</p>
                      </div>
                      <ArrowRight size={15} className="text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── STEP: details form ── */}
          {step === 'form' && (
            <>
              <button
                onClick={() => setStep('role')}
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white mb-4 transition-colors"
              >
                <ArrowLeft size={13} /> Back
              </button>

              <div className="flex items-center gap-2.5 mb-0.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgb(var(--violet-bright-rgb) / 0.22)' }}>
                  {RoleIcon && <RoleIcon size={15} style={{ color: '#D8B9FF' }} />}
                </div>
                <h2 className="font-display text-lg text-white">{ROLES[role]?.label}, joining the list</h2>
              </div>
              <p className="text-sm text-white/50 mb-5 ml-[42px]">Just a few details and you're in.</p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Name</label>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Full name" required autoFocus
                    className="waitlist-input"
                  />
                </div>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Phone</label>
                    <input
                      type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 555-5555" required
                      className="waitlist-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Email</label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com" required
                      className="waitlist-input"
                    />
                  </div>
                </div>
                {role === 'client' && (
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Where are you located?</label>
                    <input
                      type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                      placeholder="City, State" required
                      className="waitlist-input"
                    />
                    <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
                      Tell us where you are and we'll personally connect you with a creative near you.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">
                    Anything else? <span className="font-normal text-white/35">(optional)</span>
                  </label>
                  <textarea
                    value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Tell us a bit about what you're looking for."
                    rows={2} className="waitlist-input resize-none"
                  />
                </div>

                {/* Honeypot. Hidden from people and screen readers, invisible
                    to autofill, but present in the DOM for bots. */}
                <div aria-hidden="true" className="absolute left-[-9999px] w-px h-px overflow-hidden">
                  <label htmlFor="wl-company">Company website</label>
                  <input
                    id="wl-company" name="wl-company" type="text" tabIndex={-1} autoComplete="off"
                    value={company} onChange={(e) => setCompany(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-xs rounded-lg px-3 py-2" style={{ color: '#FCA5A5', background: 'rgb(248 113 113 / 0.12)' }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-transform active:translate-y-px disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--violet), var(--violet-bright))', boxShadow: '0 8px 24px rgb(var(--violet-rgb) / 0.45)' }}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Join the waitlist
                </button>

                <p className="text-[11px] text-white/35 text-center leading-relaxed">
                  We'll only use this to reach out about your spot. See our{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white/60">
                    Privacy Policy
                  </a>.
                </p>
              </form>
            </>
          )}

          {/* ── STEP: done ── */}
          {step === 'done' && (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'linear-gradient(135deg, var(--violet), var(--violet-bright))', boxShadow: '0 0 0 8px rgb(var(--violet-bright-rgb) / 0.12)' }}>
                <PartyPopper size={24} className="text-white" />
              </div>
              <h2 className="font-display text-xl text-white mb-1.5">You're on the list</h2>
              <p className="text-sm text-white/60 leading-relaxed max-w-xs mx-auto">
                {role === 'client' ? (
                  <>We'll text and email <span className="text-white font-medium">{name || 'you'}</span> the
                  moment C4C Lab lands in the App Store on September 4th, and we'll personally
                  connect you with a creative near you.</>
                ) : (
                  <>We'll text and email <span className="text-white font-medium">{name || 'you'}</span> the
                  moment C4C Lab lands in the App Store on September 4th.</>
                )}
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 px-6 text-sm font-semibold text-white transition-colors"
                style={{ background: 'rgb(255 255 255 / 0.08)', border: '1px solid rgb(255 255 255 / 0.16)' }}
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
