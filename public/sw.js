// C4C Lab service worker.
//
// Two jobs:
//   1. Push notifications (unchanged, web only).
//   2. Caching so the app installs to the home screen and opens instantly.
//
// Caching rules are deliberately conservative:
//   - HTML/navigation: NETWORK FIRST, so a new deploy is never served stale.
//     Falls back to the cached shell only when offline.
//   - Hashed build assets (/assets/*): cache first. Safe because the filename
//     changes on every build, so a cached file is never the wrong version.
//   - Icons, brand art, fonts: cache first.
//   - Everything else (Supabase auth/data/functions, R2 media, any other
//     origin): NOT cached. Passed straight to the network. Caching app data or
//     large video would serve stale content and blow up storage.

const VERSION    = 'v3'
const SHELL      = `c4c-shell-${VERSION}`
const ASSETS     = `c4c-assets-${VERSION}`
const OFFLINE_URL = '/'

// ── Install: pre-cache the app shell so the first offline open works ────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([OFFLINE_URL, '/manifest.webmanifest']))
      .catch(() => {})           // never block install on a cache miss
      .then(() => self.skipWaiting())
  )
})

// ── Activate: drop caches from older versions ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('c4c-') && k !== SHELL && k !== ASSETS)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

const isHashedAsset = (url) => url.pathname.startsWith('/assets/')
const isStaticArt   = (url) =>
  url.pathname.startsWith('/icons/') ||
  url.pathname.startsWith('/brand/') ||
  url.pathname.startsWith('/fonts/')

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try { url = new URL(request.url) } catch { return }

  // Only ever touch our own origin. Supabase and R2 go straight to the network.
  if (url.origin !== self.location.origin) return

  // Navigation: network first so deploys land immediately; cache is the
  // offline safety net.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put(OFFLINE_URL, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    )
    return
  }

  // Content-hashed assets and static art: serve from cache, fill on first use.
  if (isHashedAsset(url) || isStaticArt(url)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit
        return fetch(request).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(ASSETS).then((c) => c.put(request, copy)).catch(() => {})
          }
          return res
        })
      })
    )
  }
  // Anything else: default network handling.
})

// ── Push notifications (web only; iOS webview does not use this) ────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  const { title = 'C4C Lab', body = '', url = '/', icon = '/icons/icon-192.png' } = data
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icons/icon-192.png',
      data: { url },
      vibrate: [100, 50, 100],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
