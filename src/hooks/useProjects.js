import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PROJECT_SELECT = `
  id, name, type, status, stage,
  start_date, due_date, shoot_date, location,
  notes, created_by, created_at,
  creative_id, editor_id, revision_count,
  admin_review_required,
  draft_id, shoot_id, concept, target_date,
  clients(id, name, contact_name),
  project_members(
    id, role,
    profiles(id, full_name, role, avatar_url)
  )
`

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setProjects(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  return { projects, loading, error, refetch: fetchProjects }
}

export function useProject(id) {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchProject = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('id', id)
      .single()
    if (error) setError(error.message)
    else setProject(data)
    setLoading(false)
  }, [id])

  useEffect(() => { fetchProject() }, [fetchProject])

  return { project, loading, error, refetch: fetchProject }
}

export async function createProject(data) {
  const { data: row, error } = await supabase
    .from('projects')
    .insert([data])
    .select('id')
    .single()
  if (error) throw error
  return row
}

export async function updateProject(id, data) {
  const { error } = await supabase
    .from('projects')
    .update(data)
    .eq('id', id)
  if (error) throw error
}

export async function addMember(projectId, profileId, role) {
  const { error } = await supabase
    .from('project_members')
    .insert([{ project_id: projectId, profile_id: profileId, role }])
  if (error) throw error
}

export async function removeMember(projectId, profileId) {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('profile_id', profileId)
  if (error) throw error
}
