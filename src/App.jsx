import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loader2 } from 'lucide-react'

// Lazy load all pages — only load what's needed for the current route
const AppShell        = lazy(() => import('./components/layout/AppShell'))
const Login           = lazy(() => import('./pages/Login'))
const ChangePassword  = lazy(() => import('./pages/ChangePassword'))
const AdminDashboard  = lazy(() => import('./pages/admin/Dashboard'))
const UserManagement  = lazy(() => import('./pages/admin/UserManagement'))
const UserDetail      = lazy(() => import('./pages/admin/UserDetail'))
const AdminClients    = lazy(() => import('./pages/admin/Clients'))
const ClientDetail    = lazy(() => import('./pages/admin/ClientDetail'))
const AdminProjects   = lazy(() => import('./pages/admin/Projects'))
const ProjectDetail   = lazy(() => import('./pages/admin/ProjectDetail'))
const AdminInbox      = lazy(() => import('./pages/admin/Inbox'))
const CreativeDashboard = lazy(() => import('./pages/creative/Dashboard'))
const ClientDashboard = lazy(() => import('./pages/client/Dashboard'))
const ClientCalendarView = lazy(() => import('./pages/client/CalendarView'))
const RequestPost     = lazy(() => import('./pages/client/RequestPost'))
const UploadFootage   = lazy(() => import('./pages/client/UploadFootage'))
const VideoList              = lazy(() => import('./pages/VideoList'))
const VideoReview            = lazy(() => import('./pages/VideoReview'))
const CalendarPage           = lazy(() => import('./pages/CalendarPage'))
const Settings               = lazy(() => import('./pages/Settings'))
const Messages               = lazy(() => import('./pages/Messages'))
const CreativeProjectList    = lazy(() => import('./pages/creative/ProjectList'))
const CreativeProjectWorkflow = lazy(() => import('./pages/creative/ProjectWorkflow'))
const ClientMyProjects       = lazy(() => import('./pages/client/MyProjects'))
const VideoRevisionReview    = lazy(() => import('./pages/VideoRevisionReview'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <Loader2 size={20} className="animate-spin text-text-muted" />
    </div>
  )
}

function AppLoader() {
  return (
    <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center gap-3">
      <Loader2 size={24} className="animate-spin text-white/40" />
      <p className="text-white/30 text-xs">Loading C4 Lab...</p>
    </div>
  )
}

function RoleSwitch({ admin, creative, client }) {
  const { profile } = useAuth()
  const role = profile?.role
  if (role === 'admin' && admin) return admin
  if (role === 'creative' && creative) return creative
  if (role === 'client' && client) return client
  return admin || creative || client || null
}

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

  if (loading) return <AppLoader />
  if (!user) return <Navigate to="/login" replace />

  if (profile?.must_change_password && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={
          <ProtectedRoute><ChangePassword /></ProtectedRoute>
        } />

        <Route element={
          <ProtectedRoute>
            <Suspense fallback={<AppLoader />}>
              <AppShell />
            </Suspense>
          </ProtectedRoute>
        }>
          <Route path="/" element={<RoleRedirect />} />

          {/* Admin */}
          <Route path="/admin" element={
            <ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute roles={['admin']}><UserManagement /></ProtectedRoute>
          } />
          <Route path="/admin/users/:id" element={
            <ProtectedRoute roles={['admin']}><UserDetail /></ProtectedRoute>
          } />
          <Route path="/admin/clients" element={
            <ProtectedRoute roles={['admin']}><AdminClients /></ProtectedRoute>
          } />
          <Route path="/admin/clients/:id" element={
            <ProtectedRoute roles={['admin']}><ClientDetail /></ProtectedRoute>
          } />
          <Route path="/admin/inbox" element={
            <ProtectedRoute roles={['admin']}><AdminInbox /></ProtectedRoute>
          } />
          <Route path="/projects" element={
            <ProtectedRoute roles={['admin', 'creative']}>
              <RoleSwitch
                admin={<AdminProjects />}
                creative={<CreativeProjectList />}
              />
            </ProtectedRoute>
          } />
          <Route path="/projects/:id" element={
            <ProtectedRoute roles={['admin', 'creative']}><ProjectDetail /></ProtectedRoute>
          } />
          <Route path="/projects/:id/creative" element={
            <ProtectedRoute roles={['admin', 'creative']}><CreativeProjectWorkflow /></ProtectedRoute>
          } />
          <Route path="/projects/:id/revision/:revisionId" element={
            <ProtectedRoute roles={['admin', 'creative', 'client']}><VideoRevisionReview /></ProtectedRoute>
          } />

          {/* Creative */}
          <Route path="/dashboard" element={
            <ProtectedRoute roles={['admin', 'creative']}><CreativeDashboard /></ProtectedRoute>
          } />

          {/* Client */}
          <Route path="/my-projects" element={
            <ProtectedRoute roles={['client']}><ClientMyProjects /></ProtectedRoute>
          } />
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

          <Route path="/messages" element={<Messages />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
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
