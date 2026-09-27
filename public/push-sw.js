// Push handling, imported into the generated service worker (see vite.config.ts → workbox.importScripts).

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const scope = self.registration.scope
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Guldkorn ✨', {
        body: data.body || 'Dags att välja dina bästa bilder!',
        icon: scope + 'pwa-192x192.png',
        badge: scope + 'pwa-64x64.png',
        tag: 'guldkorn-reminder',
        data: { url: scope },
      }),
      // Red dot on the home-screen icon until the app is opened.
      self.navigator.setAppBadge ? self.navigator.setAppBadge(1).catch(() => {}) : null,
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => w.url.startsWith(self.registration.scope))
      return open ? open.focus() : self.clients.openWindow(url)
    })(),
  )
})
