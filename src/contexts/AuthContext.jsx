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

  useEffect(() => {
    let mounted = true

    // Single source of truth — onAuthStateChange handles everything including initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (!session) {
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

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, createUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
