import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, CalendarDays, Camera, Film,
  FileText, LayoutGrid, LayoutList, Loader2, Check, X,
  MapPin, Clock, ExternalLink, AlertCircle, Link as LinkIcon, Plus,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isToday, isSameDay, addMonths, subMonths,
  parseISO, startOfDay, isBefore, isAfter,
} from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { updateDraft } from '../../hooks/useContentDrafts'
import { fmtTime } from '../../lib/time'

// ── Constants ──────────────────────────────────────────────────────────────────
const ITEM_STYLES = {
  shoot:    { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500', border: 'border-purple-200' },
  draft:    { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200' },
  approved: { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500',  border: 'border-green-200' },
  review:   { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200' },
  event:    { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',   border: 'border-blue-200' },
}

const DRAFT_TYPE_LABELS = {
  post: 'Post', reel: 'Reel', story: 'Story', carousel: 'Carousel', other: 'Content',
}

// ── Build calendar grid ────────────────────────────────────────────────────────
function buildGrid(month) {
  const start = startOfWeek(startOfMonth(month))
  const end   = endOfWeek(endOfMonth(month))
  const days  = []
  let cur = start
  while (cur <= end) { days.push(cur); cur = addDays(cur, 1) }
  return days
}

// ── Detail Panel ───────────────────────────────────────────────────────────────
function ItemDetail({ item, onApprove, onDecline, onClose, updating }) {
  const navigate = useNavigate()
  const style = ITEM_STYLES[item.kind] || ITEM_STYLES.event

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* Color bar */}
      <div className={`h-1 ${style.dot}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                {item.kind === 'shoot'    ? 'Shoot Day' :
                 item.kind === 'draft'    ? `${DRAFT_TYPE_LABELS[item.type] || 'Draft'} — Needs Approval` :
                 item.kind === 'approved' ? `${DRAFT_TYPE_LABELS[item.type] || 'Content'} — Approved` :
                 item.kind === 'review'   ? 'Ready to Review' :
                 'Event'}
              </span>
              {item.dateLabel && (
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <CalendarDays size={10} /> {item.dateLabel}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-text-primary">{item.title}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary shrink-0">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Shoot details */}
        {item.kind === 'shoot' && (
          <div className="space-y-1.5 mt-2">
            {item.time && (
              <p className="text-xs text-text-muted flex items-center gap-1.5"><Clock size={11} /> {item.time}</p>
            )}
            {item.location && (
              <p className="text-xs text-text-muted flex items-center gap-1.5"><MapPin size={11} /> {item.location}</p>
            )}
          </div>
        )}

        {/* Draft / content details */}
        {(item.kind === 'draft' || item.kind === 'approved') && (
          <div className="space-y-2 mt-2">
            {item.concept && <p className="text-xs text-text-secondary leading-relaxed">{item.concept}</p>}
            {item.linkedShoot && (
              <p className="text-xs text-text-muted flex items-center gap-1.5"><Camera size={10} /> From shoot: {item.linkedShoot}</p>
            )}
            {item.links?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.links.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noreferrer"
                    className="text-xs text-accent hover:underline flex items-center gap-1">
                    <LinkIcon size={10} /> Inspiration {i + 1}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Review project */}
        {item.kind === 'review' && (
          <div className="mt-2">
            {item.revStatus === 'pending_client_review'
              ? <p className="text-xs text-text-secondary">{item.isPhoto ? 'Your photos are ready' : 'Your video is ready'} — click below to leave feedback or approve.</p>
              : <p className="text-xs text-text-secondary">Your editor is working on revisions. You'll be notified when a new version is ready.</p>
            }
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {item.kind === 'draft' && (
            <>
              <button onClick={() => onApprove(item)} disabled={updating}
                className="btn-primary text-xs flex-1 flex items-center justify-center gap-1.5">
                {updating ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Approve
              </button>
              <button onClick={() => onDecline(item)} disabled={updating}
                className="btn-secondary text-xs flex-1">
                Decline
              </button>
            </>
          )}
          {item.kind === 'review' && item.revStatus === 'pending_client_review' && (
            <button onClick={() => navigate(item.isPhoto ? `/projects/${item.projectId}/photo-revision/${item.revisionId}` : `/projects/${item.projectId}/revision/${item.revisionId}`)}
              className="btn-primary text-xs flex-1 flex items-center justify-center gap-1.5">
              {item.isPhoto ? <><Camera size={11} /> Review Photos</> : <><Film size={11} /> Watch & Review</>}
            </button>
          )}
          {item.kind === 'review' && item.revStatus !== 'pending_client_review' && (
            <button onClick={() => navigate(item.isPhoto ? `/projects/${item.projectId}/photo-revision/${item.revisionId}` : `/projects/${item.projectId}/revision/${item.revisionId}`)}
              className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1.5">
              {item.isPhoto ? <><Camera size={11} /> View Photos</> : <><Film size={11} /> View Revision</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── List View ──────────────────────────────────────────────────────────────────
function ListView({ allItems, onApprove, onDecline, updating }) {
  const navigate = useNavigate()
  const today = startOfDay(new Date())

  const upcoming = allItems
    .filter((item) => item.date && !isBefore(item.date, today))
    .sort((a, b) => a.date - b.date)
  const past = allItems
    .filter((item) => item.date && isBefore(item.date, today))
    .sort((a, b) => b.date - a.date)

  const ItemRow = ({ item }) => {
    const style = ITEM_STYLES[item.kind] || ITEM_STYLES.event
    return (
      <div className={`flex gap-3 p-4 rounded-xl border ${style.border} ${style.bg}`}>
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${style.dot}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${style.text} mb-0.5`}>
            {item.kind === 'shoot'    ? 'Shoot Day' :
             item.kind === 'draft'    ? `${DRAFT_TYPE_LABELS[item.type] || 'Draft'} — Needs Approval` :
             item.kind === 'approved' ? `${DRAFT_TYPE_LABELS[item.type] || 'Content'} — Approved` :
             item.kind === 'review'   ? (item.isPhoto ? 'Photos Ready to Review' : 'Video Ready to Review') : 'Event'}
          </p>
          <p className="text-sm font-semibold text-text-primary">{item.title}</p>
          {item.dateLabel && <p className="text-xs text-text-muted mt-0.5">{item.dateLabel}</p>}
          {item.concept && <p className="text-xs text-text-secondary mt-1 line-clamp-2">{item.concept}</p>}
          {item.location && <p className="text-xs text-text-muted mt-1 flex items-center gap-1"><MapPin size={10} /> {item.location}</p>}

          <div className="flex gap-2 mt-3">
            {item.kind === 'draft' && (
              <>
                <button onClick={() => onApprove(item)} disabled={updating}
                  className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1">
                  {updating ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Approve
                </button>
                <button onClick={() => onDecline(item)} disabled={updating}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-red-600 hover:border-red-200 transition-colors">
                  Decline
                </button>
              </>
            )}
            {item.kind === 'review' && (
              <button onClick={() => navigate(item.isPhoto ? `/projects/${item.projectId}/photo-revision/${item.revisionId}` : `/projects/${item.projectId}/revision/${item.revisionId}`)}
                className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors flex items-center gap-1">
                {item.isPhoto ? <><Camera size={10} /> Review Photos</> : <><Film size={10} /> Watch & Review</>}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!allItems.length) return (
    <div className="card p-10 text-center">
      <CalendarDays size={32} className="mx-auto text-text-muted/30 mb-3" />
      <p className="text-sm font-semibold text-text-primary">Nothing scheduled</p>
      <p className="text-sm text-text-muted mt-1">Your shoots, content, and reviews will appear here.</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Upcoming</h3>
          <div className="space-y-3">{upcoming.map((item) => <ItemRow key={item.id} item={item} />)}</div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Past</h3>
          <div className="space-y-3">{past.map((item) => <ItemRow key={item.id} item={item} />)}</div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ContentCalendar() {
  const { user } = useAuth()
  const [month,    setMonth]    = useState(new Date())
  const [allItems, setAllItems] = useState([])   // flat list of all calendar items
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null) // selected day (calendar mode)
  const [detailItem, setDetailItem] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [view, setView] = useState('calendar')   // 'calendar' | 'list'
  const [clientId, setClientId] = useState(null)
  const [clientResolved, setClientResolved] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestForm, setRequestForm] = useState({
    type: 'post', title: '', concept: '', target_date: '', reference_links: '', footage_link: '',
  })
  const [submitting, setSubmitting] = useState(false)

  // Resolve the client record — clients.profile_id is the client user link
  useEffect(() => {
    if (!user) return
    supabase
      .from('clients')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data?.id) {
          setClientId(data.id)
          setClientResolved(true)
        } else {
          // Fallback: find via client_creatives
          const { data: ccRows } = await supabase
            .from('client_creatives').select('client_id').eq('profile_id', user.id).limit(1)
          if (ccRows?.length) setClientId(ccRows[0].client_id)
          setClientResolved(true)
        }
      })
  }, [user])

  const loadData = useCallback(async () => {
    if (!clientId) return
    setLoading(true)

    // First get all project IDs for this client
    const { data: clientProjects } = await supabase
      .from('projects')
      .select('id, name, shoot_date, location, media_type, due_date')
      .eq('client_id', clientId)

    const projectIds = (clientProjects || []).map((p) => p.id)

    const [shootsRes, projectShootsRes, draftsRes, reviewsRes] = await Promise.all([
      // Legacy shoots for this client (include null status rows too)
      supabase
        .from('shoots')
        .select('id, title, description, shoot_date, shoot_time, location, status')
        .eq('client_id', clientId)
        .or('status.neq.cancelled,status.is.null'),

      // Project-level shoots — filter by project IDs directly
      projectIds.length
        ? supabase
            .from('project_shoots')
            .select('id, title, shoot_date, shoot_time, location, status, project_id')
            .in('project_id', projectIds)
            .or('status.neq.cancelled,status.is.null')
        : Promise.resolve({ data: [] }),

      // Content drafts
      supabase
        .from('content_drafts')
        .select('id, type, title, concept, target_date, inspiration_links, status, shoots(title)')
        .eq('client_id', clientId)
        .not('status', 'in', '("scrapped","declined")'),

      // All active project revisions (any review stage) for this client
      projectIds.length
        ? supabase
            .from('project_revisions')
            .select('id, revision_number, created_at, media_type, status, project_id')
            .in('project_id', projectIds)
            .in('status', ['pending_client_review', 'pending_editor', 'pending_photographer_review', 'pending_admin_review'])
        : Promise.resolve({ data: [] }),
    ])

    // Build project lookup map
    const projectMap = {}
    ;(clientProjects || []).forEach((p) => { projectMap[p.id] = p })

    const items = []

    // Shoots (legacy)
    ;(shootsRes.data || []).forEach((s) => {
      if (!s.shoot_date) return
      items.push({
        id:          `shoot-${s.id}`,
        kind:        'shoot',
        title:       s.title,
        date:        parseISO(s.shoot_date),
        dateLabel:   format(parseISO(s.shoot_date), 'EEE, MMM d yyyy') + (s.shoot_time ? ` at ${fmtTime(s.shoot_time)}` : ''),
        location:    s.location,
        time:        s.shoot_time ? fmtTime(s.shoot_time) : null,
      })
    })

    // Project-level shoots
    ;(projectShootsRes.data || []).forEach((s) => {
      if (!s.shoot_date) return
      const proj = projectMap[s.project_id]
      const displayTitle = s.title || `${proj?.name || 'Project'} — Shoot`
      items.push({
        id:        `pshoot-${s.id}`,
        kind:      'shoot',
        title:     displayTitle,
        date:      parseISO(s.shoot_date),
        dateLabel: format(parseISO(s.shoot_date), 'EEE, MMM d yyyy') + (s.shoot_time ? ` at ${fmtTime(s.shoot_time)}` : ''),
        location:  s.location || proj?.location,
        time:      s.shoot_time ? fmtTime(s.shoot_time) : null,
        status:    s.status,
      })
    })

    // Also add shoot_date directly from projects (in case no project_shoots row exists)
    ;(clientProjects || []).forEach((p) => {
      if (!p.shoot_date) return
      // Skip if already covered by a project_shoots row for this project
      const alreadyCovered = (projectShootsRes.data || []).some((s) => s.project_id === p.id)
      if (alreadyCovered) return
      items.push({
        id:        `proj-shoot-${p.id}`,
        kind:      'shoot',
        title:     `${p.name} — Shoot`,
        date:      parseISO(p.shoot_date),
        dateLabel: format(parseISO(p.shoot_date), 'EEE, MMM d yyyy'),
        location:  p.location,
        time:      null,
      })
    })

    // Drafts
    ;(draftsRes.data || []).forEach((d) => {
      const date = d.target_date ? parseISO(d.target_date) : null
      items.push({
        id:          `draft-${d.id}`,
        rawId:       d.id,
        kind:        d.status === 'approved' ? 'approved' : 'draft',
        type:        d.type,
        title:       d.title || `${DRAFT_TYPE_LABELS[d.type] || 'Draft'} Concept`,
        date,
        dateLabel:   date ? format(date, 'MMM d, yyyy') : 'No target date',
        concept:     d.concept,
        links:       d.inspiration_links || [],
        linkedShoot: d.shoots?.title || null,
      })
    })

    // Active project revisions (all review stages)
    ;(reviewsRes.data || []).forEach((r) => {
      const proj    = projectMap[r.project_id]
      const isPhoto = r.media_type === 'photo' || proj?.media_type === 'photo'
      const mediaWord = isPhoto ? 'Photos' : 'Video'

      // Use due_date or shoot_date from the project as a forward-looking anchor; fall back to created_at
      const rawDate = proj?.due_date || proj?.shoot_date || r.created_at
      const date = rawDate ? new Date(rawDate) : new Date()

      let statusLabel
      if (r.status === 'pending_client_review') {
        statusLabel = `${mediaWord} Ready to Review`
      } else if (r.status === 'pending_editor') {
        statusLabel = `${mediaWord} — Editor Revising`
      } else {
        statusLabel = `${mediaWord} — In Review`
      }

      items.push({
        id:         `review-${r.id}`,
        rawId:      r.id,
        kind:       'review',
        title:      `${proj?.name || 'Project'} — ${statusLabel}`,
        date,
        dateLabel:  format(date, 'MMM d'),
        projectId:  r.project_id,
        revisionId: r.id,
        isPhoto,
        revStatus:  r.status,
      })
    })

    setAllItems(items)
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    if (clientId) loadData()
    else if (clientResolved) setLoading(false)
  }, [clientId, clientResolved, loadData])

  // Real-time: reload when any project_shoot changes (INSERT / UPDATE / DELETE)
  // The RLS policy on project_shoots ensures we only ever receive rows belonging
  // to this client's projects, so no additional client-side filtering is needed.
  useEffect(() => {
    if (!clientId) return
    const channel = supabase
      .channel(`project-shoots-client-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_shoots' },
        () => loadData()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [clientId, loadData])

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleApprove = async (item) => {
    setUpdating(true)
    try {
      await updateDraft(item.rawId, { status: 'approved' })
      await loadData()
      setDetailItem(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleDecline = async (item) => {
    setUpdating(true)
    try {
      await updateDraft(item.rawId, { status: 'scrapped' })
      await loadData()
      setDetailItem(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleRequestSubmit = async (e) => {
    e.preventDefault()
    if (!clientId || !user) return
    setSubmitting(true)
    try {
      const links = requestForm.reference_links
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const footageLink = requestForm.footage_link.trim()
      const { error } = await supabase.from('content_drafts').insert({
        client_id: clientId,
        title: requestForm.title || null,
        type: requestForm.type,
        concept: requestForm.concept || null,
        target_date: requestForm.target_date || null,
        inspiration_links: links.length ? links : null,
        client_footage_links: footageLink ? [footageLink] : null,
        status: 'pending_client',
        created_by: user.id,
      })
      if (error) throw new Error(error.message)
      setShowRequestModal(false)
      setRequestForm({ type: 'post', title: '', concept: '', target_date: '', reference_links: '', footage_link: '' })
      await loadData()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Calendar grid helpers ────────────────────────────────────────────────────
  const days = buildGrid(month)

  const getDayItems = (day) =>
    allItems.filter((item) => item.date && isSameDay(item.date, day))

  const selectedDayItems = selected ? getDayItems(selected) : []

  // Pending approval count
  const pendingCount = allItems.filter((i) => i.kind === 'draft').length
  const reviewCount  = allItems.filter((i) => i.kind === 'review').length

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Content Calendar</h1>
          <div className="flex items-center gap-3 mt-1">
            {pendingCount > 0 && (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertCircle size={10} /> {pendingCount} draft{pendingCount !== 1 ? 's' : ''} awaiting approval
              </span>
            )}
            {reviewCount > 0 && (
              <span className="text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Film size={10} /> {reviewCount} video{reviewCount !== 1 ? 's' : ''} to review
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {clientId && (
            <button
              onClick={() => setShowRequestModal(true)}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <Plus size={13} /> Request Content
            </button>
          )}
          {/* View toggle */}
          <div className="flex bg-surface-2 rounded-xl p-1 gap-0.5">
            <button onClick={() => setView('calendar')}
              className={`p-2 rounded-lg transition-colors ${view === 'calendar' ? 'bg-white shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>
              <LayoutGrid size={15} />
            </button>
            <button onClick={() => setView('list')}
              className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-white shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>
              <LayoutList size={15} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : !clientId ? (
        <div className="card p-12 text-center">
          <CalendarDays size={36} className="mx-auto text-text-muted/30 mb-3" />
          <p className="text-sm font-semibold text-text-primary mb-1">No client account linked</p>
          <p className="text-sm text-text-muted">Ask your admin to link your account to a client.</p>
        </div>
      ) : view === 'list' ? (
        <ListView allItems={allItems} onApprove={handleApprove} onDecline={handleDecline} updating={updating} />
      ) : (
        <>
          {/* Calendar */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <button onClick={() => setMonth(subMonths(month, 1))} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors">
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-sm font-bold text-text-primary">{format(month, 'MMMM yyyy')}</h2>
              <button onClick={() => setMonth(addMonths(month, 1))} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-text-muted uppercase tracking-wide">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-border">
              {days.map((day, i) => {
                const inMonth  = isSameMonth(day, month)
                const todayDay = isToday(day)
                const isSel    = selected && isSameDay(day, selected)
                const dayItems = getDayItems(day)
                const hasDraft  = dayItems.some((d) => d.kind === 'draft')
                const hasReview = dayItems.some((d) => d.kind === 'review')

                return (
                  <div
                    key={i}
                    onClick={() => {
                      const newSel = isSel ? null : day
                      setSelected(newSel)
                      setDetailItem(null)
                    }}
                    className={`min-h-[76px] p-1.5 cursor-pointer transition-colors ${
                      isSel ? 'bg-accent/5' : inMonth ? 'hover:bg-surface-2/50' : 'bg-surface-2/30'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                      todayDay ? 'bg-accent text-white' : inMonth ? 'text-text-primary' : 'text-text-muted/40'
                    }`}>
                      {format(day, 'd')}
                    </div>

                    <div className="space-y-0.5">
                      {dayItems.slice(0, 3).map((item) => {
                        const style = ITEM_STYLES[item.kind] || ITEM_STYLES.event
                        return (
                          <div key={item.id} className={`flex items-center gap-1 px-1 py-0.5 rounded ${style.bg}`}
                            onClick={(e) => { e.stopPropagation(); setDetailItem(item); setSelected(day) }}>
                            <div className={`w-1 h-1 rounded-full shrink-0 ${style.dot}`} />
                            <p className={`text-[9px] font-medium truncate ${style.text}`}>{item.title}</p>
                          </div>
                        )
                      })}
                      {dayItems.length > 3 && (
                        <p className="text-[9px] text-text-muted px-1">+{dayItems.length - 3} more</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3 px-1">
            {[
              { kind: 'shoot', label: 'Shoot Day' },
              { kind: 'draft', label: 'Needs Approval' },
              { kind: 'approved', label: 'Approved Content' },
              { kind: 'review', label: 'Video Ready' },
            ].map(({ kind, label }) => (
              <div key={kind} className="flex items-center gap-1.5 text-xs text-text-muted">
                <div className={`w-2 h-2 rounded-full ${ITEM_STYLES[kind].dot}`} />
                {label}
              </div>
            ))}
          </div>

          {/* Selected day detail */}
          {selected && selectedDayItems.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-text-muted mb-3">
                {format(selected, 'EEEE, MMMM d')}
              </h3>
              <div className="space-y-3">
                {selectedDayItems.map((item) => (
                  <ItemDetail
                    key={item.id}
                    item={item}
                    onApprove={handleApprove}
                    onDecline={handleDecline}
                    updating={updating}
                  />
                ))}
              </div>
            </div>
          )}

          {selected && selectedDayItems.length === 0 && (
            <div className="mt-4 card p-5 text-center">
              <p className="text-sm text-text-muted">{format(selected, 'MMMM d')} — nothing scheduled.</p>
            </div>
          )}
        </>
      )}

      {/* Request Content Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Plus size={15} className="text-accent" /> Request Content
              </h2>
              <button onClick={() => setShowRequestModal(false)} className="p-1.5 text-text-muted hover:text-text-primary rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRequestSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Type</label>
                <select
                  className="input w-full"
                  value={requestForm.type}
                  onChange={(e) => setRequestForm((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="post">Post</option>
                  <option value="reel">Reel</option>
                  <option value="story">Story</option>
                  <option value="carousel">Carousel</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Title</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Give your idea a title"
                  value={requestForm.title}
                  onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Description / Concept</label>
                <textarea
                  className="input w-full min-h-[100px] resize-none text-sm"
                  placeholder="Describe the concept, vibe, key message…"
                  value={requestForm.concept}
                  onChange={(e) => setRequestForm((f) => ({ ...f, concept: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Post Date</label>
                <input
                  type="date"
                  className="input w-full"
                  value={requestForm.target_date}
                  onChange={(e) => setRequestForm((f) => ({ ...f, target_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Reference Links <span className="font-normal text-text-muted">(one per line)</span></label>
                <textarea
                  className="input w-full min-h-[72px] resize-none text-sm"
                  placeholder={"https://example.com/inspo\nhttps://instagram.com/..."}
                  value={requestForm.reference_links}
                  onChange={(e) => setRequestForm((f) => ({ ...f, reference_links: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Footage or Files Link <span className="font-normal text-text-muted">(optional)</span></label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Google Drive, Dropbox, etc."
                  value={requestForm.footage_link}
                  onChange={(e) => setRequestForm((f) => ({ ...f, footage_link: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRequestModal(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
