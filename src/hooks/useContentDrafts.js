import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const DRAFT_SELECT = `
  id, client_id, shoot_id, type, title, concept,
  target_date, inspiration_links, status,
  created_by, created_at,
  clients(id, name, contact_name),
  shoots(id, title, shoot_date)
`

export function useContentDrafts(clientId = null) {
  const [drafts, setDrafts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchDrafts = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('content_drafts')
      .select(DRAFT_SELECT)
      .order('created_at', { ascending: false })

    if (clientId) q = q.eq('client_id', clientId)

    const { data, error: err } = await q
    if (err) setError(err.message)
    else setDrafts(data || [])
    setLoading(false)
  }, [clientId])

  useEffect(() => { fetchDrafts() }, [fetchDrafts])

  return { drafts, loading, error, refetch: fetchDrafts }
}

export async function createDraft(data) {
  const { data: row, error } = await supabase
    .from('content_drafts')
    .insert([data])
    .select('id')
    .single()
  if (error) throw error
  return row
}

export async function updateDraft(id, data) {
  const { error } = await supabase.from('content_drafts').update(data).eq('id', id)
  if (error) throw error
}

export async function deleteDraft(id) {
  const { error } = await supabase.from('content_drafts').delete().eq('id', id)
  if (error) throw error
}
