import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loader2 } from 'lucide-react'

// Lazy-load wrapper that survives deploys. When a new version ships, the old
// tab's chunk filenames (content-hashed) no longer exist, so import() throws
// "Failed to fetch dynamically imported module" and the page renders blank.
// On that failure we force a one-time full reload to pull the fresh manifest.
function lazyWithRetry(importer) {
  return lazy(async () => {
    const KEY = 'c4lab_chunk_reload_ts'
    try {
      const mod = await importer()
      sessionStorage.removeItem(KEY) // healthy load — re-arm for the next deploy
      return mod
    } catch (err) {
      const last = Number(sessionStorage.getItem(KEY) || 0)
      // Only auto-reload once per 10s window so a genuinely-broken chunk can't
      // trap the user in an infinite reload loop.
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
        return new Promise(() => {}) // hold render until the reload happens
      }
      throw err
    }
  })
}

// Lazy load all pages — only load what's needed for the current route
const AppShell        = lazyWithRetry(() => import('./components/layout/AppShell'))
const Login           = lazyWithRetry(() => import('./pages/Login'))
const ChangePassword  = lazyWithRetry(() => import('./pages/ChangePassword'))
const AdminDashboard  = lazyWithRetry(() => import('./pages/admin/Dashboard'))
const UserManagement  = lazyWithRetry(() => import('./pages/admin/UserManagement'))
const UserDetail      = lazyWithRetry(() => import('./pages/admin/UserDetail'))
const AdminClients    = lazyWithRetry(() => import('./pages/admin/Clients'))
const ClientDetail    = lazyWithRetry(() => import('./pages/admin/ClientDetail'))
const ClientHub       = lazyWithRetry(() => import('./pages/admin/ClientHub'))
const AdminProjects   = lazyWithRetry(() => import('./pages/admin/Projects'))
const ProjectDetail   = lazyWithRetry(() => import('./pages/admin/ProjectDetail'))
const AdminInbox      = lazyWithRetry(() => import('./pages/admin/Inbox'))
const CreativeDashboard = lazyWithRetry(() => import('./pages/creative/Dashboard'))
const CreativeClients   = lazyWithRetry(() => import('./pages/creative/Clients'))
const CreativeClientPage = lazyWithRetry(() => import('./pages/creative/ClientPage'))
const ClientDashboard   = lazyWithRetry(() => import('./pages/client/Dashboard'))
const ContentCalendar   = lazyWithRetry(() => import('./pages/client/ContentCalendar'))
const ClientCalendarView = lazyWithRetry(() => import('./pages/client/CalendarView'))
const RequestPost     = lazyWithRetry(() => import('./pages/client/RequestPost'))
const UploadFootage   = lazyWithRetry(() => import('./pages/client/UploadFootage'))
const VideoList              = lazyWithRetry(() => import('./pages/VideoList'))
const VideoReview            = lazyWithRetry(() => import('./pages/VideoReview'))
const CalendarPage           = lazyWithRetry(() => import('./pages/CalendarPage'))
const Settings               = lazyWithRetry(() => import('./pages/Settings'))
const Messages               = lazyWithRetry(() => import('./pages/Messages'))
const CreativeProjectList    = lazyWithRetry(() => import('./pages/creative/ProjectList'))
const CreativeProjectWorkflow = lazyWithRetry(() => import('./pages/creative/ProjectWorkflow'))
const ClientMyProjects       = lazyWithRetry(() => import('./pages/client/MyProjects'))
// ClientMyConcepts removed — concepts no longer exist in the system
const VideoRevisionReview    = lazyWithRetry(() => import('./pages/VideoRevisionReview'))
const PhotoRevisionReview    = lazyWithRetry(() => import('./pages/PhotoRevisionReview'))
const AdminFileSystem        = lazyWithRetry(() => import('./pages/admin/FileSystem'))
const DraftsPage             = lazyWithRetry(() => import('./pages/DraftsPage'))
const DraftVideoReview       = lazyWithRetry(() => import('./pages/DraftVideoReview'))
const DraftPhotoReview       = lazyWithRetry(() => import('./pages/DraftPhotoReview'))

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
  const { profile, viewMode } = useAuth()
  const role = profile?.role
  if (role === 'admin') {
    // Admins can flip into "Creative View" — honour it so they see the same
    // creative screens (with the assigned-vs-client split) the team sees.
    if (viewMode === 'creative' && creative) return creative
    if (admin) return admin
  }
  if ((role === 'creative' || role === 'editor') && creative) return creative
  if (role === 'client' && client) return client
  return admin || creative || client || null
}

