import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const initialized = useRef(false)

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
    return data
  }

  useEffect(() => {
    // Listen for auth changes first — this fires immediately with existing session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)

      if (session?.user) {
        // Only fetch profile if we don't have one yet or user changed
        if (!initialized.current || event === 'SIGNED_IN') {
          await fetchProfile(session.user.id)
        }
      } else {
        setProfile(null)
      }

      // Mark as initialized after first event fires
      if (!initialized.current) {
        initialized.current = true
        setLoading(false)
      }
    })

    // Fallback: if onAuthStateChange never fires (rare edge case), stop loading after 4s
    const fallback = setTimeout(() => {
      if (!initialized.current) {
        initialized.current = true
        setLoading(false)
      }
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallback)
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
