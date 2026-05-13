import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useContentRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('content_requests')
      .select(`
        *,
        profiles (id, full_name, role, avatar_url),
        clients (id, name)
      `)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setRequests(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const updateRequestStatus = async (id, status) => {
    const { error } = await supabase
      .from('content_requests')
      .update({ status })
      .eq('id', id)
    if (error) throw error
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status } : r))
  }

  return { requests, loading, error, refetch: fetchRequests, updateRequestStatus }
}

export function useClientRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    supabase
      .from('content_requests')
      .select('*')
      .eq('submitted_by', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRequests(data || [])
        setLoading(false)
      })
  }, [user])

  const submitRequest = async ({ type, idea, platform, priority, notes, client_id, inspiration_url }) => {
    const { data, error } = await supabase
      .from('content_requests')
      .insert([{ type, idea, platform, priority, notes, client_id, inspiration_url, submitted_by: user.id, status: 'new' }])
      .select()
      .single()
    if (error) throw error
    setRequests((prev) => [data, ...prev])
    return data
  }

  const submitFootage = async ({ title, notes, client_id, file_url, file_name, file_size }) => {
    const { data, error } = await supabase
      .from('content_requests')
      .insert([{ type: 'footage', idea: title, notes, client_id, file_url, file_name, file_size, submitted_by: user.id, status: 'new' }])
      .select()
      .single()
    if (error) throw error
    setRequests((prev) => [data, ...prev])
    return data
  }

  return { requests, loading, submitRequest, submitFootage }
}
