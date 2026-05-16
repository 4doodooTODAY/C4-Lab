import { useState, useEffect, useCallback } from 'react'
import { startOfMonth, endOfMonth, addDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useCalendarEvents(year, month) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const { user } = useAuth()

  const fetchEvents = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    // Fetch the full month plus a few days either side so multi-day events at edges show
    const base     = new Date(year, month - 1, 1)
    const rangeStart = startOfMonth(base).toISOString()
    const rangeEnd   = addDays(endOfMonth(base), 1).toISOString()

    const { data, error } = await supabase
      .from('calendar_events')
      .select(`
        *,
        calendar_event_members (
          profile_id,
          profiles ( id, full_name, avatar_url )
        )
      `)
      .lte('start_at', rangeEnd)
      .gte('end_at',   rangeStart)
      .order('start_at', { ascending: true })

    if (error) setError(error.message)
    else setEvents(data || [])
    setLoading(false)
  }, [year, month, user])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const addEvent = async ({ title, description, event_type, start_at, end_at, all_day, location, meeting_url, client_id, member_ids = [] }) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('calendar_events')
      .insert([{ title, description, event_type, start_at, end_at, all_day, location, meeting_url, client_id: client_id || null, created_by: authUser.id }])
      .select()
      .single()
    if (error) throw error

    // Insert members
    if (member_ids.length) {
      await supabase.from('calendar_event_members').insert(
        member_ids.map((profile_id) => ({ event_id: data.id, profile_id }))
      )
    }

    await fetchEvents()
    return data
  }

  const updateEvent = async (id, { title, description, event_type, start_at, end_at, all_day, location, meeting_url, client_id, member_ids }) => {
    const { data, error } = await supabase
      .from('calendar_events')
      .update({ title, description, event_type, start_at, end_at, all_day, location, meeting_url, client_id: client_id || null })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    // Replace members
    if (member_ids !== undefined) {
      await supabase.from('calendar_event_members').delete().eq('event_id', id)
      if (member_ids.length) {
        await supabase.from('calendar_event_members').insert(
          member_ids.map((profile_id) => ({ event_id: id, profile_id }))
        )
      }
    }

    await fetchEvents()
    return data
  }

  const deleteEvent = async (id) => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) throw error
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  return { events, loading, error, addEvent, updateEvent, deleteEvent, refetch: fetchEvents }
}
