import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useVideoComments(videoId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchComments = useCallback(async () => {
    if (!videoId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('video_comments')
      .select('*')
      .eq('video_id', videoId)
      .order('timestamp_seconds', { ascending: true })
    if (error) setError(error.message)
    else setComments(data || [])
    setLoading(false)
  }, [videoId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // Realtime subscription
  useEffect(() => {
    if (!videoId) return
    const channel = supabase
      .channel(`video-comments-${videoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_comments', filter: `video_id=eq.${videoId}` },
        () => fetchComments()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [videoId, fetchComments])

  const addComment = async ({ content, timestamp_seconds, author_name }) => {
    const { data, error } = await supabase
      .from('video_comments')
      .insert([{ video_id: videoId, content, timestamp_seconds, author_name, user_id: 'mvp-user' }])
      .select()
      .single()
    if (error) throw error
    return data
  }

  const deleteComment = async (id) => {
    const { error } = await supabase.from('video_comments').delete().eq('id', id)
    if (error) throw error
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  return { comments, loading, error, addComment, deleteComment, refetch: fetchComments }
}
