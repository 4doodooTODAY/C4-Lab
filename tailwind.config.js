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
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
