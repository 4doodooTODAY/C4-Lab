self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  const { title = 'C4 Lab', body = '', url = '/', icon = '/favicon.ico' } = data
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/favicon.ico',
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
