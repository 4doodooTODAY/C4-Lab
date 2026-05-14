import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { user } = useAuth()

  const fetchProjects = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('id, title, status, created_at, client_id, clients(name)')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setProjects(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const addProject = async (title) => {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert([{ name: title, created_by: user.id }])
      .select('id, name')
      .single()
    if (clientError) throw clientError

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert([{ title, client_id: client.id, created_by: user.id }])
      .select('id, title, status, created_at, client_id, clients(name)')
      .single()
    if (projectError) throw projectError

    setProjects((prev) => [project, ...prev])
    return project
  }

  return { projects, loading, error, addProject, refetch: fetchProjects }
}
