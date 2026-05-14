import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const PROFILE_CACHE_KEY = 'c4lab_profile'

const getCachedProfile = () => {
  try { return JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY)) } catch { return null }
}
const setCachedProfile = (profile) => {
  try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)) } catch {}
}
const clearCachedProfile = () => {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY) } catch {}
}

const fetchProfile = async (userId) => {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data ?? null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(() => getCachedProfile())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      // Hard timeout — never spin forever
      const timeout = setTimeout(() => {
        if (mounted) setLoading(false)
      }, 8000)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)

          // Use cached profile immediately so app loads fast
          const cached = getCachedProfile()
          if (cached && cached.id === session.user.id) {
            setProfile(cached)
            setLoading(false)
            clearTimeout(timeout)
            // Refresh profile in background
            fetchProfile(session.user.id).then((fresh) => {
              if (mounted && fresh) {
                setProfile(fresh)
                setCachedProfile(fresh)
              }
            }).catch(() => {})
          } else {
            // No cache — fetch and wait
            const data = await fetchProfile(session.user.id).catch(() => null)
            if (mounted) {
              setProfile(data)
              if (data) setCachedProfile(data)
            }
          }
        } else {
          clearCachedProfile()
        }
      } catch (e) {
        console.error('Auth init error', e)
      } finally {
        clearTimeout(timeout)
        if (mounted) setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        clearCachedProfile()
        setLoading(false)
        return
      }

      if (session?.user && event === 'SIGNED_IN') {
        setUser(session.user)
        setLoading(true)

        const signInTimeout = setTimeout(() => {
          if (mounted) setLoading(false)
        }, 8000)

        try {
          const data = await fetchProfile(session.user.id).catch(() => null)
          if (mounted) {
            setProfile(data)
            if (data) setCachedProfile(data)
          }
        } finally {
          clearTimeout(signInTimeout)
          if (mounted) setLoading(false)
        }
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    clearCachedProfile()
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setLoading(false)
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
