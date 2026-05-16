import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Loader2, CheckCircle2, Clock, XCircle, Link as LinkIcon, CalendarDays, Camera } from 'lucide-react'
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

function ConceptCard({ draft, onApprove, onDecline, updating }) {
  const cfg  = STATUS_CONFIG[draft.status] || STATUS_CONFIG.pending_client
  const Icon = cfg.icon
  const isPending = draft.status === 'pending_client'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Color bar */}
      <div className={`h-1 ${cfg.bar}`} />

      <div className="p-6">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
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

        {draft.title && (
          <h3 className="text-lg font-bold text-gray-900 mb-1">{draft.title}</h3>
        )}
        {draft.concept && (
          <p className="text-sm text-gray-500 leading-relaxed mb-4">{draft.concept}</p>
        )}

        {/* Linked shoot */}
        {draft.shoots?.title && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
            <Camera size={11} /> Linked to shoot: <span className="font-medium text-gray-600">{draft.shoots.title}</span>
          </div>
        )}

        {/* Inspiration links */}
        {draft.inspiration_links?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {draft.inspiration_links.map((link, i) => (
              <a
                key={i}
                href={link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <LinkIcon size={10} /> Reference {i + 1}
              </a>
            ))}
          </div>
        )}

        {/* Approve / Decline — only for pending */}
        {isPending && (
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={() => onDecline(draft.id)}
              disabled={updating === draft.id}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
            >
              Decline
            </button>
            <button
              onClick={() => onApprove(draft.id)}
              disabled={updating === draft.id}
              className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {updating === draft.id
                ? <Loader2 size={14} className="animate-spin" />
                : <><CheckCircle2 size={14} /> Approve</>
              }
            </button>
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
  const navigate = useNavigate()
  const { user }  = useAuth()
  const [drafts,   setDrafts]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('pending')
  const [updating, setUpdating] = useState(null) // draft id being updated

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
          .select('id, type, title, concept, target_date, inspiration_links, status, shoots(title)')
          .eq('client_id', client.id)
          .neq('status', 'scrapped')
          .order('created_at', { ascending: false })
        setDrafts(data || [])
        setLoading(false)
      })
  }, [user])

  const update = async (id, status) => {
    setUpdating(id)
    await supabase.from('content_drafts').update({ status }).eq('id', id)
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status } : d))
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
      <div className="max-w-[600px] mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Content Concepts</h1>
          <p className="text-gray-400 mt-2 text-base">
            Review and approve ideas from your team.
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                {pendingCount} need{pendingCount === 1 ? 's' : ''} review
              </span>
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-100">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
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
          <div className="text-center py-20">
            <FileText size={40} className="mx-auto text-gray-200 mb-4" />
            <h2 className="text-lg font-semibold text-gray-400 mb-1">
              {tab === 'pending' ? 'Nothing to review right now' : 'No concepts here'}
            </h2>
            <p className="text-sm text-gray-300">
              {tab === 'pending'
                ? "You're all caught up — your team will send ideas here for your input."
                : 'Your team will add content concepts here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {filtered.map((d) => (
              <ConceptCard
                key={d.id}
                draft={d}
                onApprove={(id) => update(id, 'approved')}
                onDecline={(id) => update(id, 'declined')}
                updating={updating}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
