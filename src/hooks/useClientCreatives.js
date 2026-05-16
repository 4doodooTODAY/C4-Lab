import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ASSIGNMENT_SELECT = `
  id, client_id, profile_id, role, created_at,
  profiles(id, full_name, role, avatar_url, tags)
`

export function useClientCreatives(clientId = null) {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const fetchAssignments = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('client_creatives')
      .select(ASSIGNMENT_SELECT)
      .order('created_at', { ascending: true })

    if (clientId) q = q.eq('client_id', clientId)

    const { data, error: err } = await q
    if (err) { console.warn('useClientCreatives:', err.message); setAssignments([]) }
    else setAssignments(data || [])
    setLoading(false)
  }, [clientId])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  return { assignments, loading, error, refetch: fetchAssignments }
}

// Get all clients assigned to a given creative
export function useCreativeClients(profileId = null) {
  const [clients, setClients]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetchClients = useCallback(async () => {
    if (!profileId) { setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('client_creatives')
      .select(`
        id, role,
        clients(
          id, name, contact_name,
          projects(id, name, stage, created_at),
          shoots(id, title, shoot_date, status)
        )
      `)
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true })

    if (err) setError(err.message)
    else setClients(data || [])
    setLoading(false)
  }, [profileId])

  useEffect(() => { fetchClients() }, [fetchClients])

  return { clients, loading, error, refetch: fetchClients }
}

export async function assignCreative(clientId, profileId, role) {
  const { error } = await supabase
    .from('client_creatives')
    .insert([{ client_id: clientId, profile_id: profileId, role }])
  if (error) throw error
}

export async function removeCreativeAssignment(id) {
  const { error } = await supabase
    .from('client_creatives')
    .delete()
    .eq('id', id)
  if (error) throw error
}
