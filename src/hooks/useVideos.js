import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const STORAGE_BUCKET = 'videos'

function isStorageUrl(url) {
  return url?.includes('/storage/v1/object/public/')
}

function storagePathFromUrl(url) {
  // Extract the path after the bucket name, e.g. "videos/123-file.mp4" → "123-file.mp4"
  const marker = `/object/public/${STORAGE_BUCKET}/`
  const idx = url.indexOf(marker)
  return idx !== -1 ? url.slice(idx + marker.length) : null
}

export async function uploadVideoFile(file, onProgress) {
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

export function useVideos() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchVideos = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setVideos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchVideos()
  }, [fetchVideos])

  const addVideo = async ({ title, description, video_url }) => {
    const { data, error } = await supabase
      .from('videos')
      .insert([{ title, description, video_url, user_id: 'mvp-user' }])
      .select()
      .single()
    if (error) throw error
    setVideos((prev) => [data, ...prev])
    return data
  }

  const deleteVideo = async (id) => {
    const video = videos.find((v) => v.id === id)
    const { error } = await supabase.from('videos').delete().eq('id', id)
    if (error) throw error
    // Clean up Storage file if it was uploaded (not a Drive link)
    if (video && isStorageUrl(video.video_url)) {
      const path = storagePathFromUrl(video.video_url)
      if (path) await supabase.storage.from(STORAGE_BUCKET).remove([path])
    }
    setVideos((prev) => prev.filter((v) => v.id !== id))
  }

  return { videos, loading, error, addVideo, deleteVideo, refetch: fetchVideos }
}

export function useVideo(id) {
  const [video, setVideo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    supabase
      .from('videos')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setVideo(data)
        setLoading(false)
      })
  }, [id])

  return { video, loading, error }
}
