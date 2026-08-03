import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, Bell, Sun, Moon } from 'lucide-react'
import Sidebar from './Sidebar'
import { NotificationProvider, useNotifications } from '../../contexts/NotificationContext'
import { useTheme } from '../../contexts/ThemeContext'
import NotificationPanel from '../ui/NotificationPanel'
import UploadProgressBar from '../UploadProgressBar'
import LogoBadge from '../ui/Logo'

// Mobile-only top bar. Gives phones a hamburger to open the nav drawer, the
// brand, and quick access to notifications. Hidden from md up, where the
// static sidebar is always visible.
function MobileTopBar({ onMenu }) {
  const { unreadCount, setPanelOpen } = useNotifications()
  const { theme, toggleTheme } = useTheme()
  return (
    <header
      className="md:hidden sticky top-0 z-30 bg-sidebar border-b border-white/5"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2 h-14 px-4">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="-ml-1.5 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <LogoBadge size={26} />
          <span className="font-display text-white font-semibold text-sm truncate">C4C Lab</span>
        </div>
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          aria-label="Notifications"
          className="relative -mr-1.5 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 min-w-[15px] h-[15px] px-0.5 flex items-center justify-center rounded-full bg-accent text-white text-[9px] font-bold leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}

export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <NotificationProvider>
      <UploadProgressBar />
      <div className="app-ground flex h-screen overflow-hidden">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <NotificationPanel />
        {/* min-w-0 lets wide content (tables, media) shrink instead of forcing
            the whole layout wider than the screen on mobile. */}
        <div className="flex-1 flex flex-col min-w-0">
          <MobileTopBar onMenu={() => setNavOpen(true)} />
          <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </NotificationProvider>
  )
}
