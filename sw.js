// Core Trading Hub — Service Worker
// Standalone sw.js (not blob-based) for reliable notifications + PWA install.
const CACHE = 'cth-v35-alertengine';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only handle same-origin requests; let API/cross-origin pass through
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(e.request).then(r => r || fetch(e.request).then(resp => {
          if (resp.ok) c.put(e.request, resp.clone());
          return resp;
        }).catch(() => c.match('./index.html')))
      )
    );
  }
});

// Notification click — focus existing PWA window or open a new one
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
