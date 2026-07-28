/** @type {import('tailwindcss').Config} */
// Color tokens map onto the CSS variables in src/styles/theme.css — the only
// place brand hex values live. The rgb(var(...) / <alpha-value>) form keeps
// opacity modifiers (bg-accent/10 etc.) working.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: 'rgb(var(--sidebar-rgb) / <alpha-value>)',
        'sidebar-hover': 'rgb(var(--sidebar-hover-rgb) / <alpha-value>)',
        'sidebar-active': 'rgb(var(--sidebar-active-rgb) / <alpha-value>)',
        accent: 'rgb(var(--violet-rgb) / <alpha-value>)',
        'accent-hover': 'rgb(var(--violet-bright-rgb) / <alpha-value>)',
        'accent-warm': 'rgb(var(--amber-rgb) / <alpha-value>)',
        surface: 'rgb(var(--ground-2-rgb) / <alpha-value>)',
        'surface-2': 'rgb(var(--ground-3-rgb) / <alpha-value>)',
        'surface-3': 'rgb(var(--ground-4-rgb) / <alpha-value>)',
        border: 'rgb(var(--line-rgb) / <alpha-value>)',
        'text-primary': 'rgb(var(--ink-hi-rgb) / <alpha-value>)',
        'text-secondary': 'rgb(var(--ink-mid-rgb) / <alpha-value>)',
        'text-muted': 'rgb(var(--ink-low-rgb) / <alpha-value>)',
        // Status set — mirrors --status-* in theme.css (dark-ground variants)
        status: {
          'due-soon':      'var(--status-due-soon)',
          'due-soon-bg':   'var(--status-due-soon-bg)',
          'due-soon-text': 'var(--status-due-soon-text)',
          'overdue':       'var(--status-overdue)',
          'overdue-bg':    'var(--status-overdue-bg)',
          'overdue-text':  'var(--status-overdue-text)',
          'review':        'var(--status-review)',
          'review-bg':     'var(--status-review-bg)',
          'review-text':   'var(--status-review-text)',
          'approved':      'var(--status-approved)',
          'approved-bg':   'var(--status-approved-bg)',
          'approved-text': 'var(--status-approved-text)',
          'idle':          'var(--status-idle)',
          'idle-bg':       'var(--status-idle-bg)',
          'idle-text':     'var(--status-idle-text)',
        },
      },
      fontFamily: {
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Horizon', 'Orbitron', 'Poppins', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        'elevation-1': '0 1px 2px rgba(0, 0, 0, 0.2)',
        'elevation-2': '0 4px 14px rgba(0, 0, 0, 0.25)',
        'elevation-3': '0 14px 36px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
}
