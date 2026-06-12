import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const PROFILE_CACHE_KEY = 'c4lab_profile'

const getCachedProfile = () => {
  try { return JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY)) } catch { return null }
}
const setCachedProfile = (p) => {
  try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)) } catch {}
}
const clearCachedProfile = () => {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY) } catch {}
}

const fetchProfile = (userId) =>
  supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
    .then(({ data }) => data ?? null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(() => getCachedProfile())
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewModeState] = useState(() => localStorage.getItem('c4lab_viewmode') || 'admin')

  const setViewMode = (mode) => {
    localStorage.setItem('c4lab_viewmode', mode)
    setViewModeState(mode)
  }

  useEffect(() => {
    let mounted = true

    // Single source of truth — onAuthStateChange handles everything including initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (!session) {
        // If there's a ?code= in the URL, Supabase is still exchanging an invite/recovery token.
        // Stay in loading state — SIGNED_IN will fire once the exchange completes.
        // Redirecting to /login now would strip the code from the URL and break the flow.
        if (event === 'INITIAL_SESSION') {
          const hasCode = new URLSearchParams(window.location.search).has('code')
          const hasHashToken = window.location.hash.includes('access_token')
          if (hasCode || hasHashToken) return
        }
        setUser(null)
        setProfile(null)
        clearCachedProfile()
        setLoading(false)
        return
      }

      setUser(session.user)

      // Use cache immediately so UI doesn't block
      const cached = getCachedProfile()
      if (cached?.id === session.user.id) {
        setProfile(cached)
        setLoading(false)
        // Refresh in background
        fetchProfile(session.user.id).then((fresh) => {
          if (mounted && fresh) { setProfile(fresh); setCachedProfile(fresh) }
        }).catch(() => {})
      } else {
        // No cache — fetch and wait (first login)
        const fallback = setTimeout(() => { if (mounted) setLoading(false) }, 8000)
        fetchProfile(session.user.id)
          .then((data) => { if (mounted) { setProfile(data); if (data) setCachedProfile(data) } })
          .catch(() => {})
          .finally(() => { clearTimeout(fallback); if (mounted) setLoading(false) })
      }
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password }).then(({ error }) => { if (error) throw error })

  const signOut = async () => {
    clearCachedProfile()
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const createUser = async ({ email, full_name, role }) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, full_name, role }),
      }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to create user')
    return data
  }

  // Merge a partial update into the in-memory profile AND its sessionStorage
  // cache so guards like ProtectedRoute react immediately (no stale redirect).
  const patchProfile = (patch) => {
    setProfile((prev) => {
      const next = { ...(prev || {}), ...patch }
      setCachedProfile(next)
      return next
    })
  }

  // isAdmin is false when an admin has switched to creative view — they get full creative permissions only
  const isAdmin = profile?.role === 'admin' && viewMode !== 'creative'

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, createUser, patchProfile, viewMode, setViewMode, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
