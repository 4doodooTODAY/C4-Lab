import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useMediaComments(mediaId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { user } = useAuth()

  const fetchComments = useCallback(async () => {
    if (!mediaId) return
    setLoading(true)
    // Try to join profiles for author names; falls back gracefully if RLS blocks it
    const { data, error } = await supabase
      .from('media_comments')
      .select('*, profiles(full_name, avatar_url)')
      .eq('media_id', mediaId)
      .order('timestamp_seconds', { ascending: true })
    if (error) setError(error.message)
    else setComments(data || [])
    setLoading(false)
  }, [mediaId])

  useEffect(() => { fetchComments() }, [fetchComments])

  // Realtime subscription
  useEffect(() => {
    if (!mediaId) return
    const channel = supabase
      .channel(`media-comments-${mediaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'media_comments', filter: `media_id=eq.${mediaId}` },
        () => fetchComments()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [mediaId, fetchComments])

  const addComment = async ({ content, timestamp_seconds, is_internal = false }) => {
    const { data, error } = await supabase
      .from('media_comments')
      .insert([{
        media_id: mediaId,
        author_id: user.id,
        content,
        timestamp_seconds,
        is_internal,
      }])
      .select('*, profiles(full_name, avatar_url)')
      .single()
    if (error) throw error
    return data
  }

  const resolveComment = async (id, is_resolved) => {
    const { error } = await supabase
      .from('media_comments')
      .update({ is_resolved })
      .eq('id', id)
    if (error) throw error
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, is_resolved } : c)))
  }

  const deleteComment = async (id) => {
    const { error } = await supabase.from('media_comments').delete().eq('id', id)
    if (error) throw error
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  return { comments, loading, error, addComment, resolveComment, deleteComment, refetch: fetchComments }
}
