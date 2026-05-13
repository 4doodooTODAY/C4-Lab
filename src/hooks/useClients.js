import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useClients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { user } = useAuth()

  const fetchClients = useCallback(async () => {
    setLoading(true)
    // Fetch client companies with their assigned creatives
    const { data, error } = await supabase
      .from('clients')
      .select(`
        *,
        client_access (
          profile_id,
          profiles (id, full_name, role, avatar_url)
        )
      `)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setClients(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  const addClient = async (name) => {
    const { data, error } = await supabase
      .from('clients')
      .insert([{ name, created_by: user.id }])
      .select()
      .single()
    if (error) throw error
    setClients((prev) => [{ ...data, client_access: [] }, ...prev])
    return data
  }

  const assignCreative = async (clientId, profileId) => {
    const { error } = await supabase
      .from('client_access')
      .insert([{ client_id: clientId, profile_id: profileId }])
    if (error) throw error
    fetchClients()
  }

  const removeCreative = async (clientId, profileId) => {
    const { error } = await supabase
      .from('client_access')
      .delete()
      .eq('client_id', clientId)
      .eq('profile_id', profileId)
    if (error) throw error
    fetchClients()
  }

  return { clients, loading, error, addClient, assignCreative, removeCreative, refetch: fetchClients }
}

export function useCreatives() {
  const [creatives, setCreatives] = useState([])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .in('role', ['creative', 'admin'])
      .order('full_name')
      .then(({ data }) => setCreatives(data || []))
  }, [])

  return creatives
}
