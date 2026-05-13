import { useState } from 'react'
import { Loader2, Inbox, FileVideo, Megaphone, CheckCircle, Clock, AlertCircle, ExternalLink } from 'lucide-react'
import { useContentRequests } from '../../hooks/useContentRequests'
import { format } from 'date-fns'

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    color: 'text-text-muted bg-surface-3' },
  normal: { label: 'Normal', color: 'text-blue-600 bg-blue-50' },
  high:   { label: 'High',   color: 'text-amber-600 bg-amber-50' },
  urgent: { label: 'Urgent', color: 'text-red-600 bg-red-50' },
}

const STATUS_CONFIG = {
  new:         { label: 'New',         icon: Clock,         color: 'text-text-muted bg-surface-3' },
  in_progress: { label: 'In Progress', icon: AlertCircle,   color: 'text-blue-600 bg-blue-50' },
  done:        { label: 'Done',        icon: CheckCircle,   color: 'text-green-600 bg-green-50' },
}

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  nextdoor: 'Nextdoor',
  other: 'Other',
}

function RequestCard({ item, onStatusChange }) {
  const priority = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal
  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.new
  const StatusIcon = status.icon

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {item.platform && (
              <span className="text-xs font-medium text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">
                {PLATFORM_LABELS[item.platform] || item.platform}
              </span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priority.color}`}>
              {priority.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-text-primary">{item.idea}</p>
          <p className="text-xs text-text-muted mt-0.5">
            {item.clients?.name && <span>{item.clients.name} · </span>}
            {item.profiles?.full_name && <span>{item.profiles.full_name} · </span>}
            {format(new Date(item.created_at), 'MMM d, h:mm a')}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${status.color}`}>
          <StatusIcon size={11} />
          {status.label}
        </div>
      </div>

      {item.notes && (
        <p className="text-sm text-text-secondary bg-surface-2 rounded-lg px-3 py-2">{item.notes}</p>
      )}

      {item.inspiration_url && (
        <a
          href={item.inspiration_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <ExternalLink size={11} />
          View inspiration
        </a>
      )}

      <div className="flex items-center gap-2 pt-1">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onStatusChange(item.id, key)}
            className={`text-xs px-3 py-1 rounded-full border transition-all font-medium ${
              item.status === key
                ? 'border-accent bg-accent text-white'
                : 'border-border text-text-muted hover:border-accent hover:text-accent'
            }`}
          >
            {cfg.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function FootageCard({ item, onStatusChange }) {
  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.new
  const StatusIcon = status.icon
  const fileSizeMB = item.file_size ? (item.file_size / 1024 / 1024).toFixed(1) : null

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{item.idea || item.file_name || 'Footage Upload'}</p>
          <p className="text-xs text-text-muted mt-0.5">
            {item.clients?.name && <span>{item.clients.name} · </span>}
            {item.profiles?.full_name && <span>{item.profiles.full_name} · </span>}
            {format(new Date(item.created_at), 'MMM d, h:mm a')}
          </p>
          {fileSizeMB && (
            <p className="text-xs text-text-muted mt-0.5">{fileSizeMB} MB</p>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${status.color}`}>
          <StatusIcon size={11} />
          {status.label}
        </div>
      </div>

      {item.notes && (
        <p className="text-sm text-text-secondary bg-surface-2 rounded-lg px-3 py-2">{item.notes}</p>
      )}

      {item.file_url && (
        <a
          href={item.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <ExternalLink size={11} />
          Download footage
        </a>
      )}

      <div className="flex items-center gap-2 pt-1">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onStatusChange(item.id, key)}
            className={`text-xs px-3 py-1 rounded-full border transition-all font-medium ${
              item.status === key
                ? 'border-accent bg-accent text-white'
                : 'border-border text-text-muted hover:border-accent hover:text-accent'
            }`}
          >
            {cfg.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AdminInbox() {
  const [tab, setTab] = useState('requests')
  const { requests, loading, updateRequestStatus } = useContentRequests()

  const postRequests = requests.filter((r) => r.type === 'post_request')
  const footage = requests.filter((r) => r.type === 'footage')
  const activeList = tab === 'requests' ? postRequests : footage

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Inbox</h1>
        <p className="text-text-secondary mt-1">Client post requests and footage uploads.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-xl w-fit mb-6">
        {[
          { key: 'requests', label: 'Post Requests', icon: Megaphone, count: postRequests.length },
          { key: 'footage',  label: 'Footage',       icon: FileVideo,  count: footage.length },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-surface-1 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Icon size={14} />
            {label}
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                tab === key ? 'bg-accent text-white' : 'bg-surface-3 text-text-muted'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-text-muted" />
        </div>
      ) : activeList.length === 0 ? (
        <div className="card p-12 text-center">
          <Inbox size={36} className="mx-auto text-surface-3 mb-3" />
          <p className="text-sm font-semibold text-text-primary mb-1">
            {tab === 'requests' ? 'No post requests yet' : 'No footage uploads yet'}
          </p>
          <p className="text-sm text-text-muted">
            {tab === 'requests'
              ? "Client post requests will appear here."
              : "Client footage uploads will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeList.map((item) =>
            tab === 'requests' ? (
              <RequestCard key={item.id} item={item} onStatusChange={updateRequestStatus} />
            ) : (
              <FootageCard key={item.id} item={item} onStatusChange={updateRequestStatus} />
            )
          )}
        </div>
      )}
    </div>
  )
}