function RoleRedirect() {
  const { profile, loading, viewMode } = useAuth()
  if (loading) return null
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'admin') return <Navigate to={viewMode === 'creative' ? '/dashboard' : '/admin'} replace />
  if (profile.role === 'creative') return <Navigate to="/dashboard" replace />
  if (profile.role === 'editor') return <Navigate to="/dashboard" replace />
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

// Warm the route chunks in the background once the app is idle, so navigating
// between pages is near-instant instead of waiting on a fresh network fetch.
function usePrefetchRoutes() {
  useEffect(() => {
    const importers = [
      () => import('./pages/admin/ClientHub'),
      () => import('./pages/admin/ProjectDetail'),
      () => import('./pages/creative/ProjectWorkflow'),
      () => import('./pages/DraftsPage'),
      () => import('./pages/DraftVideoReview'),
      () => import('./pages/DraftPhotoReview'),
      () => import('./pages/VideoRevisionReview'),
      () => import('./pages/PhotoRevisionReview'),
      () => import('./pages/CalendarPage'),
      () => import('./pages/Messages'),
      () => import('./pages/client/ContentCalendar'),
      () => import('./pages/client/MyProjects'),
    ]
    let i = 0
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300))
    const pump = () => {
      if (i >= importers.length) return
      importers[i++]().catch(() => {}) // ignore prefetch failures
      idle(pump)
    }
    const handle = idle(pump)
    return () => (window.cancelIdleCallback || clearTimeout)(handle)
  }, [])
}

function AppRoutes() {
  usePrefetchRoutes()
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
            <ProtectedRoute roles={['admin']}><ClientHub /></ProtectedRoute>
          } />
          <Route path="/admin/inbox" element={
            <ProtectedRoute roles={['admin']}><AdminInbox /></ProtectedRoute>
          } />
          <Route path="/admin/files" element={
            <ProtectedRoute roles={['admin']}><AdminFileSystem /></ProtectedRoute>
          } />
          <Route path="/files" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor']}><AdminFileSystem /></ProtectedRoute>
          } />
          <Route path="/projects" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor']}>
              <RoleSwitch
                admin={<AdminProjects />}
                creative={<CreativeProjectList />}
              />
            </ProtectedRoute>
          } />
          <Route path="/projects/:id" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor']}><ProjectDetail /></ProtectedRoute>
          } />
          <Route path="/projects/:id/creative" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor']}><CreativeProjectWorkflow /></ProtectedRoute>
          } />
          <Route path="/projects/:id/revision/:revisionId" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor', 'client']}><VideoRevisionReview /></ProtectedRoute>
          } />
          <Route path="/projects/:id/photo-revision/:revisionId" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor', 'client']}><PhotoRevisionReview /></ProtectedRoute>
          } />

          {/* Content draft upload hub + per-version review */}
          <Route path="/drafts/:draftId" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor', 'client']}><DraftsPage /></ProtectedRoute>
          } />
          <Route path="/drafts/:draftId/video-review/:versionId" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor', 'client']}><DraftVideoReview /></ProtectedRoute>
          } />
          <Route path="/drafts/:draftId/photo-review/:versionId" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor', 'client']}><DraftPhotoReview /></ProtectedRoute>
          } />

          {/* Creative */}
          <Route path="/dashboard" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor']}><CreativeDashboard /></ProtectedRoute>
          } />
          <Route path="/clients" element={
            <ProtectedRoute roles={['creative', 'editor', 'admin']}><CreativeClients /></ProtectedRoute>
          } />
          <Route path="/clients/:id" element={
            <ProtectedRoute roles={['creative', 'editor', 'admin']}><CreativeClientPage /></ProtectedRoute>
          } />

          {/* Client */}
          <Route path="/my-projects" element={
            <ProtectedRoute roles={['client']}><ClientMyProjects /></ProtectedRoute>
          } />
          <Route path="/client" element={
            <ProtectedRoute roles={['client']}><ClientDashboard /></ProtectedRoute>
          } />
          <Route path="/client/calendar" element={
            <ProtectedRoute roles={['client']}><ContentCalendar /></ProtectedRoute>
          } />
          {/* /client/concepts removed — concepts no longer exist */}
          <Route path="/client/request" element={
            <ProtectedRoute roles={['client']}><RequestPost /></ProtectedRoute>
          } />
          <Route path="/client/upload" element={
            <ProtectedRoute roles={['client']}><UploadFootage /></ProtectedRoute>
          } />

          {/* Shared */}
          <Route path="/videos" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor']}><VideoList /></ProtectedRoute>
          } />
          <Route path="/video/:id" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor', 'client']}><VideoReview /></ProtectedRoute>
          } />
          <Route path="/calendar" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor']}><CalendarPage /></ProtectedRoute>
          } />

          <Route path="/messages" element={
            <ProtectedRoute roles={['admin', 'creative', 'editor']}><Messages /></ProtectedRoute>
          } />
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
