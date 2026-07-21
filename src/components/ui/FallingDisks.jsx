// Ambient background for the sign-in and welcome screens: a large circular
// halo behind the content plus soft circle disks drifting slowly down the
// ground. Pure CSS animation (.disk-fall in theme.css), pointer-events off,
// and stilled entirely under prefers-reduced-motion.

const DISKS = [
  { left: '6%',  size: 180, duration: 52, delay: -8,  opacity: 0.5  },
  { left: '18%', size: 90,  duration: 38, delay: -22, opacity: 0.35 },
  { left: '31%', size: 260, duration: 64, delay: -40, opacity: 0.4  },
  { left: '47%', size: 70,  duration: 34, delay: -5,  opacity: 0.3  },
  { left: '60%', size: 140, duration: 46, delay: -30, opacity: 0.45 },
  { left: '72%', size: 220, duration: 58, delay: -15, opacity: 0.35 },
  { left: '85%', size: 110, duration: 42, delay: -36, opacity: 0.5  },
  { left: '93%', size: 60,  duration: 30, delay: -12, opacity: 0.3  },
]

export default function FallingDisks() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* circular halo grounding the content */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 'min(80vh, 780px)',
          height: 'min(80vh, 780px)',
          border: '1px solid rgb(var(--ink-hi-rgb) / 0.07)',
          background: 'radial-gradient(circle, rgb(var(--violet-rgb) / 0.08) 0%, transparent 68%)',
        }}
      />
      {DISKS.map((d, i) => (
        <div
          key={i}
          className="disk"
          style={{
            left: d.left,
            width: d.size,
            height: d.size,
            opacity: d.opacity,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
