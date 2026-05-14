import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loader2 } from 'lucide-react'

import AppShell from './components/layout/AppShell'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Home from './pages/Home'
import VideoList from './pages/VideoList'
import VideoReview from './pages/VideoReview'
import CalendarPage from './pages/CalendarPage'
import AdminDashboard from './pages/admin/Dashboard'
import UserManagement from './pages/admin/UserManagement'
import AdminClients from './pages/admin/Clients'
import AdminInbox from './pages/admin/Inbox'
import CreativeDashboard from './pages/creative/Dashboard'
import ClientDashboard from './pages/client/Dashboard'
import ClientCalendarView from './pages/client/CalendarView'
import RequestPost from './pages/client/RequestPost'
import UploadFootage from './pages/client/UploadFootage'

function RoleRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'admin') return <Navigate to="/admin" replace />
  if (profile.role === 'creative') return <Navigate to="/dashboard" replace />
  if (profile.role === 'client') return <Navigate to="/client" replace />
  return <Navigate to="/login" replace />
}

function ProtectedRoute({ children, roles }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center gap-3">
        <Loader2 size={24} className="animate-spin text-white/40" />
        <p className="text-white/30 text-xs">Loading C4 Lab...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Force password change before anything else
  if (profile?.must_change_password && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  // Role guard
  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<RoleRedirect />} />

        {/* Admin */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute roles={['admin']}><UserManagement /></ProtectedRoute>
        } />
        <Route path="/admin/clients" element={
          <ProtectedRoute roles={['admin']}><AdminClients /></ProtectedRoute>
        } />
        <Route path="/admin/inbox" element={
          <ProtectedRoute roles={['admin']}><AdminInbox /></ProtectedRoute>
        } />

        {/* Creative */}
        <Route path="/dashboard" element={
          <ProtectedRoute roles={['admin', 'creative']}><CreativeDashboard /></ProtectedRoute>
        } />

        {/* Client */}
        <Route path="/client" element={
          <ProtectedRoute roles={['client']}><ClientDashboard /></ProtectedRoute>
        } />
        <Route path="/client/calendar" element={
          <ProtectedRoute roles={['client']}><ClientCalendarView /></ProtectedRoute>
        } />
        <Route path="/client/request" element={
          <ProtectedRoute roles={['client']}><RequestPost /></ProtectedRoute>
        } />
        <Route path="/client/upload" element={
          <ProtectedRoute roles={['client']}><UploadFootage /></ProtectedRoute>
        } />

        {/* Shared */}
        <Route path="/videos" element={
          <ProtectedRoute roles={['admin', 'creative']}><VideoList /></ProtectedRoute>
        } />
        <Route path="/video/:id" element={
          <ProtectedRoute roles={['admin', 'creative', 'client']}><VideoReview /></ProtectedRoute>
        } />
        <Route path="/calendar" element={
          <ProtectedRoute roles={['admin', 'creative']}><CalendarPage /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
