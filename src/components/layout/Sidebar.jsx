import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Film, CalendarDays, Settings,
  LogOut, Users, Building2, Inbox, Home, MessageSquare, Bell, FolderKanban, HardDrive,
  ShieldCheck, Scissors, Clapperboard, Camera, Megaphone, X
} from 'lucide-react'

import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'
import Avatar from '../ui/Avatar'
import LogoBadge from '../ui/Logo'

const NAV = {
  admin: [
    { to: '/admin',         icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/admin/users',   icon: Users,           label: 'Users' },
    { to: '/admin/clients', icon: Building2,        label: 'Clients' },
    { to: '/projects',      icon: FolderKanban,     label: 'Projects' },
    { to: '/admin/inbox',   icon: Inbox,            label: 'Inbox' },
    { to: '/admin/shoots',  icon: Camera,           label: 'Gallery Links' },
    { to: '/referrals',     icon: Megaphone,        label: 'Referrals' },
    { to: '/videos',        icon: Film,             label: 'Review' },
    { to: '/admin/files',   icon: HardDrive,        label: 'Files' },
    { to: '/calendar',      icon: CalendarDays,     label: 'Calendar' },
    { to: '/messages',      icon: MessageSquare,    label: 'Messages' },
  ],
  creative: [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/calendar',     icon: CalendarDays,     label: 'Calendar' },
    { to: '/clients',      icon: Building2,        label: 'Clients' },
    { to: '/projects',     icon: FolderKanban,     label: 'Projects' },
    { to: '/referrals',    icon: Megaphone,        label: 'Referrals' },
    { to: '/admin/shoots', icon: Camera,           label: 'Gallery Links' },
    { to: '/files',        icon: Clapperboard,     label: 'Media' },
    { to: '/messages',     icon: MessageSquare,    label: 'Messages' },
  ],
  editor: [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/calendar',     icon: CalendarDays,     label: 'Calendar' },
    { to: '/clients',      icon: Building2,        label: 'Clients' },
    { to: '/projects',     icon: FolderKanban,     label: 'Projects' },
    { to: '/referrals',    icon: Megaphone,        label: 'Referrals' },
    { to: '/admin/shoots', icon: Camera,           label: 'Gallery Links' },
    { to: '/files',        icon: Clapperboard,     label: 'Media' },
    { to: '/messages',     icon: MessageSquare,    label: 'Messages' },
  ],
  client: [
    { to: '/client',          icon: Home,           label: 'Home',        end: true },
    { to: '/my-projects',     icon: FolderKanban,   label: 'Projects' },
    { to: '/client/calendar', icon: CalendarDays,   label: 'Calendar' },
  ],
}

const ROLE_LABELS = { admin: 'Admin', creative: 'Creative', editor: 'Editor', client: 'Client' }

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { profile, user, signOut, viewMode, setViewMode } = useAuth()
  const { unreadCount, setPanelOpen } = useNotifications()
  const navigate = useNavigate()
  const role = profile?.role || 'creative'
  const isAdmin = role === 'admin'

  // Admins use viewMode to pick which nav to show; others use their role
  const effectiveNav = isAdmin ? (viewMode || 'admin') : role
  const navItems = NAV[effectiveNav] || NAV[role] || NAV.creative

  const displayName = profile?.full_name || user?.email || 'You'

  const toggleView = () => {
    const next = viewMode === 'admin' ? 'creative' : 'admin'
    setViewMode(next)
    navigate(next === 'creative' ? '/calendar' : '/admin')
    onClose()
  }

  return (
    <>
      {/* Mobile backdrop. Tap to dismiss the drawer. */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`bg-sidebar flex flex-col z-50 w-[264px] max-w-[82vw]
          fixed inset-y-0 left-0 transform transition-transform duration-300 ease-out shadow-2xl
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:static md:translate-x-0 md:w-[220px] md:max-w-none md:shrink-0 md:shadow-none`}
      >
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="shrink-0"><LogoBadge size={32} /></div>
          <div className="min-w-0">
            <p className="font-display text-white font-semibold text-sm leading-tight">C4C Lab</p>
            <p className="text-white/40 text-xs leading-tight truncate">Connect Four Creative</p>
          </div>
          {/* Close button. Mobile only */}
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="md:hidden ml-auto -mr-1 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Admin/Creative toggle. Only for admins */}
      {isAdmin && (
        <div className="px-3 pt-3 pb-1">
          <button
            onClick={toggleView}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              {viewMode === 'admin'
                ? <ShieldCheck size={13} className="text-accent-hover" />
                : <Scissors size={13} className="text-accent-warm" />
              }
              <span className="text-xs font-semibold text-white/70">
                {viewMode === 'admin' ? 'Admin view' : 'Creative view'}
              </span>
            </div>
            <span className="text-[10px] text-white/30 font-medium">switch</span>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-100 ${
                isActive
                  ? 'bg-accent/20 text-white shadow-[inset_2px_0_0_0_rgb(var(--violet-rgb))]'
                  : 'text-white/50 hover:text-white hover:bg-sidebar-hover'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/5 space-y-0.5">
        {/* Notifications bell */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/40 hover:text-white hover:bg-sidebar-hover transition-colors duration-100"
        >
          <div className="relative">
            <Bell size={16} strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-accent text-white text-[9px] font-bold leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          Notifications
          {unreadCount > 0 && (
            <span className="ml-auto text-xs font-bold text-accent">{unreadCount}</span>
          )}
        </button>

        <NavLink
          to="/settings"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/40 hover:text-white hover:bg-sidebar-hover transition-colors duration-100"
        >
          <Settings size={16} strokeWidth={1.75} />
          Settings
        </NavLink>

        <div className="flex items-center gap-2.5 px-3 py-2.5 mt-1">
          <Avatar name={displayName} url={profile?.avatar_url} size={7} />
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-xs font-medium truncate">{displayName}</p>
            {role !== 'client' && <p className="text-white/30 text-xs">{ROLE_LABELS[role] || role}</p>}
            {profile?.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {profile.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={signOut} title="Sign out" className="text-white/30 hover:text-white transition-colors shrink-0">
            <LogOut size={14} />
          </button>
        </div>
      </div>
      </aside>
    </>
  )
}
