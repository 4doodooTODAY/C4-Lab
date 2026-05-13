import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useCalendarEvents(year, month) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { user } = useAuth()

  const fetchEvents = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('event_date', start)
      .lt('event_date', end)
      .order('event_date', { ascending: true })
    if (error) setError(error.message)
    else setEvents(data || [])
    setLoading(false)
  }, [year, month, user])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const addEvent = async ({ title, description, event_date, event_type, color }) => {
    const { data, error } = await supabase
      .from('calendar_events')
      .insert([{ title, description, event_date, event_type, color, user_id: user.id }])
      .select()
      .single()
    if (error) throw error
    setEvents((prev) => [...prev, data].sort((a, b) => a.event_date.localeCompare(b.event_date)))
    return data
  }

  const updateEvent = async (id, updates) => {
    const { data, error } = await supabase
      .from('calendar_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setEvents((prev) => prev.map((e) => (e.id === id ? data : e)))
    return data
  }

  const deleteEvent = async (id) => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) throw error
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  return { events, loading, error, addEvent, updateEvent, deleteEvent, refetch: fetchEvents }
}
