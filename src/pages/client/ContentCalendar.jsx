import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, CalendarDays, Camera, Film,
  FileText, LayoutGrid, LayoutList, Loader2, Check, X,
  MapPin, Clock, ExternalLink, AlertCircle, Link as LinkIcon,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isToday, isSameDay, addMonths, subMonths,
  parseISO, startOfDay, isBefore, isAfter,
} from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { updateDraft } from '../../hooks/useContentDrafts'

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
            {item.description && <p className="text-xs text-text-secondary mt-2">{item.description}</p>}
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
            <p className="text-xs text-text-secondary">Your video is ready for review. Click below to watch and leave feedback.</p>
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
          {item.kind === 'review' && (
            <button onClick={() => navigate(`/projects/${item.projectId}/revision/${item.revisionId}`)}
              className="btn-primary text-xs flex-1 flex items-center justify-center gap-1.5">
              <Film size={11} /> Watch & Review
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
             item.kind === 'review'   ? 'Video Ready to Review' : 'Event'}
          </p>
          <p className="text-sm font-semibold text-text-primary">{item.title}</p>
          {item.dateLabel && <p className="text-xs text-text-muted mt-0.5">{item.dateLabel}</p>}
          {item.concept && <p className="text-xs text-text-secondary mt-1 line-clamp-2">{item.concept}</p>}
          {item.location && <p className="text-xs text-text-muted mt-1 flex items-center gap-1"><MapPin size={10} /> {item.location}</p>}
          {item.description && item.kind === 'shoot' && <p className="text-xs text-text-secondary mt-1">{item.description}</p>}

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
              <button onClick={() => navigate(`/projects/${item.projectId}/revision/${item.revisionId}`)}
                className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors flex items-center gap-1">
                <Film size={10} /> Watch & Review
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

  // Resolve the client record
  useEffect(() => {
    if (!user) return
    supabase
      .from('client_access')
      .select('client_id')
      .eq('profile_id', user.id)
      .limit(1)
      .single()
      .then(({ data }) => { if (data?.client_id) setClientId(data.client_id) })
  }, [user])

  const loadData = useCallback(async () => {
    if (!clientId) return
    setLoading(true)

    const [shootsRes, draftsRes, reviewsRes] = await Promise.all([
      // Shoots for this client
      supabase
        .from('shoots')
        .select('id, title, description, shoot_date, shoot_time, location, status')
        .eq('client_id', clientId)
        .neq('status', 'cancelled'),

      // Content drafts
      supabase
        .from('content_drafts')
        .select('id, type, title, concept, target_date, inspiration_links, status, shoots(title)')
        .eq('client_id', clientId)
        .not('status', 'in', '("scrapped","declined")'),

      // Project revisions pending client review
      supabase
        .from('project_revisions')
        .select('id, revision_number, created_at, projects!inner(id, name, client_id)')
        .eq('status', 'pending_client_review')
        .eq('projects.client_id', clientId),
    ])

    const items = []

    // Shoots
    ;(shootsRes.data || []).forEach((s) => {
      if (!s.shoot_date) return
      items.push({
        id:          `shoot-${s.id}`,
        kind:        'shoot',
        title:       s.title,
        date:        parseISO(s.shoot_date),
        dateLabel:   format(parseISO(s.shoot_date), 'EEE, MMM d yyyy') + (s.shoot_time ? ` at ${s.shoot_time.slice(0, 5)}` : ''),
        location:    s.location,
        time:        s.shoot_time ? s.shoot_time.slice(0, 5) : null,
        description: s.description,
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

    // Revisions pending review
    ;(reviewsRes.data || []).forEach((r) => {
      const revNum = r.revision_number
      const label  = revNum === 1 ? 'Initial Cut' : `Revision ${revNum - 1}`
      items.push({
        id:         `review-${r.id}`,
        rawId:      r.id,
        kind:       'review',
        title:      `${r.projects?.name || 'Project'} — ${label} Ready`,
        date:       new Date(r.created_at),
        dateLabel:  format(new Date(r.created_at), 'MMM d'),
        projectId:  r.projects?.id,
        revisionId: r.id,
      })
    })

    setAllItems(items)
    setLoading(false)
  }, [clientId])

  useEffect(() => { if (clientId) loadData() }, [clientId, loadData])

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

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
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
    </div>
  )
}
