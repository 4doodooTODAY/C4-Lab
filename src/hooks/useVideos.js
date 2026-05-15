import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToR2 } from '../lib/r2'

export async function uploadVideoFile(file, onProgress, { category = 'review-videos', clientName = '', projectName = '' } = {}) {
  const { publicUrl } = await uploadToR2({ file, category, clientName, projectName, onProgress })
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
    const { error } = await supabase.from('videos').delete().eq('id', id)
    if (error) throw error
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
