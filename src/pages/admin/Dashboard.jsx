import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users2, Inbox, Building2, Loader2, Upload, MessageSquare, FileText, Camera, Film, CalendarDays, FolderKanban, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, formatDistanceToNow, startOfWeek, endOfWeek, addWeeks, isWithinInterval, isToday, isTomorrow, differenceInDays } from 'date-fns'

// ─── Weekly bar chart (pure SVG, no deps) ─────────────────────────────────────
function WeeklyChart({ weeks }) {
  const [hovered, setHovered] = useState(null)
  const maxCount = Math.max(...weeks.map((w) => w.count), 1)

  // Layout constants
  const VB_W = 560
  const VB_H = 200
  const PAD_L = 36
  const PAD_R = 8
  const PAD_T = 12
  const PAD_B = 38
  const chartW = VB_W - PAD_L - PAD_R   // 516
  const chartH = VB_H - PAD_T - PAD_B   // 150
  const BAR_W = 34
  const GAP = (chartW - BAR_W * 10) / 11 // ~17.6

  const barX = (i) => PAD_L + GAP + i * (BAR_W + GAP)
  const barY = (count) => PAD_T + chartH - Math.max((count / maxCount) * chartH, count > 0 ? 3 : 0)
  const barH = (count) => Math.max((count / maxCount) * chartH, count > 0 ? 3 : 0)

  // Y-axis ticks: 0, half (rounded), max
  const ticks = maxCount <= 2
    ? [0, 1, 2]
    : [0, Math.round(maxCount / 2), maxCount]

  const ACCENT = '#6C63FF'
  const ACCENT_LIGHT = '#c4c1f7'
  const GRID = '#f1f0fe'
  const AXIS = '#e5e7eb'

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full"
      style={{ overflow: 'visible' }}
    >
      {/* Horizontal grid lines */}
      {ticks.map((val) => {
        const y = PAD_T + chartH - (val / Math.max(maxCount, 1)) * chartH
        return (
          <g key={val}>
            <line x1={PAD_L} y1={y} x2={VB_W - PAD_R} y2={y} stroke={val === 0 ? AXIS : GRID} strokeWidth="1" />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{val}</text>
          </g>
        )
      })}

      {/* Bars */}
      {weeks.map((week, i) => {
        const x = barX(i)
        const y = barY(week.count)
        const h = barH(week.count)
        const isCurrent = i === weeks.length - 1
        const isHov = hovered === i
        const fill = isCurrent ? ACCENT : isHov ? '#9c9af5' : ACCENT_LIGHT

        return (
          <g key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'default' }}
          >
            {/* Hover area (full column height) */}
            <rect x={x} y={PAD_T} width={BAR_W} height={chartH} fill="transparent" />

            {/* Bar */}
            <rect x={x} y={y} width={BAR_W} height={h} rx="4" fill={fill}
              style={{ transition: 'fill 0.15s' }} />

            {/* Tooltip on hover */}
            {isHov && (
              <g>
                <rect x={x + BAR_W / 2 - 20} y={y - 28} width={40} height={20} rx="4" fill="#1f2937" />
                <text x={x + BAR_W / 2} y={y - 14} textAnchor="middle" fontSize="11" fill="white" fontWeight="600">
                  {week.count}
                </text>
              </g>
            )}

            {/* X-axis label */}
            <text
              x={x + BAR_W / 2}
              y={PAD_T + chartH + 18}
              textAnchor="middle"
              fontSize="9"
              fill={isCurrent ? ACCENT : '#9ca3af'}
              fontWeight={isCurrent ? '600' : '400'}
            >
              {week.label}
            </text>
          </g>
        )
      })}

      {/* "This week" label */}
      <text
        x={barX(9) + BAR_W / 2}
        y={PAD_T + chartH + 30}
        textAnchor="middle"
        fontSize="8"
        fill={ACCENT}
      >
        now
      </text>
    </svg>
  )
}

// ─── Activity feed item ────────────────────────────────────────────────────────
const ACTIVITY_META = {
  media:    { icon: Film,          color: '#6C63FF', bg: '#ede9fe' },
  comment:  { icon: MessageSquare, color: '#10b981', bg: '#d1fae5' },
  request:  { icon: FileText,      color: '#f59e0b', bg: '#fef3c7' },
  footage:  { icon: Camera,        color: '#ef4444', bg: '#fee2e2' },
}

function ActivityItem({ item }) {
  const meta = ACTIVITY_META[item.kind] || ACTIVITY_META.media
  const Icon = meta.icon
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: meta.bg }}>
        <Icon size={14} style={{ color: meta.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary leading-snug">
          <span className="font-medium">{item.actor || 'Someone'}</span>
          {' '}{item.description}
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  )
}

