import { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, Loader2, Check, Copy, ChevronDown, ChevronUp,
  Camera, Link as LinkIcon, Users, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'

const GALLERY_TYPES = [
  { value: 'lightroom', label: 'Lightroom' },
  { value: 'pixieset',  label: 'Pixieset'  },
]

function publicLink(slug) {
  return `${window.location.origin}/s/${slug}`
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-border hover:bg-surface-2 transition-colors text-text-muted shrink-0"
    >
      {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Create modal ───────────────────────────────────────────────────────────────
function CreateShootModal({ onClose, onCreated }) {
  const [title,       setTitle]       = useState('')
  const [galleryUrl,  setGalleryUrl]  = useState('')
  const [galleryType, setGalleryType] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [created,     setCreated]     = useState(null)  // inserted row

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validate
    if (!title.trim())        return setError('Title is required.')
    if (!galleryType)         return setError('Select a gallery type.')
    let url = galleryUrl.trim()
    if (!url)                 return setError('Gallery URL is required.')
    try { new URL(url) } catch { return setError('Enter a valid URL (include https://).') }

    setSaving(true)
    try {
      const { data, error: err } = await supabase
        .from('one_off_shoots')
        .insert({ title: title.trim(), gallery_url: url, gallery_type: galleryType })
        .select('id, slug, title, gallery_type, active, created_at')
        .single()
      if (err) throw new Error(err.message)
      setCreated(data)
      onCreated()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">New One-Off Shoot</h2>
          {!saving && (
            <button onClick={onClose} className="btn-ghost p-1.5 -mr-1"><X size={16} /></button>
          )}
        </div>

        {created ? (
          <div className="px-6 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Check size={22} className="text-green-600" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">{created.title}</p>
            <p className="text-xs text-text-muted mb-4">Shoot created — share this link with the client</p>
            <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2 text-left mb-5">
              <LinkIcon size={12} className="text-text-muted shrink-0" />
              <span className="text-xs text-text-secondary font-mono truncate flex-1">{publicLink(created.slug)}</span>
              <CopyButton text={publicLink(created.slug)} />
            </div>
            <button onClick={onClose} className="btn-primary">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="label">Shoot title</label>
              <input
                className="input"
                placeholder="e.g. Smith Family Session"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Gallery type</label>
              <select
                className="input"
                value={galleryType}
                onChange={(e) => setGalleryType(e.target.value)}
                disabled={saving}
              >
                <option value="">Select…</option>
                {GALLERY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Gallery URL</label>
              <input
                className="input"
                placeholder="https://"
                value={galleryUrl}
                onChange={(e) => setGalleryUrl(e.target.value)}
                disabled={saving}
                type="url"
              />
            </div>
            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Leads drawer ───────────────────────────────────────────────────────────────
function LeadsDrawer({ shoot }) {
  const [leads,   setLeads]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('shoot_leads')
      .select('id, name, email, phone, created_at')
      .eq('shoot_id', shoot.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setLeads(data || [])
        setLoading(false)
      })
  }, [shoot.id])

  if (loading) return (
    <div className="px-4 py-3 flex items-center gap-2 text-xs text-text-muted">
      <Loader2 size={12} className="animate-spin" /> Loading leads…
    </div>
  )

  if (!leads?.length) return (
    <div className="px-4 py-3 text-xs text-text-muted">No leads yet.</div>
  )

  return (
    <div className="divide-y divide-border">
      {leads.map((lead) => (
        <div key={lead.id} className="px-4 py-3 flex items-center gap-4 text-xs">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary truncate">{lead.name}</p>
            <p className="text-text-muted truncate">{lead.email}{lead.phone ? ` · ${lead.phone}` : ''}</p>
          </div>
          <p className="text-text-muted shrink-0">{format(new Date(lead.created_at), 'MMM d, yyyy')}</p>
        </div>
      ))}
    </div>
  )
}

// ── Shoot row ──────────────────────────────────────────────────────────────────
function ShootRow({ shoot, onToggleActive }) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const link = publicLink(shoot.slug)

  const handleToggle = async (e) => {
    e.stopPropagation()
    setToggling(true)
    await supabase
      .from('one_off_shoots')
      .update({ active: !shoot.active })
      .eq('id', shoot.id)
    onToggleActive(shoot.id, !shoot.active)
    setToggling(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-surface-2/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
          <Camera size={16} className="text-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-text-primary truncate">{shoot.title}</p>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-text-muted capitalize">
              {shoot.gallery_type}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${shoot.active ? 'bg-green-50 text-green-700' : 'bg-surface-2 text-text-muted'}`}>
              {shoot.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-text-muted font-mono truncate max-w-[260px]">{link}</span>
            <CopyButton text={link} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <p className="text-[10px] text-text-muted hidden sm:block">
            {format(new Date(shoot.created_at), 'MMM d, yyyy')}
          </p>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
            title={shoot.active ? 'Deactivate' : 'Activate'}
          >
            {toggling
              ? <Loader2 size={16} className="animate-spin" />
              : shoot.active
                ? <ToggleRight size={20} className="text-green-500" />
                : <ToggleLeft size={20} />
            }
          </button>
          {expanded
            ? <ChevronUp size={14} className="text-text-muted" />
            : <ChevronDown size={14} className="text-text-muted" />
          }
        </div>
      </div>

      {/* Leads drawer */}
      {expanded && (
        <div className="border-t border-border bg-surface-2/30">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            <Users size={11} className="text-text-muted" />
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Leads</span>
          </div>
          <LeadsDrawer shoot={shoot} />
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function OneOffShoots() {
  const [shoots,      setShoots]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('one_off_shoots')
      .select('id, slug, title, gallery_type, active, created_at')
      .order('created_at', { ascending: false })
    setShoots(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggleActive = (id, newActive) => {
    setShoots((prev) => prev.map((s) => s.id === id ? { ...s, active: newActive } : s))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">One-Off Shoots</h1>
          <p className="text-sm text-text-muted mt-0.5">Create shareable gallery links for one-time sessions</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={14} /> New Shoot
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : shoots.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
            <Camera size={24} className="text-text-muted" />
          </div>
          <p className="text-sm font-semibold text-text-primary mb-1">No shoots yet</p>
          <p className="text-xs text-text-muted mb-4">Create a shoot to generate a shareable gallery link</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 mx-auto">
            <Plus size={14} /> New Shoot
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {shoots.map((shoot) => (
            <ShootRow key={shoot.id} shoot={shoot} onToggleActive={handleToggleActive} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateShootModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}
