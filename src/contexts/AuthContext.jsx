import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const fetchProfileWithTimeout = async (userId, ms = 8000) => {
  const profilePromise = supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
    .then(({ data }) => data ?? null)

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Profile fetch timed out')), ms)
  )

  return Promise.race([profilePromise, timeoutPromise])
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const timeout = setTimeout(() => {
        if (mounted) setLoading(false)
      }, 8000)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
          try {
            const data = await fetchProfileWithTimeout(session.user.id)
            if (mounted) setProfile(data)
          } catch {
            // Profile timed out — still let them through, profile will retry on next load
          }
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
          const data = await fetchProfileWithTimeout(session.user.id)
          if (mounted) setProfile(data)
        } catch {
          // timed out — proceed anyway
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