// ─── Upcoming list ────────────────────────────────────────────────────────────
function UpcomingList() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const nowIso = new Date().toISOString()

    Promise.all([
      // Upcoming shoots — status may be null on older rows, or 'scheduled'
      supabase
        .from('shoots')
        .select('id, title, shoot_date, shoot_time, client_id, clients(name, contact_name)')
        .neq('status', 'cancelled')
        .neq('status', 'completed')
        .gte('shoot_date', today)
        .order('shoot_date', { ascending: true })
        .limit(15),

      // Projects with due dates coming up
      supabase
        .from('projects')
        .select('id, name, due_date, stage, clients(name, contact_name)')
        .not('due_date', 'is', null)
        .not('stage', 'eq', 'delivered')
        .neq('status', 'archived')
        .gte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(15),

      // Upcoming calendar events (meetings, deadlines — not shoot-type)
      supabase
        .from('calendar_events')
        .select('id, title, start_at, event_type, location')
        .neq('event_type', 'shoot')
        .gte('start_at', nowIso)
        .order('start_at', { ascending: true })
        .limit(15),
    ]).then(([shootsRes, projectsRes, eventsRes]) => {
      const merged = []
      try {

      ;(shootsRes.data || []).forEach((s) => {
        // shoot_time comes as "HH:MM:SS" from Postgres — slice to "HH:MM"
        const timeStr = s.shoot_time ? s.shoot_time.slice(0, 5) : '09:00'
        merged.push({
          id:       `shoot-${s.id}`,
          type:     'shoot',
          title:    s.title,
          client:   s.clients?.contact_name || s.clients?.name || null,
          date:     new Date(`${s.shoot_date}T${timeStr}:00`),
          dateStr:  s.shoot_date,
          link:     s.client_id ? `/admin/clients/${s.client_id}` : '/calendar',
        })
      })

      ;(projectsRes.data || []).forEach((p) => {
        merged.push({
          id:     `project-${p.id}`,
          type:   'project',
          title:  p.name,
          client: p.clients?.contact_name || p.clients?.name || null,
          date:   new Date(`${p.due_date}T23:59:00`),
          dateStr: p.due_date,
          link:   `/projects/${p.id}/creative`,
        })
      })

      ;(eventsRes.data || []).forEach((e) => {
        merged.push({
          id:     `event-${e.id}`,
          type:   'event',
          title:  e.title,
          client: e.location || null,
          date:   new Date(e.start_at),
          dateStr: e.start_at,
          link:   '/calendar',
        })
      })

        merged.sort((a, b) => a.date - b.date)
        setItems(merged.slice(0, 20))
      } catch (err) {
        console.error('UpcomingList parse error:', err)
      }
      setLoading(false)
    })
  }, [])

  const TYPE_META = {
    shoot:   { icon: Camera,       color: 'text-violet-600', bg: 'bg-violet-50',  label: 'Shoot'    },
    project: { icon: FolderKanban, color: 'text-accent',     bg: 'bg-accent/10',  label: 'Due Date' },
    event:   { icon: CalendarDays, color: 'text-blue-600',   bg: 'bg-blue-50',    label: 'Meeting'  },
  }

  const fmtDate = (date, dateStr) => {
    if (isToday(date))    return 'Today'
    if (isTomorrow(date)) return 'Tomorrow'
    const days = differenceInDays(date, new Date())
    if (days <= 6) return format(date, 'EEEE') // "Wednesday"
    return format(date, 'MMM d')
  }

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 size={16} className="animate-spin text-text-muted" />
    </div>
  )

  if (items.length === 0) return (
    <div className="text-center py-8">
      <Clock size={28} className="mx-auto text-text-muted/30 mb-2" />
      <p className="text-sm text-text-muted">Nothing coming up — you're clear.</p>
    </div>
  )

  return (
    <div className="divide-y divide-border -my-1">
      {items.map((item) => {
        const meta = TYPE_META[item.type]
        const Icon = meta.icon
        const dateLabel = fmtDate(item.date)
        const isUrgent = differenceInDays(item.date, new Date()) <= 1

        const inner = (
          <div className={`flex items-center gap-3 py-3 ${item.link ? 'hover:bg-surface-2/40 -mx-6 px-6 rounded-xl transition-colors' : ''}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
              <Icon size={14} className={meta.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{item.title}</p>
              {item.client && (
                <p className="text-xs text-text-muted truncate">{item.client}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-xs font-semibold ${isUrgent ? 'text-red-500' : 'text-text-muted'}`}>
                {dateLabel}
              </p>
              <p className="text-[10px] text-text-muted">{meta.label}</p>
            </div>
          </div>
        )

        return item.link ? (
          <Link key={item.id} to={item.link}>{inner}</Link>
        ) : (
          <div key={item.id}>{inner}</div>
        )
      })}
    </div>
  )
}

