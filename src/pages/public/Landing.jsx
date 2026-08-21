import { Link } from 'react-router-dom'
import { ArrowRight, Rocket, Camera, Scissors, Gem, Sparkles, LogIn } from 'lucide-react'
import LogoBadge from '../../components/ui/Logo'
import MysticalSky from '../../components/ui/MysticalSky'

// The public front door at c4clab.com. Same night-sky world as /waitlist so
// the walk from landing → waitlist feels like one continuous moment.

const PILLARS = [
  { icon: Camera,   title: 'Creatives',  line: 'Photographers and videographers run shoots and deliver stunning galleries.' },
  { icon: Scissors, title: 'Visionaries', line: 'Editors cut, revise, and ship with timeline-pinned feedback.' },
  { icon: Gem,      title: 'Clients',    line: 'Review, comment, and approve from your phone. No account gymnastics.' },
]

export default function Landing() {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        background: 'radial-gradient(120% 100% at 50% -10%, #3a1470 0%, var(--plum) 42%, #12042b 100%)',
      }}
    >
      <MysticalSky />

      <div className="relative z-10 w-full max-w-2xl text-center">
        {/* Brand */}
        <div className="anim-rise flex items-center justify-center gap-3 mb-8">
          <LogoBadge size={44} />
          <div className="text-left">
            <p className="font-display text-white font-semibold leading-tight">C4C Lab</p>
            <p className="text-white/40 text-xs leading-tight">Connect Four Creative</p>
          </div>
        </div>

        {/* Launch pill */}
        <div className="anim-rise d1 inline-flex items-center gap-1.5 mb-5 px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold tracking-wide"
          style={{ background: 'rgb(var(--violet-bright-rgb) / 0.18)', color: '#E7D6FF', border: '1px solid rgb(var(--violet-bright-rgb) / 0.4)' }}>
          <Rocket size={13} /> GOING IN THE APP STORE SEPTEMBER 4TH!
        </div>

        {/* Hero */}
        <h1 className="anim-rise d2 font-display text-4xl sm:text-5xl font-bold text-white leading-[1.08]" style={{ textWrap: 'balance' }}>
          Four Moves Ahead
        </h1>
        <p className="anim-rise d3 text-white/60 text-sm sm:text-base mt-4 max-w-md mx-auto leading-relaxed">
          Shoots, edits, reviews, and approvals for your whole creative team, in one beautiful place.
        </p>

        {/* CTAs */}
        <div className="anim-rise d4 flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link
            to="/waitlist"
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl py-3 px-7 text-sm font-bold text-white transition-transform hover:scale-[1.03] active:translate-y-px"
            style={{ background: 'linear-gradient(135deg, var(--violet), var(--violet-bright))', boxShadow: '0 8px 28px rgb(var(--violet-rgb) / 0.5)' }}
          >
            <Sparkles size={15} /> Join the waitlist <ArrowRight size={14} />
          </Link>
          <Link
            to="/login"
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl py-3 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/15"
            style={{ background: 'rgb(255 255 255 / 0.08)', border: '1px solid rgb(255 255 255 / 0.16)' }}
          >
            <LogIn size={15} /> Sign in
          </Link>
        </div>

        {/* Pillars */}
        <div className="anim-rise d5 grid sm:grid-cols-3 gap-3 mt-12 text-left">
          {PILLARS.map((p) => {
            const Icon = p.icon
            return (
              <div key={p.title} className="rounded-2xl p-4"
                style={{
                  background: 'linear-gradient(180deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.02))',
                  border: '1px solid rgb(255 255 255 / 0.12)',
                  backdropFilter: 'blur(12px)',
                }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2.5"
                  style={{ background: 'rgb(var(--violet-bright-rgb) / 0.22)' }}>
                  <Icon size={16} style={{ color: '#D8B9FF' }} />
                </div>
                <p className="text-sm font-semibold text-white">{p.title}</p>
                <p className="text-xs text-white/50 leading-relaxed mt-1">{p.line}</p>
              </div>
            )
          })}
        </div>

        <p className="anim-rise d6 text-[11px] text-white/30 mt-10">
          <a href="/terms" className="hover:text-white/60 underline-offset-2 hover:underline">Terms</a>
          <span className="mx-2">·</span>
          <a href="/privacy" className="hover:text-white/60 underline-offset-2 hover:underline">Privacy</a>
          <span className="mx-2">·</span>
          <a href="/support" className="hover:text-white/60 underline-offset-2 hover:underline">Support</a>
        </p>
      </div>
    </div>
  )
}
