import { useState, useEffect, useRef } from 'react'
import {
  FileText, Loader2, CheckCircle2, Clock, XCircle,
  Link as LinkIcon, CalendarDays, Camera, Upload,
  MessageSquare, ChevronDown, ChevronUp, X, Edit2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getMyClient } from '../../lib/myClient'
import { format, parseISO } from 'date-fns'

const TYPE_LABELS = {
  post: 'Post', reel: 'Reel', story: 'Story', carousel: 'Carousel', other: 'Content',
}

const STATUS_CONFIG = {
  pending_client: {
    label: 'Awaiting your approval',
    icon: Clock,
    badge: 'bg-status-due-soon-bg text-status-due-soon-text border border-status-due-soon/30',
    bar: 'bg-amber-400',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    badge: 'bg-status-approved-bg text-status-approved-text border border-status-approved/30',
    bar: 'bg-green-400',
  },
  declined: {
    label: 'Declined',
    icon: XCircle,
    badge: 'bg-status-overdue-bg text-status-overdue-text border border-status-overdue/30',
    bar: 'bg-red-400',
  },
  scrapped: {
    label: 'Archived',
    icon: XCircle,
    badge: 'bg-surface-2 text-text-secondary border border-border',
    bar: 'bg-gray-300',
  },
}

// ── Approve Panel (expandable) ────────────────────────────────────────────────
function ApprovePanel({ draft, onConfirm, onCancel, saving }) {
  const [footageLinks, setFootageLinks] = useState([''])
  const [notes, setNotes] = useState('')

  const addLink = () => setFootageLinks((prev) => [...prev, ''])
  const updateLink = (i, val) => setFootageLinks((prev) => prev.map((l, idx) => idx === i ? val : l))
  const removeLink = (i) => setFootageLinks((prev) => prev.filter((_, idx) => idx !== i))

  const handleConfirm = () => {
    const links = footageLinks.map((l) => l.trim()).filter(Boolean)
    onConfirm({ footageLinks: links, notes: notes.trim() })
  }

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-4">
      {/* Footage upload links */}
      <div>
        <label className="flex items-center gap-2 text-xs font-semibold text-text-primary mb-2">
          <Upload size={12} className="text-accent" />
          Your Footage <span className="font-normal text-text-muted">(optional. Share a Google Drive, Dropbox, or WeTransfer link)</span>
        </label>
        <div className="space-y-2">
          {footageLinks.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="url"
                placeholder="https://drive.google.com/..."
                value={link}
                onChange={(e) => updateLink(i, e.target.value)}
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder-gray-300 bg-surface-2"
              />
              {footageLinks.length > 1 && (
                <button onClick={() => removeLink(i)} className="p-1.5 text-text-muted hover:text-text-secondary">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {footageLinks.length < 4 && (
            <button
              onClick={addLink}
              className="text-xs text-accent hover:underline font-medium"
            >
              + Add another link
            </button>
          )}
        </div>
      </div>

      {/* Notes / changes */}
      <div>
        <label className="flex items-center gap-2 text-xs font-semibold text-text-primary mb-2">
          <MessageSquare size={12} className="text-accent" />
          Notes or Changes <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <textarea
          rows={3}
          placeholder="Any changes to the concept, specific ideas, or anything else your team should know…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full text-sm px-3 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder-gray-300 bg-surface-2 resize-none"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface-2 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <><CheckCircle2 size={14} /> Confirm Approval</>}
        </button>
      </div>
    </div>
  )
}

// ── Concept Card ──────────────────────────────────────────────────────────────
function ConceptCard({ draft, onApprove, onDecline, onEdit, updating }) {
  const cfg  = STATUS_CONFIG[draft.status] || STATUS_CONFIG.pending_client
  const Icon = cfg.icon
  const isPending = draft.status === 'pending_client'
  const [showApprovePanel, setShowApprovePanel] = useState(false)
  const [showDeclinePanel, setShowDeclinePanel] = useState(false)
  const [showEditPanel,    setShowEditPanel]    = useState(false)
  const [declineNote, setDeclineNote] = useState('')
  const [editForm,    setEditForm]    = useState({
    type:              draft.type || 'post',
    title:             draft.title || '',
    concept:           draft.concept || '',
    target_date:       draft.target_date || '',
    inspiration_links: (draft.inspiration_links || []).join('\n'),
  })
  const [editSaved, setEditSaved] = useState(false)

  const closeAll = () => { setShowApprovePanel(false); setShowDeclinePanel(false); setShowEditPanel(false) }

  return (
    <div className="card border border-border shadow-sm overflow-hidden">
      <div className={`h-1 ${cfg.bar}`} />
      <div className="p-5 sm:p-6">
        {/* Top row */}
        <div className="flex items-start gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {draft.type && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-text-secondary">
                {TYPE_LABELS[draft.type] || draft.type}
              </span>
            )}
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
              <Icon size={9} /> {cfg.label}
            </span>
            {draft.target_date && (
              <span className="flex items-center gap-1 text-[10px] text-text-muted">
                <CalendarDays size={9} /> {format(parseISO(draft.target_date), 'MMM d')}
              </span>
            )}
          </div>
        </div>

        {draft.title && <h3 className="text-base sm:text-lg font-bold text-text-primary mb-1">{draft.title}</h3>}
        {draft.concept && <p className="text-sm text-text-secondary leading-relaxed mb-4">{draft.concept}</p>}

        {draft.shoots?.title && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-4">
            <Camera size={11} /> Linked to shoot: <span className="font-medium text-text-secondary">{draft.shoots.title}</span>
          </div>
        )}

        {draft.inspiration_links?.length > 0 && (
          <div className="flex flex-col gap-1 mb-4">
            {draft.inspiration_links.map((link, i) => (
              <a key={i} href={link} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline truncate">
                <LinkIcon size={10} className="shrink-0" /> {link}
              </a>
            ))}
          </div>
        )}

        {/* Approved. Show client footage/notes if any */}
        {draft.status === 'approved' && (draft.client_footage_links?.length > 0 || draft.client_notes) && (
          <div className="mb-4 p-3 rounded-xl bg-status-approved-bg border border-status-approved/30 space-y-2">
            {draft.client_footage_links?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-status-approved-text uppercase tracking-wide mb-1">Your Footage</p>
                {draft.client_footage_links.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-accent hover:underline">
                    <LinkIcon size={10} /> {link}
                  </a>
                ))}
              </div>
            )}
            {draft.client_notes && (
              <div>
                <p className="text-[10px] font-semibold text-status-approved-text uppercase tracking-wide mb-1">Your Notes</p>
                <p className="text-xs text-text-secondary">{draft.client_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* PENDING ACTIONS */}
        {isPending && (
          <div className="pt-4 border-t border-border">

            {/* Main 3 buttons */}
            {!showApprovePanel && !showDeclinePanel && !showEditPanel && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeclinePanel(true) }}
                  disabled={updating === draft.id}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface-2 transition-all disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  onClick={() => setShowEditPanel(true)}
                  disabled={updating === draft.id}
                  className="flex-1 py-2.5 rounded-xl border border-accent/40 text-sm font-semibold text-accent hover:bg-accent/5 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  onClick={() => setShowApprovePanel(true)}
                  disabled={updating === draft.id}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 size={13} /> Approve
                </button>
              </div>
            )}

            {/* Approve panel */}
            {showApprovePanel && (
              <ApprovePanel
                draft={draft}
                saving={updating === draft.id}
                onCancel={() => setShowApprovePanel(false)}
                onConfirm={({ footageLinks, notes }) => {
                  setShowApprovePanel(false)
                  onApprove(draft.id, footageLinks, notes)
                }}
              />
            )}

            {/* Decline panel */}
            {showDeclinePanel && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-text-primary">Let us know why (optional)</label>
                <textarea
                  rows={2}
                  placeholder="What didn't work? We'll use this to revise the concept…"
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 placeholder-gray-300 bg-surface-2 resize-none"
                />
                <div className="flex gap-3">
                  <button onClick={() => setShowDeclinePanel(false)}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface-2">
                    Cancel
                  </button>
                  <button
                    onClick={() => { setShowDeclinePanel(false); onDecline(draft.id, declineNote) }}
                    disabled={updating === draft.id}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {updating === draft.id ? <Loader2 size={14} className="animate-spin" /> : <><XCircle size={14} /> Decline</>}
                  </button>
                </div>
              </div>
            )}

            {/* Edit panel */}
            {showEditPanel && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-text-primary">Make your changes. We'll be notified.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-1 block">Type</label>
                    <select value={editForm.type} onChange={e => setEditForm(f => ({...f, type: e.target.value}))}
                      className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/30">
                      <option value="post">Post</option>
                      <option value="reel">Reel</option>
                      <option value="story">Story</option>
                      <option value="carousel">Carousel</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-1 block">Post Date</label>
                    <input type="date" value={editForm.target_date} onChange={e => setEditForm(f => ({...f, target_date: e.target.value}))}
                      className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/30" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-1 block">Title</label>
                  <input value={editForm.title} onChange={e => setEditForm(f => ({...f, title: e.target.value}))}
                    className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-1 block">Description / Concept</label>
                  <textarea rows={3} value={editForm.concept} onChange={e => setEditForm(f => ({...f, concept: e.target.value}))}
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-1 block">Reference Links</label>
                  <textarea rows={2} value={editForm.inspiration_links} onChange={e => setEditForm(f => ({...f, inspiration_links: e.target.value}))}
                    placeholder="One URL per line..."
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
                </div>
                {editSaved && (
                  <p className="text-xs text-status-approved-text font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} /> Changes sent to your team!
                  </p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setShowEditPanel(false)}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface-2">
                    Cancel
                  </button>
                  <button
                    onClick={() => onEdit(draft.id, editForm, () => { setEditSaved(true); setTimeout(() => { setEditSaved(false); setShowEditPanel(false) }, 1500) })}
                    disabled={updating === draft.id}
                    className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {updating === draft.id ? <Loader2 size={14} className="animate-spin" /> : <>Send Changes</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'pending',  label: 'Needs Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'all',      label: 'All' },
]

export default function MyConcepts() {
  const { user }  = useAuth()
  const [drafts,   setDrafts]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('pending')
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    getMyClient(user.id, 'id')
      .then(async (client) => {
        if (!client) { setLoading(false); return }
        const { data } = await supabase
          .from('content_drafts')
          .select('id, type, title, concept, target_date, inspiration_links, status, client_id, client_footage_links, client_notes, shoots(title)')
          .eq('client_id', client.id)
          .neq('status', 'scrapped')
          .neq('status', 'converted')
          .order('created_at', { ascending: false })
        setDrafts(data || [])
        setLoading(false)
      })
  }, [user])

  const handleApprove = async (id, footageLinks, notes) => {
    setUpdating(id)
    await supabase.from('content_drafts').update({
      status: 'approved',
      client_footage_links: footageLinks.length ? footageLinks : null,
      client_notes: notes || null,
    }).eq('id', id)
    setDrafts((prev) => prev.map((d) => d.id === id
      ? { ...d, status: 'approved', client_footage_links: footageLinks, client_notes: notes }
      : d
    ))
    setUpdating(null)
  }

  const handleEdit = async (id, editForm, onDone) => {
    setUpdating(id)
    const links = editForm.inspiration_links.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
    await supabase.from('content_drafts').update({
      type:              editForm.type,
      title:             editForm.title || null,
      concept:           editForm.concept || null,
      target_date:       editForm.target_date || null,
      inspiration_links: links.length ? links : null,
      status:            'pending_client', // stays pending, notifies admin via refetch
    }).eq('id', id)
    setDrafts(prev => prev.map(d => d.id === id ? {
      ...d,
      type:              editForm.type,
      title:             editForm.title,
      concept:           editForm.concept,
      target_date:       editForm.target_date,
      inspiration_links: links,
    } : d))
    setUpdating(null)
    onDone?.()
  }

  const handleDecline = async (id, note) => {
    setUpdating(id)
    await supabase.from('content_drafts').update({
      status: 'declined',
      client_notes: note || null,
    }).eq('id', id)
    setDrafts((prev) => prev.map((d) => d.id === id
      ? { ...d, status: 'declined', client_notes: note }
      : d
    ))
    setUpdating(null)
  }

  const filtered = drafts.filter((d) => {
    if (tab === 'pending')  return d.status === 'pending_client'
    if (tab === 'approved') return d.status === 'approved'
    return true
  })

  const pendingCount = drafts.filter((d) => d.status === 'pending_client').length

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-gray-200" />
    </div>
  )

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-[600px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6 sm:mb-8">
          <h1 className="display">Content Concepts</h1>
          <p className="text-text-muted mt-2 text-sm sm:text-base">
            Review and approve ideas from your team.
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-status-due-soon-bg text-status-due-soon-text">
                {pendingCount} need{pendingCount === 1 ? 's' : ''} review
              </span>
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                tab === id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {label}
              {id === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-amber-500 text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 sm:py-20">
            <FileText size={40} className="mx-auto text-gray-200 mb-4" />
            <h2 className="text-lg font-semibold text-text-muted mb-1">
              {tab === 'pending' ? 'Nothing to review right now' : 'No concepts here'}
            </h2>
            <p className="text-sm text-text-muted px-4">
              {tab === 'pending'
                ? "You're all caught up. Your team will send ideas here for your input."
                : 'Your team will add content concepts here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-5">
            {filtered.map((d) => (
              <ConceptCard
                key={d.id}
                draft={d}
                onApprove={handleApprove}
                onDecline={handleDecline}
                onEdit={handleEdit}
                updating={updating}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