// ─── Weekly rings tracker ─────────────────────────────────────────────────────
function Ring({ value, peak, color, track = '#f1f0fe', size = 88, stroke = 10 }) {
  const R = (size - stroke) / 2
  const circumference = 2 * Math.PI * R
  const fill = peak > 0 ? Math.min(value / peak, 1) : 0
  const offset = circumference * (1 - fill)
  const cx = size / 2, cy = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={track} strokeWidth={stroke} />
      {value > 0 && (
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
      )}
    </svg>
  )
}

function WeeklyRings() {
  const [offset, setOffset] = useState(0)
  const [data, setData]     = useState({ shoots: 0, uploads: 0 })
  const [peak, setPeak]     = useState({ shoots: 1, uploads: 1 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const base = startOfWeek(new Date(), { weekStartsOn: 1 })
      const wkStart = addWeeks(base, offset)
      const wkEnd   = endOfWeek(wkStart, { weekStartsOn: 1 })

      // Current week counts
      const [{ count: shoots }, { count: uploads }] = await Promise.all([
        supabase.from('shoots').select('*', { count: 'exact', head: true })
          .gte('shoot_date', format(wkStart, 'yyyy-MM-dd'))
          .lte('shoot_date', format(wkEnd,   'yyyy-MM-dd')),
        supabase.from('shoot_uploads').select('*', { count: 'exact', head: true })
          .gte('created_at', wkStart.toISOString())
          .lte('created_at', wkEnd.toISOString()),
      ])

      // Peak from last 12 weeks (for ring scale)
      const peakStart = addWeeks(base, -11)
      const [{ data: shootRows }, { data: uploadRows }] = await Promise.all([
        supabase.from('shoots').select('shoot_date')
          .gte('shoot_date', format(peakStart, 'yyyy-MM-dd'))
          .lte('shoot_date', format(endOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd')),
        supabase.from('shoot_uploads').select('created_at')
          .gte('created_at', peakStart.toISOString())
          .lte('created_at', endOfWeek(base, { weekStartsOn: 1 }).toISOString()),
      ])

      // Bucket into weeks to find max
      const bucketMax = (rows, field, isDate) => {
        const counts = {}
        ;(rows || []).forEach((r) => {
          const d = isDate ? new Date(r[field] + 'T00:00:00') : new Date(r[field])
          const key = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
          counts[key] = (counts[key] || 0) + 1
        })
        return Math.max(...Object.values(counts), 1)
      }

      if (!cancelled) {
        setData({ shoots: shoots || 0, uploads: uploads || 0 })
        setPeak({
          shoots:  bucketMax(shootRows,  'shoot_date', true),
          uploads: bucketMax(uploadRows, 'created_at', false),
        })
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [offset])

  const base     = startOfWeek(new Date(), { weekStartsOn: 1 })
  const wkStart  = addWeeks(base, offset)
  const wkEnd    = endOfWeek(wkStart, { weekStartsOn: 1 })
  const isCurrent = offset === 0
  const weekLabel = isCurrent
    ? 'This Week'
    : `${format(wkStart, 'MMM d')} – ${format(wkEnd, 'MMM d')}`

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Weekly Tracker</h2>
          <p className="text-xs text-text-muted mt-0.5">Shoots scheduled · Files uploaded</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-surface-3 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="text-xs font-medium text-text-secondary w-36 text-center">{weekLabel}</span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={isCurrent}
            className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-surface-3 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <div className="flex justify-around items-center">
          {/* Shoots ring */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Ring value={data.shoots} peak={peak.shoots} color="#6C63FF" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-text-primary leading-none">{data.shoots}</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-text-primary">Shoots</p>
              <p className="text-[10px] text-text-muted">scheduled</p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-16 w-px bg-border" />

          {/* Uploads ring */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Ring value={data.uploads} peak={peak.uploads} color="#10b981" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-text-primary leading-none">{data.uploads}</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-text-primary">Files</p>
              <p className="text-[10px] text-text-muted">uploaded</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main dashboard ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { profile } = useAuth()
  const [stats, setStats]       = useState(null)
  const [weeks, setWeeks]       = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      // ── Stat counts ──────────────────────────────────────────────────────
      const [
        { count: clientCount },
        { count: openCount },
        { count: teamCount },
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('content_requests').select('*', { count: 'exact', head: true })
          .in('status', ['new', 'in_progress']),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).neq('role', 'client'),
      ])
      setStats({ clientCount, openCount, teamCount })

      // ── Weekly shoots chart ──────────────────────────────────────────────
      // Build 10 week buckets, weeks starting Monday
      const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
      const buckets = Array.from({ length: 10 }, (_, i) => {
        const start = addWeeks(thisWeekStart, i - 9)
        const end   = addWeeks(start, 1)
        return { start, end, label: format(start, 'MMM d'), count: 0 }
      })
      const rangeStart = buckets[0].start

      const { data: mediaRows } = await supabase
        .from('media')
        .select('created_at')
        .gte('created_at', rangeStart.toISOString())
        .order('created_at', { ascending: true })

      ;(mediaRows || []).forEach(({ created_at }) => {
        const d = new Date(created_at)
        const bucket = buckets.find((b) => isWithinInterval(d, { start: b.start, end: b.end }))
        if (bucket) bucket.count++
      })
      setWeeks(buckets)

      // ── Activity feed ────────────────────────────────────────────────────
      const [mediaRes, commentsRes, requestsRes] = await Promise.all([
        supabase
          .from('media')
          .select('id, title, created_at')
          .order('created_at', { ascending: false })
          .limit(25),

        supabase
          .from('media_comments')
          .select('id, content, created_at, profiles:user_id(full_name), media:media_id(title)')
          .order('created_at', { ascending: false })
          .limit(25),

        supabase
          .from('content_requests')
          .select('id, type, idea, file_name, created_at, profiles(full_name)')
          .order('created_at', { ascending: false })
          .limit(25),
      ])

      const events = []

      ;(mediaRes.data || []).forEach((m) => {
        events.push({
          id: `media-${m.id}`,
          kind: 'media',
          actor: null,
          description: `added a video — "${m.title || 'Untitled'}"`,
          created_at: m.created_at,
        })
      })

      ;(commentsRes.data || []).forEach((c) => {
        events.push({
          id: `comment-${c.id}`,
          kind: 'comment',
          actor: c.profiles?.full_name || null,
          description: `commented on "${c.media?.title || 'a video'}"`,
          created_at: c.created_at,
        })
      })

      ;(requestsRes.data || []).forEach((r) => {
        const isFootage = r.type === 'footage'
        events.push({
          id: `req-${r.id}`,
          kind: isFootage ? 'footage' : 'request',
          actor: r.profiles?.full_name || null,
          description: isFootage
            ? `uploaded footage${r.file_name ? ` — "${r.file_name}"` : ''}`
            : `submitted a post request${r.idea ? ` — "${r.idea.slice(0, 60)}${r.idea.length > 60 ? '…' : ''}"` : ''}`,
          created_at: r.created_at,
        })
      })

      // Sort all events newest first, cap at 40
      events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setActivity(events.slice(0, 40))

      setLoading(false)
    }
    load()
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  const statCards = [
    { label: 'Active Clients', value: stats?.clientCount ?? '—', icon: Building2, color: '#10b981', to: '/admin/clients' },
    { label: 'Open Requests',  value: stats?.openCount   ?? '—', icon: Inbox,     color: '#f59e0b', to: '/admin/inbox'   },
    { label: 'Team Members',   value: stats?.teamCount   ?? '—', icon: Users2,    color: '#6C63FF', to: '/admin/users'   },
  ]

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm text-text-muted">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-2xl font-bold text-text-primary">
          Good {greeting}, {profile?.full_name?.split(' ')[0] || 'Admin'}
        </h1>
        <p className="text-text-secondary mt-1">Here's what's happening across C4 Lab.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4">
            {statCards.map(({ label, value, icon: Icon, color, to }) => (
              <Link key={label} to={to}
                className="card p-5 hover:shadow-md transition-shadow flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: color + '18' }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{value}</p>
                  <p className="text-sm text-text-muted">{label}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Weekly rings */}
          <WeeklyRings />

          {/* Upcoming */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Coming Up</h2>
                <p className="text-xs text-text-muted mt-0.5">Shoots, due dates, and meetings</p>
              </div>
              <Link to="/calendar" className="text-xs text-accent font-medium hover:underline">View calendar →</Link>
            </div>
            <UpcomingList />
          </div>

          {/* Growth chart */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-text-primary">Shoots per Week</h2>
              <span className="text-xs text-text-muted">Last 10 weeks</span>
            </div>
            <p className="text-xs text-text-muted mb-4">Each bar = one week starting Monday</p>
            {weeks.every((w) => w.count === 0) ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Film size={28} className="text-surface-3 mb-2" />
                <p className="text-sm text-text-muted">No media uploaded yet — this will fill in as you add content.</p>
              </div>
            ) : (
              <WeeklyChart weeks={weeks} />
            )}
          </div>

          {/* Activity feed */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-1">All Activity</h2>
            <p className="text-xs text-text-muted mb-4">Every action across the platform, newest first.</p>
            {activity.length === 0 ? (
              <div className="text-center py-8 text-sm text-text-muted">No activity yet.</div>
            ) : (
              <div className="divide-y divide-border -my-1">
                {activity.map((item) => (
                  <ActivityItem key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
