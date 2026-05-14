import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Film, CalendarDays, Settings,
  LogOut, Users, Building2, Inbox, Home, PenLine, Upload, MessageSquare
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV = {
  admin: [
    { to: '/admin',         icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/admin/users',   icon: Users,           label: 'Users' },
    { to: '/admin/clients', icon: Building2,        label: 'Clients' },
    { to: '/admin/inbox',   icon: Inbox,            label: 'Inbox' },
    { to: '/videos',        icon: Film,             label: 'Review' },
    { to: '/calendar',      icon: CalendarDays,     label: 'Calendar' },
    { to: '/messages',      icon: MessageSquare,    label: 'Messages' },
  ],
  creative: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/videos',    icon: Film,             label: 'Review' },
    { to: '/calendar',  icon: CalendarDays,     label: 'Calendar' },
    { to: '/messages',  icon: MessageSquare,    label: 'Messages' },
  ],
  client: [
    { to: '/client',          icon: Home,           label: 'Home',           end: true },
    { to: '/client/calendar', icon: CalendarDays,   label: 'Calendar' },
    { to: '/client/request',  icon: PenLine,        label: 'Request a Post' },
    { to: '/client/upload',   icon: Upload,         label: 'Upload Footage' },
    { to: '/messages',        icon: MessageSquare,  label: 'Messages' },
  ],
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

const ROLE_LABELS = { admin: 'Admin', creative: 'Creative', client: 'Client' }

export default function Sidebar() {
  const { profile, user, signOut } = useAuth()
  const role = profile?.role || 'creative'
  const navItems = NAV[role] || NAV.creative
  const displayName = profile?.full_name || user?.email || 'You'

  return (
    <aside className="w-[220px] min-h-screen bg-sidebar flex flex-col shrink-0">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm leading-none">C4</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">C4 Lab</p>
            <p className="text-white/40 text-xs leading-tight">Connect Four Creative</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-100 ${
                isActive
                  ? 'bg-sidebar-active text-white'
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
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/40 hover:text-white hover:bg-sidebar-hover transition-colors duration-100"
        >
          <Settings size={16} strokeWidth={1.75} />
          Settings
        </NavLink>

        <div className="flex items-center gap-2.5 px-3 py-2.5 mt-1">
          <div className="w-7 h-7 rounded-full bg-accent/60 flex items-center justify-center shrink-0 text-white text-xs font-semibold">
            {getInitials(displayName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-xs font-medium truncate">{displayName}</p>
            <p className="text-white/30 text-xs">{ROLE_LABELS[role] || role}</p>
          </div>
          <button onClick={signOut} title="Sign out" className="text-white/30 hover:text-white transition-colors shrink-0">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
