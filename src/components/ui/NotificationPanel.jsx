import { useNavigate } from 'react-router-dom'
import { X, Bell, BellOff, Check, MessageSquare, Film, FileText, Upload, Pin, Info } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useNotifications } from '../../contexts/NotificationContext'

const TYPE = {
  message:         { icon: MessageSquare, color: 'text-accent',       bg: 'bg-accent/10'    },
  video_review:    { icon: Film,          color: 'text-blue-600',     bg: 'bg-blue-50'      },
  content_request: { icon: FileText,      color: 'text-orange-600',   bg: 'bg-orange-50'    },
  footage_upload:  { icon: Upload,        color: 'text-green-600',    bg: 'bg-green-50'     },
  pin_request:     { icon: Pin,           color: 'text-amber-600',    bg: 'bg-amber-50'     },
  info:            { icon: Info,          color: 'text-text-muted',   bg: 'bg-surface-3'    },
}

export default function NotificationPanel() {
  const navigate = useNavigate()
  const {
    notifications, unreadCount, panelOpen, setPanelOpen,
    pushEnabled, pushLoading, enablePush,
    markRead, markAllRead,
  } = useNotifications()

  if (!panelOpen) return null

  const handleClick = (n) => {
    if (!n.read) markRead(n.id)
    if (n.link) navigate(n.link)
    setPanelOpen(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={() => setPanelOpen(false)} />

      {/* Panel */}
      <div className="fixed left-[220px] top-0 bottom-0 z-50 w-80 bg-white border-r border-border flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-bold text-text-primary">Notifications</h2>
            {unreadCount > 0 && (
              <p className="text-xs text-text-muted">{unreadCount} unread</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="text-xs text-accent hover:underline font-medium">
                Mark all read
              </button>
            )}
            <button onClick={() => setPanelOpen(false)} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Push notifications banner */}
        {!pushEnabled && (
          <div className="mx-4 mt-3 px-3 py-2.5 bg-accent/5 border border-accent/20 rounded-xl flex items-center gap-2.5">
            <Bell size={14} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary">Enable push notifications</p>
              <p className="text-[11px] text-text-muted">Get notified even when the tab is closed</p>
            </div>
            <button onClick={enablePush} disabled={pushLoading}
              className="text-xs font-semibold text-accent hover:underline shrink-0 disabled:opacity-50">
              {pushLoading ? 'Enabling…' : 'Enable'}
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
              <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
                <Bell size={20} className="text-text-muted" />
              </div>
              <p className="text-sm font-semibold text-text-primary mb-1">All caught up</p>
              <p className="text-xs text-text-muted">Notifications will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const cfg = TYPE[n.type] || TYPE.info
                const Icon = cfg.icon
                return (
                  <button key={n.id} onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 ${!n.read ? 'bg-accent/3' : ''}`}>
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon size={14} className={cfg.color} />
                    </div>
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-tight ${!n.read ? 'font-semibold text-text-primary' : 'font-medium text-text-primary'}`}>
                          {n.title}
                        </p>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1" />}
                      </div>
                      {n.body && (
                        <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-text-muted mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
