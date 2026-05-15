import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { uploadToR2 } from '../lib/r2'

export async function uploadMediaFile(file, { category = 'review-videos', clientName = '', projectName = '', onProgress } = {}) {
  const { publicUrl } = await uploadToR2({ file, category, clientName, projectName, onProgress })
  return publicUrl
}

export function useMedia(projectId) {
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { user } = useAuth()

  const fetchMedia = useCallback(async () => {
    if (!projectId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('media')
      .select('id, title, description, media_url, media_type, status, created_at, project_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setMedia(data || [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchMedia() }, [fetchMedia])

  const addMedia = async ({ title, description, media_url, media_type = 'video' }) => {
    const { data, error } = await supabase
      .from('media')
      .insert([{ title, description, media_url, media_type, project_id: projectId, uploaded_by: user.id }])
      .select('id, title, description, media_url, media_type, status, created_at, project_id')
      .single()
    if (error) throw error
    setMedia((prev) => [data, ...prev])
    return data
  }

  const deleteMedia = async (id) => {
    const { error } = await supabase.from('media').delete().eq('id', id)
    if (error) throw error
    setMedia((prev) => prev.filter((m) => m.id !== id))
  }

  return { media, loading, error, addMedia, deleteMedia, refetch: fetchMedia }
}

export function useMediaItem(id) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) return
    supabase
      .from('media')
      .select('id, title, description, media_url, media_type, status, created_at, project_id')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setItem(data)
        setLoading(false)
      })
  }, [id])

  return { item, loading, error }
}
