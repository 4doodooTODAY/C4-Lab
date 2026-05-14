import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { NotificationProvider } from '../../contexts/NotificationContext'
import NotificationPanel from '../ui/NotificationPanel'

export default function AppShell() {
  return (
    <NotificationProvider>
      <div className="flex h-screen overflow-hidden bg-surface-2">
        <Sidebar />
        <NotificationPanel />
        <main className="flex-1 overflow-y-auto flex flex-col">
          <Outlet />
        </main>
      </div>
    </NotificationProvider>
  )
}
