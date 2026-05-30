import { useState, useEffect } from 'react'
import { Plus, X, Loader2, Film, Camera, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { createProject } from '../../hooks/useProjects'

export default function NewProjectModal({ onClose, onCreated }) {
  const { user, isAdmin } = useAuth()
  const [clients,       setClients]    = useState([])
  const [clientTeam,    setClientTeam] = useState([])
  const [form, setForm] = useState({
    name: '',
    client_id: '',
    media_type: 'video',
    admin_review_required: false,
  })
  const [selectedEditor, setSelectedEditor] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Admins see all clients; creatives/editors see only their assigned clients
  useEffect(() => {
    if (isAdmin) {
      supabase.from('clients').select('id, name, contact_name').order('name')
        .then(({ data }) => setClients(data || []))
    } else {
      supabase
        .from('client_creatives')
        .select('client_id, clients(id, name, contact_name)')
        .eq('profile_id', user.id)
        .then(({ data }) => setClients((data || []).map((r) => r.clients).filter(Boolean)))
    }
  }, [isAdmin, user?.id])

  useEffect(() => {
    if (!form.client_id) { setClientTeam([]); setSelectedEditor(''); return }
    Promise.all([
      supabase.from('client_creatives')
        .select('profile_id, role, profiles(id, full_name, avatar_url, role)')
        .eq('client_id', form.client_id),
      supabase.from('profiles').select('id, full_name, avatar_url, role').eq('role', 'admin'),
    ]).then(([{ data: ccData }, { data: admins }]) => {
      const members = (ccData || []).map((a) => ({ ...a.profiles, assignedRole: a.role }))
      const memberIds = new Set(members.map((m) => m.id))
      // Add admins not already in the list
      ;(admins || []).forEach((a) => {
        if (!memberIds.has(a.id)) members.push({ ...a, assignedRole: 'admin' })
      })
      setClientTeam(members)
      setSelectedEditor('')
    })
  }, [form.client_id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        name:                  form.name.trim(),
        client_id:             form.client_id || null,
        stage:                 'pitch',
        created_by:            user?.id,
        admin_review_required: form.admin_review_required,
        editor_id:             selectedEditor || null,
        status:                'active',
        media_type:            form.media_type,
      }
      const row = await createProject(payload)
      onCreated(row.id)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">New Project</h2>
            <p className="text-xs text-text-muted mt-0.5">Choose a client first — team members will filter automatically.</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Client */}
          <div>
            <label className="label">Client *</label>
            <select className="input" value={form.client_id} onChange={set('client_id')} required>
              <option value="">— Select a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.contact_name || c.name}</option>
              ))}
            </select>
          </div>

          {/* Project name */}
          <div>
            <label className="label">Project Name *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Brand Campaign Q3"
              value={form.name}
              onChange={set('name')}
              required
            />
          </div>

          {/* Media type */}
          <div>
            <label className="label">Project Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'video', label: 'Video', icon: Film,   desc: 'Timeline-based revisions' },
                { value: 'photo', label: 'Photo', icon: Camera, desc: 'Pinpoint photo comments' },
              ].map(({ value, label, icon: Icon, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, media_type: value }))}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    form.media_type === value ? 'border-accent bg-accent/5' : 'border-border hover:border-border-strong'
                  }`}
                >
                  <Icon size={18} className={form.media_type === value ? 'text-accent mt-0.5' : 'text-text-muted mt-0.5'} />
                  <div>
                    <p className={`text-sm font-semibold ${form.media_type === value ? 'text-accent' : 'text-text-primary'}`}>{label}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Team — only after client selected */}
          {form.client_id && (
            <div className="p-3 bg-surface-2/40 rounded-xl border border-border space-y-3">
              <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Users size={12} /> Assign Team
                {clientTeam.length === 0 && <span className="font-normal text-text-muted">(no members assigned to this client yet)</span>}
              </p>
              {clientTeam.length > 0 && (
                <div>
                  <label className="label">Editor</label>
                  <select className="input" value={selectedEditor} onChange={(e) => setSelectedEditor(e.target.value)}>
                    <option value="">— None —</option>
                    {clientTeam.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}{m.role === 'admin' ? ' (admin)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Admin review gate — only for admins */}
          {isAdmin && (
            <label className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-accent/40 cursor-pointer transition-colors bg-surface-2/40">
              <input
                type="checkbox"
                className="mt-0.5 accent-accent"
                checked={form.admin_review_required}
                onChange={(e) => setForm((f) => ({ ...f, admin_review_required: e.target.checked }))}
              />
              <div>
                <p className="text-sm font-semibold text-text-primary">Admin must approve first edit</p>
                <p className="text-xs text-text-muted mt-0.5">The first cut goes to you for approval before the client sees it.</p>
              </div>
            </label>
          )}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || !form.client_id} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
