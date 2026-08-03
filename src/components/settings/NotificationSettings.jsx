import { useState, useEffect } from 'react'
import { Bell, Loader2, Check, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Capacitor } from '@capacitor/core'
import { useNotifications } from '../../contexts/NotificationContext'

const IS_NATIVE = Capacitor.isNativePlatform()

const CADENCES = [
  { value: 'daily',    label: 'Daily',     desc: 'Every morning' },
  { value: 'weekly',   label: 'Weekly',    desc: 'Monday mornings' },
  { value: 'biweekly', label: 'Bi-weekly', desc: 'Every other Monday' },
  { value: 'off',      label: 'Off',       desc: 'No digests' },
]

export default function NotificationSettings() {
  const { user, profile } = useAuth()
  const { pushEnabled, pushLoading, enablePush } = useNotifications()

  const [cadence, setCadence]   = useState('weekly')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState('')

  useEffect(() => {
    if (!user?.id) return
    supabase.from('notification_preferences')
      .select('cadence').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.cadence) setCadence(data.cadence)
        setLoading(false)
      })
  }, [user?.id])

  const saveCadence = async (value) => {
    setCadence(value)
    setSaving(true)
    setSaved(false)
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: user.id, cadence: value, updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setTestResult('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-digests`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ test: true }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'failed')
      setTestResult(data.sent > 0
        ? 'Test notification sent. Check your device.'
        : 'No active subscription found. Enable push first.')
    } catch (err) {
      setTestResult(`Test failed: ${err.message}`)
    }
    setTesting(false)
  }

  const digestDescription = profile?.role === 'client'
    ? "You'll get a digest of projects awaiting your review and ones you've reviewed."
    : "You'll get a digest of projects assigned to you and their status changes."

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={15} className="text-text-muted" />
        <h2 className="text-sm font-semibold text-text-primary">Notifications</h2>
        {saving && <Loader2 size={12} className="animate-spin text-text-muted" />}
        {saved && <Check size={12} className="text-green-500" />}
      </div>
      <p className="text-xs text-text-muted mb-5">{digestDescription}</p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-5">
          {/* Push enable. Web push only; hidden in the native app (no web push
              in the iOS webview) so it never shows a control that can't work. */}
          {!IS_NATIVE && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-text-primary">Push notifications</p>
                <p className="text-[11px] text-text-muted">
                  {pushEnabled ? 'Enabled on this device' : 'Get digests even when the app is closed'}
                </p>
              </div>
              {pushEnabled ? (
                <span className="text-xs font-medium text-status-approved-text bg-status-approved-bg px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Check size={11} /> On
                </span>
              ) : (
                <button onClick={enablePush} disabled={pushLoading}
                  className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5">
                  {pushLoading && <Loader2 size={11} className="animate-spin" />}
                  Enable
                </button>
              )}
            </div>
          )}

          {/* Cadence */}
          <div>
            <p className="text-xs font-medium text-text-primary mb-2">Digest frequency</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CADENCES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => saveCadence(c.value)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    cadence === c.value
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:bg-surface-2'
                  }`}
                >
                  <p className={`text-xs font-semibold ${cadence === c.value ? 'text-accent' : 'text-text-primary'}`}>
                    {c.label}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">{c.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Test */}
          {pushEnabled && (
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={sendTest} disabled={testing}
                className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50">
                {testing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                Send test notification
              </button>
              {testResult && <span className="text-[11px] text-text-muted">{testResult}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
