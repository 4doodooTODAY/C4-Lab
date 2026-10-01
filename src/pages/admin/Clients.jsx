import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Loader2, Building2, Check, Mail, Phone, ChevronRight, Trash2, AlertTriangle, UserPlus, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useClients } from '../../hooks/useClients'
import Avatar from '../../components/ui/Avatar'
import { addClientPerson } from '../../lib/clientPeople'

// ── Delete Confirm Modal ───────────────────────────────────────────────────────
function DeleteClientModal({ client, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      const { error: err } = await supabase.from('clients').delete().eq('id', client.id)
      if (err) throw new Error(err.message)
      onDeleted()
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-status-overdue-bg flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-status-overdue-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Delete client?</h2>
            <p className="text-xs text-text-muted mt-0.5">This cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-text-secondary mb-5">
          <strong>{client.contact_name || client.name}</strong> and all their associated data (projects, shoots, concepts, files) will be permanently deleted.
        </p>
        {error && <p className="text-xs text-status-overdue-text bg-status-overdue-bg border border-status-overdue/30 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Invite Modal ──────────────────────────────────────────────────────────────
function InviteClientModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const [contactName, setContactName] = useState('')
  const [business, setBusiness]       = useState('')
  const [email, setEmail]             = useState('')
  const [phone, setPhone]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [sent, setSent]               = useState(false)
  // Extra people who sign in to the same client account
  const [extras, setExtras]           = useState([])   // [{ full_name, email }]
  const [results, setResults]         = useState([])   // [{ email, ok, error?, link? }]

  const setExtra = (i, key, value) =>
    setExtras((prev) => prev.map((p, j) => (j === i ? { ...p, [key]: value } : p)))

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
          action:       'invite_client',
          contact_name: contactName.trim(),
          business:     business.trim(),
          email:        email.trim(),
          phone:        phone.trim(),
          created_by:   user?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      const out = [{ email: email.trim(), ok: true, link: data?.emailed === false ? data.invite_link : null }]
      for (const p of extras.filter((x) => x.full_name.trim() && x.email.trim())) {
        try {
          const r = await addClientPerson(data.client.id, { full_name: p.full_name.trim(), email: p.email.trim() })
          out.push({ email: p.email.trim(), ok: true, link: r.invited && !r.emailed ? r.invite_link : null })
        } catch (err) {
          out.push({ email: p.email.trim(), ok: false, error: err.message })
        }
      }
      setResults(out)
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
      <div className="relative card shadow-2xl w-full max-w-md p-8 z-10 text-center">
        <div className="w-12 h-12 rounded-full bg-status-approved-bg flex items-center justify-center mx-auto mb-4">
          <Check size={22} className="text-status-approved-text" />
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1">
          {results.length > 1 ? 'Invites sent' : 'Invite sent'}
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Each person gets an email to set their password, then lands in the {business.trim() || 'client'} portal.
        </p>
        <div className="space-y-1.5 mb-5 text-left">
          {results.map((r) => (
            <div key={r.email} className="text-xs flex items-start gap-2">
              {r.ok
                ? <Check size={12} className="text-status-approved-text shrink-0 mt-0.5" />
                : <AlertTriangle size={12} className="text-status-overdue-text shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-text-primary truncate">{r.email}</p>
                {r.error && <p className="text-status-overdue-text">{r.error}</p>}
                {r.link && (
                  <button
                    onClick={() => navigator.clipboard.writeText(r.link).catch(() => {})}
                    className="text-status-review-text hover:underline"
                  >
                    Email did not send. Copy setup link
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card shadow-2xl w-full max-w-md p-6 z-10 max-h-[90vh] overflow-y-auto">
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
          <div className="pt-1">
            <div className="flex items-center justify-between">
              <label className="label mb-0">More people on this account</label>
              <button
                type="button"
                onClick={() => setExtras((prev) => [...prev, { full_name: '', email: '' }])}
                className="text-xs text-accent hover:underline font-medium flex items-center gap-1"
              >
                <UserPlus size={12} /> Add person
              </button>
            </div>
            {extras.length === 0 ? (
              <p className="text-[11px] text-text-muted mt-1">Optional. Each person gets their own login to the same client portal.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {extras.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={p.full_name} onChange={(e) => setExtra(i, 'full_name', e.target.value)}
                      placeholder="Full name" className="input flex-1 min-w-0" required />
                    <input type="email" value={p.email} onChange={(e) => setExtra(i, 'email', e.target.value)}
                      placeholder="their@email.com" className="input flex-1 min-w-0" required />
                    <button type="button" onClick={() => setExtras((prev) => prev.filter((_, j) => j !== i))}
                      className="btn-ghost p-2 shrink-0" title="Remove">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-xs text-status-overdue-text bg-status-overdue-bg border border-status-overdue/30 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {extras.length ? `Send ${extras.length + 1} Invites` : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Client Card ───────────────────────────────────────────────────────────────
function ClientCard({ client, onClick, onDelete }) {
  const assigned = (client.client_creatives || []).map((a) => ({
    ...a.profiles,
    assignedRole: a.role,
  })).filter((a) => a.id)
  const isPending  = !client.profile_id || client._profile?.must_change_password
  const peopleCount = (client.client_members || []).length
  const [resending, setResending] = useState(false)
  const [resent, setResent]       = useState(false)
  const [resendErr, setResendErr] = useState('')

  const handleResend = async (e) => {
    e.stopPropagation()
    const email = client.email || client.contact_email
    if (!email) { setResendErr('No email on file'); return }
    setResending(true)
    setResendErr('')
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
          action:    'resend_invite',
          email,
          full_name: client.contact_name || client.name,
          role:      'client',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setResent(true)
      setTimeout(() => setResent(false), 4000)
    } catch (err) {
      setResendErr(err.message)
    } finally {
      setResending(false)
    }
  }

  return (
    <div
      onClick={onClick}
      className="card border border-border p-5 hover:shadow-md hover:border-border-strong transition-all cursor-pointer flex flex-col gap-4"
    >
      {/* Top: avatar + name + status */}
      <div className="flex items-start gap-3">
        <Avatar name={client.contact_name || client.name} size={10} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">
            {client.contact_name || 'Not set'}
          </p>
          <p className="text-xs text-text-muted truncate">{client.name || ''}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            isPending ? 'bg-status-due-soon-bg text-status-due-soon-text' : 'bg-status-approved-bg text-status-approved-text'
          }`}>
            {isPending ? 'Invite pending' : 'Active'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(client) }}
            className="p-1 rounded-lg text-text-muted hover:bg-status-overdue-bg hover:text-status-overdue-text transition-colors"
            title="Delete client"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Contact info */}
      <div className="space-y-1.5">
        {(client.contact_email || client.email) && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Mail size={11} className="shrink-0" />
            <span className="truncate">{client.contact_email || client.email}</span>
          </div>
        )}
        {(client.contact_phone || client.phone) && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Phone size={11} className="shrink-0" />
            <span>{client.contact_phone || client.phone}</span>
          </div>
        )}
        {peopleCount > 1 && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Users size={11} className="shrink-0" />
            <span>{peopleCount} people can sign in</span>
          </div>
        )}
        {!client.contact_email && !client.email && !client.contact_phone && !client.phone && (
          <p className="text-xs text-text-muted/50 italic">No contact info</p>
        )}
        {isPending && (
          <div className="pt-1">
            <button
              onClick={handleResend}
              disabled={resending || resent}
              className="flex items-center gap-1.5 text-xs font-medium text-status-review-text hover:underline disabled:opacity-60 disabled:no-underline"
              title="Resend the invitation email"
            >
              {resending ? <Loader2 size={11} className="animate-spin" /> : resent ? <Check size={11} /> : <Mail size={11} />}
              {resent ? 'Invite re-sent' : resending ? 'Sending…' : 'Resend invite'}
            </button>
            {resendErr && <p className="text-[10px] text-status-overdue-text mt-1">{resendErr}</p>}
          </div>
        )}
      </div>

      {/* Footer: team */}
      <div className="flex items-start justify-between pt-2 border-t border-border">
        {assigned.length === 0 ? (
          <span className="text-xs text-text-muted italic">No team assigned</span>
        ) : (
          <div className="flex flex-col gap-1 flex-1">
            {assigned.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <Avatar name={p.full_name} url={p.avatar_url} size={5} />
                <span className="text-xs text-text-primary font-medium truncate">{p.full_name}</span>
                {p.assignedRole && (
                  <span className="text-[10px] text-text-muted capitalize shrink-0">· {p.assignedRole}</span>
                )}
              </div>
            ))}
            {assigned.length > 3 && (
              <span className="text-[10px] text-text-muted">+{assigned.length - 3} more</span>
            )}
          </div>
        )}
        <ChevronRight size={13} className="text-text-muted shrink-0 mt-0.5" />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Clients() {
  const navigate = useNavigate()
  const { clients, loading, refetch } = useClients()
  const [showInvite,  setShowInvite]  = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onClick={() => navigate(`/admin/clients/${client.id}`)}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {showInvite && (
        <InviteClientModal
          onClose={() => setShowInvite(false)}
          onCreated={refetch}
        />
      )}
      {deleteTarget && (
        <DeleteClientModal
          client={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); refetch() }}
        />
      )}
    </div>
  )
}
