import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Forward the old Vercel domain to the branded one. Preserves path + query +
// hash so magic-link / invite auth tokens (carried in the hash) survive the
// hop. Only the exact old host is matched. Localhost, c4clab.com, and every
// other host are untouched.
if (window.location.hostname === 'c4-lab.vercel.app') {
  window.location.replace(
    'https://c4clab.com' +
    window.location.pathname + window.location.search + window.location.hash
  )
}

// Register the service worker on every visit, not just after sign-in, so the
// app is installable ("Add to Home Screen") from the login screen. Skipped in
// the native iOS app, which serves its own bundled files.
if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
