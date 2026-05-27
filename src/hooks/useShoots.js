import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SHOOT_SELECT = `
  id, client_id, title, creative_notes,
  shoot_date, shoot_time, location, status,
  inspiration_links, calendar_event_id,
  created_by, created_at,
  clients(id, name, contact_name)
`

export function useShoots(clientId = null) {
  const [shoots, setShoots]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchShoots = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('shoots')
      .select(SHOOT_SELECT)
      .order('shoot_date', { ascending: true })

    if (clientId) q = q.eq('client_id', clientId)

    const { data, error: err } = await q
    if (err) { console.warn('useShoots:', err.message); setShoots([]) }
    else setShoots(data || [])
    setLoading(false)
  }, [clientId])

  useEffect(() => { fetchShoots() }, [fetchShoots])

  return { shoots, loading, error, refetch: fetchShoots }
}

export async function createShoot(data) {
  const { data: row, error } = await supabase
    .from('shoots')
    .insert([data])
    .select('id')
    .single()
  if (error) throw error
  return row
}

export async function updateShoot(id, data) {
  const { error } = await supabase.from('shoots').update(data).eq('id', id)
  if (error) throw error
}

export async function deleteShoot(id) {
  const { error } = await supabase.from('shoots').delete().eq('id', id)
  if (error) throw error
}
