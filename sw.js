// Core Trading Hub — Service Worker
// NETWORK-FIRST for the app shell so new deploys are picked up immediately,
// with cache fallback only when offline.
const CACHE = 'cth-v264-shadow-flip-heatmap';

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await fetch(e.request);
      if (resp && resp.ok) cache.put(e.request, resp.clone());
      return resp;
    } catch (err) {
      const cached = await cache.match(e.request);
      if (cached) return cached;
      const root = await cache.match('./') || await cache.match('./index.html');
      if (root) return root;
      throw err;
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
