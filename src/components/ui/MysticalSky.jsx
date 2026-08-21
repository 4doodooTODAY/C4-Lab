// Ambient background for the waitlist page: twinkling sparkles over slow
// drifting violet light. Built from the same brand tokens as the rest of
// the app (theme.css `.sparkle` / `.glow-orb`). Pure CSS animation,
// pointer-events off, stilled under prefers-reduced-motion.

const SPARKLES = Array.from({ length: 34 }).map((_, i) => ({
  left:     `${(i * 37 + 5) % 100}%`,
  top:      `${(i * 53 + 11) % 100}%`,
  size:     3 + ((i * 7) % 5),
  duration: 2.2 + ((i * 3) % 6) * 0.4,
  delay:    -((i * 5) % 8),
}))

const ORBS = [
  { left: '6%',  top: '10%', size: 340, color: 'violet-rgb',        opacity: 0.32, duration: 24 },
  { left: '74%', top: '2%',  size: 260, color: 'violet-bright-rgb', opacity: 0.26, duration: 28 },
  { left: '58%', top: '58%', size: 400, color: 'plum-rgb',          opacity: 0.55, duration: 32 },
  { left: '2%',  top: '64%', size: 230, color: 'violet-rgb',        opacity: 0.24, duration: 20 },
  { left: '85%', top: '68%', size: 180, color: 'amber-rgb',         opacity: 0.10, duration: 26 },
]

export default function MysticalSky() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {ORBS.map((o, i) => (
        <div
          key={i}
          className="glow-orb"
          style={{
            left: o.left,
            top: o.top,
            width: o.size,
            height: o.size,
            background: `radial-gradient(circle, rgb(var(--${o.color}) / ${o.opacity}) 0%, transparent 70%)`,
            animationDuration: `${o.duration}s`,
          }}
        />
      ))}
      {SPARKLES.map((s, i) => (
        <div
          key={i}
          className="sparkle"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
