import { createContext, useContext, useState, useEffect } from 'react'

// Light / dark theme. The actual color flip lives in theme.css, keyed off
// data-theme on the root element. This just tracks the choice, persists it,
// and keeps the attribute in sync. An inline script in index.html applies the
// stored value before first paint so there is no flash on load.
const ThemeContext = createContext(null)
const KEY = 'c4lab_theme'

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(KEY) || 'dark' } catch { return 'dark' }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(KEY, theme) } catch { /* private mode, ignore */ }
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext) || { theme: 'dark', setTheme: () => {}, toggleTheme: () => {} }
}
