import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Loader2, ChevronDown } from 'lucide-react'
import { useClientRequests } from '../../hooks/useContentRequests'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'facebook',  label: 'Facebook' },
  { value: 'youtube',   label: 'YouTube' },
  { value: 'linkedin',  label: 'LinkedIn' },
  { value: 'reddit',    label: 'Reddit' },
  { value: 'nextdoor',  label: 'Nextdoor' },
  { value: 'other',     label: 'Other' },
]

const PRIORITIES = [
  { value: 'low',    label: 'Low',    desc: 'Whenever you get to it' },
  { value: 'normal', label: 'Normal', desc: 'Standard timeline' },
  { value: 'high',   label: 'High',   desc: 'Need this soon' },
  { value: 'urgent', label: 'Urgent', desc: 'ASAP' },
]

export default function RequestPost() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { submitRequest } = useClientRequests()
  const [clientId, setClientId] = useState(null)
  const [form, setForm] = useState({
    idea: '',
    platform: '',
    priority: 'normal',
    notes: '',
    inspiration_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // Resolve the client_id for this user
  useEffect(() => {
    if (!user) return
    supabase
      .from('client_access')
      .select('client_id')
      .eq('profile_id', user.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.client_id) setClientId(data.client_id)
      })
  }, [user])

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.idea.trim()) return
    setSaving(true)
    setError('')
    try {
      await submitRequest({ ...form, type: 'post_request', client_id: clientId })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="p-8 max-w-lg">
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-text-primary mb-1">Request submitted!</h2>
          <p className="text-sm text-text-secondary mb-6">
            Your team has been notified and will get started on your post.
          </p>
          <div className="flex gap-3">
            <button onClick={() => { setDone(false); setForm({ idea: '', platform: '', priority: 'normal', notes: '', inspiration_url: '' }) }}
              className="btn-secondary flex-1">
              Submit another
            </button>
            <button onClick={() => navigate('/client')} className="btn-primary flex-1">
              Back to home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Request a Post</h1>
        <p className="text-text-secondary mt-1">Tell your team what you have in mind.</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Idea */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            What's the idea? <span className="text-red-400">*</span>
          </label>
          <textarea
            className="input w-full resize-none"
            rows={4}
            placeholder="Describe the post concept, message, or topic..."
            value={form.idea}
            onChange={(e) => set('idea', e.target.value)}
            required
          />
        </div>

        {/* Platform */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Platform</label>
          <div className="relative">
            <select
              className="input w-full appearance-none pr-8"
              value={form.platform}
              onChange={(e) => set('platform', e.target.value)}
            >
              <option value="">Select a platform</option>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-2">Priority</label>
          <div className="grid grid-cols-2 gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => set('priority', p.value)}
                className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                  form.priority === p.value
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <p className={`text-xs font-semibold ${form.priority === p.value ? 'text-accent' : 'text-text-primary'}`}>
                  {p.label}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Inspiration */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Inspiration link <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            type="url"
            className="input w-full"
            placeholder="https://..."
            value={form.inspiration_url}
            onChange={(e) => set('inspiration_url', e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Additional notes <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            className="input w-full resize-none"
            rows={3}
            placeholder="Anything else your team should know..."
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={!form.idea.trim() || saving}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Submit Request
        </button>
      </form>
    </div>
  )
}
