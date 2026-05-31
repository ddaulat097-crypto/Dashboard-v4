// Core Trading Hub — Service Worker
// Strategy: NETWORK-FIRST for the app shell (HTML/JS) so a new deploy is picked up
// immediately, with cache fallback only when offline. This fixes the "installed PWA
// shows an old version" problem caused by the previous cache-first strategy.
const CACHE = 'cth-v84-sw-networkfirst';

self.addEventListener('install', (e) => {
  // Activate this new worker right away instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Delete every old cache so stale shells can't survive an update.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Only handle same-origin GET requests; let the app's own code handle the
  // OANDA worker / cross-origin data fetches normally.
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // NETWORK FIRST — always try to get the freshest file.
      const resp = await fetch(e.request);
      if (resp && resp.ok) {
        cache.put(e.request, resp.clone());
      }
      return resp;
    } catch (err) {
      // Offline / network failed — fall back to cache, then to the app root.
      const cached = await cache.match(e.request);
      if (cached) return cached;
      const root = await cache.match('./') || await cache.match('./index.html');
      if (root) return root;
      throw err;
    }
  })());
});

// Notification click — focus the open PWA or open a new window to root.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
