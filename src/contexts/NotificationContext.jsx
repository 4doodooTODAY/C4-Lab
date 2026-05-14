import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const VAPID_PUBLIC_KEY = 'BJhLo2Yrmpz1sspZUGYB_hStsFhz5-9-HGUXcVfrPm4-EuovmBH6n57TgwTtUlxgo3NnQvewY6ZAnWhRBbYpwTY'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)))
}

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [panelOpen, setPanelOpen]         = useState(false)
  const [pushEnabled, setPushEnabled]     = useState(false)
  const [pushLoading, setPushLoading]     = useState(false)

  // Load notifications
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setNotifications(data || [])
        setUnreadCount((data || []).filter((n) => !n.read).length)
      })
  }, [user?.id])

  // Realtime — new notifications
  useEffect(() => {
    if (!user?.id) return
    const ch = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `profile_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications((prev) => [payload.new, ...prev])
        setUnreadCount((prev) => prev + 1)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user?.id])

  // Check if push already enabled
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setPushEnabled(!!sub)
    }).catch(() => {})
  }, [])

  const markRead = useCallback(async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    if (!user?.id) return
    await supabase.from('notifications').update({ read: true })
      .eq('profile_id', user.id).eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [user?.id])

  const enablePush = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !user?.id) return
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setPushLoading(false); return }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const json = sub.toJSON()
      await supabase.from('push_subscriptions').upsert({
        profile_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
      }, { onConflict: 'endpoint' })
      setPushEnabled(true)
    } catch (err) {
      console.error('Push enable failed:', err)
    }
    setPushLoading(false)
  }, [user?.id])

  // Register service worker on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount,
      panelOpen, setPanelOpen,
      pushEnabled, pushLoading, enablePush,
      markRead, markAllRead,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
