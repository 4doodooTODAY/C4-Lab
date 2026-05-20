import { useState, useEffect, useRef } from 'react'
import {
  FileText, Loader2, CheckCircle2, Clock, XCircle,
  Link as LinkIcon, CalendarDays, Camera, Upload,
  MessageSquare, ChevronDown, ChevronUp, X, Edit2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'

const TYPE_LABELS = {
  post: 'Post', reel: 'Reel', story: 'Story', carousel: 'Carousel', other: 'Content',
}

const STATUS_CONFIG = {
  pending_client: {
    label: 'Awaiting your approval',
    icon: Clock,
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    bar: 'bg-amber-400',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    badge: 'bg-green-50 text-green-700 border border-green-200',
    bar: 'bg-green-400',
  },
  declined: {
    label: 'Declined',
    icon: XCircle,
    badge: 'bg-red-50 text-red-600 border border-red-200',
    bar: 'bg-red-400',
  },
  scrapped: {
    label: 'Archived',
    icon: XCircle,
    badge: 'bg-gray-100 text-gray-500 border border-gray-200',
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
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
      {/* Footage upload links */}
      <div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-2">
          <Upload size={12} className="text-accent" />
          Your Footage <span className="font-normal text-gray-400">(optional — share a Google Drive, Dropbox, or WeTransfer link)</span>
        </label>
        <div className="space-y-2">
          {footageLinks.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="url"
                placeholder="https://drive.google.com/..."
                value={link}
                onChange={(e) => updateLink(i, e.target.value)}
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder-gray-300 bg-gray-50"
              />
              {footageLinks.length > 1 && (
                <button onClick={() => removeLink(i)} className="p-1.5 text-gray-300 hover:text-gray-500">
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
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-2">
          <MessageSquare size={12} className="text-accent" />
          Notes or Changes <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          rows={3}
          placeholder="Any changes to the concept, specific ideas, or anything else your team should know…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder-gray-300 bg-gray-50 resize-none"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-50"
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`h-1 ${cfg.bar}`} />
      <div className="p-5 sm:p-6">
        {/* Top row */}
        <div className="flex items-start gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {draft.type && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {TYPE_LABELS[draft.type] || draft.type}
              </span>
            )}
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
              <Icon size={9} /> {cfg.label}
            </span>
            {draft.target_date && (
              <span className="flex items-center gap-1 text-[10px] text-gray-400">
                <CalendarDays size={9} /> {format(parseISO(draft.target_date), 'MMM d')}
              </span>
            )}
          </div>
        </div>

        {draft.title && <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">{draft.title}</h3>}
        {draft.concept && <p className="text-sm text-gray-500 leading-relaxed mb-4">{draft.concept}</p>}

        {draft.shoots?.title && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
            <Camera size={11} /> Linked to shoot: <span className="font-medium text-gray-600">{draft.shoots.title}</span>
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

        {/* Approved — show client footage/notes if any */}
        {draft.status === 'approved' && (draft.client_footage_links?.length > 0 || draft.client_notes) && (
          <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-100 space-y-2">
            {draft.client_footage_links?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">Your Footage</p>
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
                <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">Your Notes</p>
                <p className="text-xs text-gray-600">{draft.client_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* PENDING ACTIONS */}
        {isPending && (
          <div className="pt-4 border-t border-gray-100">

            {/* Main 3 buttons */}
            {!showApprovePanel && !showDeclinePanel && !showEditPanel && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeclinePanel(true) }}
                  disabled={updating === draft.id}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-50"
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
                <label className="text-xs font-semibold text-gray-700">Let us know why (optional)</label>
                <textarea
                  rows={2}
                  placeholder="What didn't work? We'll use this to revise the concept…"
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 placeholder-gray-300 bg-gray-50 resize-none"
                />
                <div className="flex gap-3">
                  <button onClick={() => setShowDeclinePanel(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50">
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
                <p className="text-xs font-semibold text-gray-700">Make your changes — we'll be notified.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Type</label>
                    <select value={editForm.type} onChange={e => setEditForm(f => ({...f, type: e.target.value}))}
                      className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent/30">
                      <option value="post">Post</option>
                      <option value="reel">Reel</option>
                      <option value="story">Story</option>
                      <option value="carousel">Carousel</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Post Date</label>
                    <input type="date" value={editForm.target_date} onChange={e => setEditForm(f => ({...f, target_date: e.target.value}))}
                      className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent/30" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Title</label>
                  <input value={editForm.title} onChange={e => setEditForm(f => ({...f, title: e.target.value}))}
                    className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Description / Concept</label>
                  <textarea rows={3} value={editForm.concept} onChange={e => setEditForm(f => ({...f, concept: e.target.value}))}
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Reference Links</label>
                  <textarea rows={2} value={editForm.inspiration_links} onChange={e => setEditForm(f => ({...f, inspiration_links: e.target.value}))}
                    placeholder="One URL per line..."
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
                </div>
                {editSaved && (
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} /> Changes sent to your team!
                  </p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setShowEditPanel(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50">
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
    supabase
      .from('clients')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(async ({ data: client }) => {
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
    <div className="min-h-screen bg-white">
      <div className="max-w-[600px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Content Concepts</h1>
          <p className="text-gray-400 mt-2 text-sm sm:text-base">
            Review and approve ideas from your team.
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                {pendingCount} need{pendingCount === 1 ? 's' : ''} review
              </span>
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-100 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                tab === id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
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
            <h2 className="text-lg font-semibold text-gray-400 mb-1">
              {tab === 'pending' ? 'Nothing to review right now' : 'No concepts here'}
            </h2>
            <p className="text-sm text-gray-300 px-4">
              {tab === 'pending'
                ? "You're all caught up — your team will send ideas here for your input."
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
