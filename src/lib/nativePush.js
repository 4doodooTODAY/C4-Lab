/**
 * Native (iOS/Android) push registration, via Capacitor.
 *
 * Prep only — there's no Firebase/APNs credential wired up on the server
 * side yet (see supabase/functions/send-notification/index.ts), and the iOS
 * app isn't in the App Store yet either. This gets a device's token saved to
 * push_subscriptions so that once server-side delivery exists, there's
 * nothing left to do on the client.
 *
 * No-ops entirely on web; only runs inside the native shell.
 */
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

export function isNativePushAvailable() {
  return Capacitor.isNativePlatform()
}

/** Request permission (if needed) and register this device's token. Resolves true/false. */
export async function registerNativePush(profileId) {
  if (!Capacitor.isNativePlatform() || !profileId) return false

  let permStatus = await PushNotifications.checkPermissions()
  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions()
  }
  if (permStatus.receive !== 'granted') return false

  const platform = Capacitor.getPlatform() // 'ios' | 'android'

  return new Promise((resolve) => {
    const regSub = PushNotifications.addListener('registration', async (token) => {
      regSub.remove()
      errSub.remove()
      const { error } = await supabase.from('push_subscriptions').upsert({
        profile_id:   profileId,
        platform,
        device_token: token.value,
      }, { onConflict: 'device_token' })
      resolve(!error)
    })
    const errSub = PushNotifications.addListener('registrationError', (err) => {
      regSub.remove()
      errSub.remove()
      console.error('Native push registration failed:', err)
      resolve(false)
    })
    PushNotifications.register()
  })
}

/** Call the handler with the notification's data payload when the user taps it. Returns an unsubscribe fn. */
export function onNativePushOpened(handler) {
  if (!Capacitor.isNativePlatform()) return () => {}
  const sub = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    handler(action.notification?.data || {})
  })
  return () => sub.remove()
}
