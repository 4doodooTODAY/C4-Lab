import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Loader2, Building2, Check, Mail, Phone, ChevronRight, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useClients, useCreatives } from '../../hooks/useClients'
import Avatar from '../../components/ui/Avatar'

// ── Invite Modal ─────────────────────────────────────────────────────────────
function InviteClientModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const [contactName, setContactName] = useState('')
  const [business, setBusiness] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'invite_client',
          contact_name: contactName.trim(),
          business: business.trim(),
          email: email.trim(),
          phone: phone.trim(),
          created_by: user?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setSent(true)
      onCreated()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (sent) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 z-10 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <Check size={22} className="text-green-600" />
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1">Invite sent!</h2>
        <p className="text-sm text-text-secondary mb-5">
          {email} will receive an email to set their password and access their client portal.
        </p>
        <button onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Invite Client</h2>
            <p className="text-xs text-text-muted mt-0.5">They'll get an email to create their account.</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Contact Name</label>
              <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Smith" className="input" autoFocus required />
            </div>
            <div>
              <label className="label">Business Name</label>
              <input type="text" value={business} onChange={(e) => setBusiness(e.target.value)}
                placeholder="Acme Corp" className="input" required />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@acmecorp.com" className="input" required />
          </div>
          <div>
            <label className="label">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000" className="input" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Send Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ client }) {
  // A client is "active" if their profile has logged in (must_change_password = false)
  const isPending = !client.profile_id || client._profile?.must_change_password
  if (isPending) return (
    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Invite pending</span>
  )
  return (
    <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Clients() {
  const navigate = useNavigate()
  const { clients, loading, refetch } = useClients()
  const [showInvite, setShowInvite] = useState(false)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Clients</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {clients.length} total · manage client accounts and assignments
          </p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Invite Client
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-text-muted" />
        </div>
      ) : clients.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 size={36} className="mx-auto text-text-muted/30 mb-3" />
          <p className="text-sm font-semibold text-text-primary mb-1">No clients yet</p>
          <p className="text-sm text-text-muted">Invite your first client to get started.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-2.5">Client</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-2.5">Business</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-2.5">Contact</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-2.5">Status</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-2.5">Team</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((client) => {
                const assigned = (client.client_access || []).map((a) => a.profiles).filter(Boolean)
                return (
                  <tr
                    key={client.id}
                    className="hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => navigate(`/admin/clients/${client.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={client.contact_name || client.name} size={8} />
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {client.contact_name || '—'}
                          </p>
                          <p className="text-xs text-text-muted truncate max-w-[140px]">
                            {client.email || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-text-primary">{client.name || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {client.phone ? (
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                          <Phone size={11} />
                          {client.phone}
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge client={client} />
                    </td>
                    <td className="px-4 py-3">
                      {assigned.length === 0 ? (
                        <span className="text-xs text-text-muted">Unassigned</span>
                      ) : (
                        <div className="flex -space-x-1.5">
                          {assigned.slice(0, 4).map((p) => (
                            <Avatar key={p.id} name={p.full_name} url={p.avatar_url} size={6} />
                          ))}
                          {assigned.length > 4 && (
                            <div className="w-6 h-6 rounded-full bg-surface-3 border-2 border-white flex items-center justify-center text-[9px] font-semibold text-text-muted">
                              +{assigned.length - 4}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight size={14} className="text-text-muted ml-auto" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <InviteClientModal
          onClose={() => setShowInvite(false)}
          onCreated={refetch}
        />
      )}
    </div>
  )
}
