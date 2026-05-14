import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const STORAGE_BUCKET = 'videos'

function isStorageUrl(url) {
  return url?.includes('/storage/v1/object/public/')
}

function storagePathFromUrl(url) {
  const marker = `/object/public/${STORAGE_BUCKET}/`
  const idx = url.indexOf(marker)
  return idx !== -1 ? url.slice(idx + marker.length) : null
}

export async function uploadMediaFile(file) {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path)
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
    const item = media.find((m) => m.id === id)
    const { error } = await supabase.from('media').delete().eq('id', id)
    if (error) throw error
    if (item && isStorageUrl(item.media_url)) {
      const path = storagePathFromUrl(item.media_url)
      if (path) supabase.storage.from(STORAGE_BUCKET).remove([path]) // fire and forget
    }
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
