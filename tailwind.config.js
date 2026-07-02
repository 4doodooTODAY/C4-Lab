/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#0f1117',
        'sidebar-hover': '#1a1d27',
        'sidebar-active': '#1e2235',
        accent: '#6C63FF',
        'accent-hover': '#5a52e0',
        surface: '#ffffff',
        'surface-2': '#f4f5f7',
        'surface-3': '#e8eaed',
        border: '#e2e5ea',
        'text-primary': '#111827',
        'text-secondary': '#6b7280',
        'text-muted': '#9ca3af',
        // Design-system status set (mirrors --status-* in src/styles/tokens.css)
        status: {
          'due-soon':      '#f59e0b',
          'due-soon-bg':   '#fef3c7',
          'due-soon-text': '#b45309',
          'overdue':       '#ef4444',
          'overdue-bg':    '#fee2e2',
          'overdue-text':  '#b91c1c',
          'review':        '#8b5cf6',
          'review-bg':     '#ede9fe',
          'review-text':   '#6d28d9',
          'approved':      '#10b981',
          'approved-bg':   '#d1fae5',
          'approved-text': '#047857',
          'idle':          '#9ca3af',
          'idle-bg':       '#f4f5f7',
          'idle-text':     '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Horizon', 'Poppins', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'elevation-1': '0 1px 2px rgba(15, 17, 23, 0.05)',
        'elevation-2': '0 4px 12px rgba(15, 17, 23, 0.08)',
        'elevation-3': '0 12px 32px rgba(15, 17, 23, 0.14)',
      },
    },
  },
  plugins: [],
}
