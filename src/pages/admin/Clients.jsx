import { useState } from 'react'
import { Plus, X, UserPlus, Loader2, Building2, Users } from 'lucide-react'
import { useClients, useCreatives } from '../../hooks/useClients'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function AddClientModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await onAdd(name.trim())
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-1 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Add Client Company</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Company Name</label>
            <input
              className="input w-full"
              placeholder="e.g. Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={!name.trim() || saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Add Client
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AssignCreativeModal({ client, creatives, assignedIds, onClose, onAssign, onRemove }) {
  const [busy, setBusy] = useState(null)

  const handle = async (profileId, isAssigned) => {
    setBusy(profileId)
    try {
      if (isAssigned) await onRemove(client.id, profileId)
      else await onAssign(client.id, profileId)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-1 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Assign Creatives</h2>
            <p className="text-xs text-text-muted mt-0.5">{client.name}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">
          <p className="text-xs text-text-muted mb-4">Toggle creatives to grant or revoke access to this client.</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {creatives.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No creatives found</p>
            )}
            {creatives.map((c) => {
              const isAssigned = assignedIds.includes(c.id)
              const isBusy = busy === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => handle(c.id, isAssigned)}
                  disabled={isBusy}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                    isAssigned
                      ? 'border-accent/30 bg-accent/5'
                      : 'border-border hover:border-border-strong bg-surface-2'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0 text-accent text-xs font-semibold">
                    {getInitials(c.full_name)}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-text-primary">{c.full_name}</p>
                    <p className="text-xs text-text-muted capitalize">{c.role}</p>
                  </div>
                  {isBusy ? (
                    <Loader2 size={14} className="animate-spin text-text-muted" />
                  ) : (
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      isAssigned ? 'bg-accent border-accent' : 'border-border-strong'
                    }`}>
                      {isAssigned && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <button onClick={onClose} className="btn-secondary w-full mt-4">Done</button>
        </div>
      </div>
    </div>
  )
}

export default function Clients() {
  const { clients, loading, addClient, assignCreative, removeCreative } = useClients()
  const creatives = useCreatives()
  const [showAdd, setShowAdd] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)

  const assignedIds = assignTarget
    ? (assignTarget.client_access || []).map((a) => a.profile_id)
    : []

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Clients</h1>
          <p className="text-text-secondary mt-1">Manage client companies and assign creatives.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} />
          Add Client
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-text-muted" />
        </div>
      ) : clients.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 size={36} className="mx-auto text-surface-3 mb-3" />
          <p className="text-sm font-semibold text-text-primary mb-1">No clients yet</p>
          <p className="text-sm text-text-muted">Add your first client company to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => {
            const assigned = (client.client_access || []).map((a) => a.profiles).filter(Boolean)
            return (
              <div key={client.id} className="card px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Building2 size={18} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{client.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {assigned.length === 0 ? (
                      <p className="text-xs text-text-muted">No creatives assigned</p>
                    ) : (
                      <>
                        <div className="flex -space-x-1.5">
                          {assigned.slice(0, 4).map((p) => (
                            <div
                              key={p.id}
                              title={p.full_name}
                              className="w-5 h-5 rounded-full bg-accent/30 border border-surface-1 flex items-center justify-center text-[9px] font-semibold text-accent"
                            >
                              {getInitials(p.full_name)}
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-text-muted">
                          {assigned.length === 1
                            ? assigned[0].full_name
                            : `${assigned.length} creatives`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setAssignTarget(client)}
                  className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  <UserPlus size={13} />
                  Manage
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddClientModal onClose={() => setShowAdd(false)} onAdd={addClient} />
      )}

      {assignTarget && (
        <AssignCreativeModal
          client={assignTarget}
          creatives={creatives}
          assignedIds={assignedIds}
          onClose={() => setAssignTarget(null)}
          onAssign={async (cId, pId) => {
            await assignCreative(cId, pId)
            setAssignTarget((prev) => ({
              ...prev,
              client_access: [...(prev.client_access || []), { profile_id: pId, profiles: creatives.find((c) => c.id === pId) }],
            }))
          }}
          onRemove={async (cId, pId) => {
            await removeCreative(cId, pId)
            setAssignTarget((prev) => ({
              ...prev,
              client_access: (prev.client_access || []).filter((a) => a.profile_id !== pId),
            }))
          }}
        />
      )}
    </div>
  )
}
