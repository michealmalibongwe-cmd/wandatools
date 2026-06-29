/* WandaTools Service Worker — PWA offline support, caching, push & background sync */

const CACHE_VERSION = 'v1.0';
const STATIC_CACHE  = `wanda-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `wanda-dynamic-${CACHE_VERSION}`;
const API_CACHE     = `wanda-api-${CACHE_VERSION}`;
const FONT_CACHE    = `wanda-fonts-${CACHE_VERSION}`;

const API_ORIGIN = 'https://wandatools.up.railway.app';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/nav.js',
  '/pwa.js',
  '/offline.html',
  '/signup.html',
  '/tools.html',
  '/wandaAI.html',
  '/features.html',
  '/community.html',
  '/contact.html',
  '/profile.html',
  '/verify-email.html',
  '/forget-password.html',
  '/icons/icon.svg',
];

// ─── Install — precache static shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate — prune old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, API_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !currentCaches.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch — routing strategies ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle http/https
  if (!url.protocol.startsWith('http')) return;

  // Skip non-GET (mutations are queued in IndexedDB by pwa.js)
  if (request.method !== 'GET') return;

  // API calls — Network First (10 s timeout), fall back to cache
  if (url.origin === API_ORIGIN) {
    event.respondWith(networkFirst(request, API_CACHE, 10_000));
    return;
  }

  // Google Fonts — Cache First (long TTL)
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // Navigation — Network First, offline.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Static assets (CSS, JS, images, SVG) — Cache First
  if (
    request.destination === 'style'   ||
    request.destination === 'script'  ||
    request.destination === 'image'   ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Everything else — Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

// ─── Strategy helpers ─────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request, cacheName, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    clearTimeout(timer);
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Offline', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

// ─── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: 'WandaTools', body: event.data.text() }; }

  const options = {
    body:     data.body    || 'You have a new notification from WandaTools.',
    icon:     '/icons/icon-192.png',
    badge:    '/icons/icon-192.png',
    vibrate:  [200, 100, 200],
    data:     { url: data.url || '/' },
    tag:      data.tag     || 'wandatools-notification',
    renotify: true,
    actions: [
      { action: 'open',  title: 'Open App' },
      { action: 'close', title: 'Dismiss'  },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'WandaTools', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// ─── Background sync — replay queued offline requests ─────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-requests') {
    event.waitUntil(replayPendingRequests());
  }
});

async function replayPendingRequests() {
  return new Promise((resolve) => {
    const dbReq = indexedDB.open('wanda-offline-db', 1);

    dbReq.onsuccess = async (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending-requests')) { resolve(); return; }

      const tx    = db.transaction('pending-requests', 'readwrite');
      const store = tx.objectStore('pending-requests');
      const all   = store.getAll();

      all.onsuccess = async () => {
        for (const item of all.result) {
          try {
            const res = await fetch(item.url, {
              method:  item.method,
              headers: item.headers,
              body:    item.body,
            });
            if (res.ok) {
              // Remove successfully replayed request
              store.delete(item.id);
            }
          } catch {
            // Will retry on next sync event
          }
        }
        // Notify all open windows that sync is complete
        const clientList = await clients.matchAll({ type: 'window' });
        clientList.forEach((c) =>
          c.postMessage({ type: 'SYNC_COMPLETE' })
        );
        resolve();
      };

      all.onerror = () => resolve();
    };

    dbReq.onerror = () => resolve();
  });
}
