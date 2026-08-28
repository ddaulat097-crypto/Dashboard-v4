// Core Trading Hub — Service Worker
// NETWORK-FIRST for the app shell so new deploys are picked up immediately,
// with cache fallback only when offline.
const CACHE = 'cth-v447-engine-majority';

// v378 — known-immutable static CDN assets (charting library, Google Fonts)
// get cache-first-with-background-refresh instead of no caching at all.
// Both were previously excluded entirely by the same-origin-only check
// below, meaning every single load re-fetched them from scratch — real,
// avoidable latency on a resource that essentially never changes (the
// charting library URL is version-pinned; Google's font URLs are stable
// unless the font list in index.html itself changes).
//
// Deliberately an ALLOWLIST of specific hostnames, not a blanket
// cross-origin cache — this can never accidentally cache a live API call
// to the OANDA/Tradier proxy worker (a different, unknown-to-this-file
// domain per deployment). Anything not explicitly listed here falls
// through to the existing untouched behavior.
const STATIC_CDN_HOSTS = new Set(['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (STATIC_CDN_HOSTS.has(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(e.request);
      if (cached) {
        // Serve the cached copy immediately (fast repeat loads), and
        // refresh it in the background so a genuine change (e.g. a
        // deliberate version bump in index.html's <script src>) is picked
        // up by the NEXT load without ever blocking THIS one.
        e.waitUntil((async () => {
          try {
            const fresh = await fetch(e.request);
            if (fresh && fresh.ok) await cache.put(e.request, fresh.clone());
          } catch (err) { /* offline or CDN hiccup — cached copy already served, nothing more to do */ }
        })());
        return cached;
      }
      // Nothing cached yet — fetch fresh, cache it for next time, serve it.
      const fresh = await fetch(e.request);
      if (fresh && fresh.ok) cache.put(e.request, fresh.clone());
      return fresh;
    })());
    return;
  }

  if (url.origin !== location.origin) return;
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

// v389 — handles a REAL remote push arriving, independent of whether the
// app is open at all. Different from the existing local M4 alerts (which
// call showNotification() directly from running client code) — this
// fires from an actual Push API event, which can wake the service worker
// even from a fully closed app. Matches the existing local alerts'
// styling conventions (icon/badge/vibrate) for visual consistency; reuses
// the notificationclick handler below unchanged since it already does
// the right thing (focus an open tab, or open a new one).
self.addEventListener('push', (e) => {
  let data = { title: 'CTH', body: 'New notification' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (err) { /* fall back to the default text above */ }
  const opts = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'cth-push',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data,
    // v401 — was previously silently dropped: opts never included
    // actions at all, so a server-sent actions array (even if correctly
    // received) would never actually render as buttons on the
    // notification. This is what makes them visible.
    actions: Array.isArray(data.actions) ? data.actions : undefined,
  };
  e.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // v401 — a real action-button response ("Took it" / "Skipped"),
  // distinct from a plain tap on the notification body. Sent directly to
  // the worker so it can be recorded against the real signal, without
  // necessarily opening the app for what's meant to be a quick,
  // lock-screen-level response.
  if (e.action === 'taken' || e.action === 'skipped') {
    const signalTs = e.notification.data?.signalTs;
    const workerOrigin = e.notification.data?.workerOrigin;
    if (signalTs != null && workerOrigin) {
      e.waitUntil(
        fetch(`${workerOrigin}/push/mark-response`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signalTs, response: e.action }),
        }).catch(() => { /* best-effort — a failed response-recording must never break notification handling */ })
      );
    }
    return; // action button handled — don't also focus/open the app below
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

