import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Forward the old Vercel domain to the branded one. Preserves path + query +
// hash so magic-link / invite auth tokens (carried in the hash) survive the
// hop. Only the exact old host is matched — localhost, c4clab.com, and every
// other host are untouched.
if (window.location.hostname === 'c4-lab.vercel.app') {
  window.location.replace(
    'https://c4clab.com' +
    window.location.pathname + window.location.search + window.location.hash
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
