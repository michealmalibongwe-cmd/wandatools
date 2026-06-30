/* WandaTools Service Worker — offline caching, push, background sync */

const CACHE_VERSION = 'v2.1';
const STATIC_CACHE  = `wanda-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `wanda-dynamic-${CACHE_VERSION}`;
const API_CACHE     = `wanda-api-${CACHE_VERSION}`;
const FONT_CACHE    = `wanda-fonts-${CACHE_VERSION}`;

const API_ORIGIN = 'https://wandatools.up.railway.app';

// All app shell assets — precached on install so the app works 100% offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/nav.js',
  '/pwa.js',
  '/manifest.json',
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

// ─── Install — precache app shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())   // activate immediately, no waiting
  );
});

// ─── Activate — prune old caches, claim clients ───────────────────────────────
self.addEventListener('activate', (event) => {
  const current = [STATIC_CACHE, DYNAMIC_CACHE, API_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(k => !current.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())  // take control of open pages immediately
  );
});

// ─── Fetch — routing strategies ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!url.protocol.startsWith('http')) return;
  if (request.method !== 'GET') return;

  // API calls — Network First (10 s timeout), cached fallback
  if (url.origin === API_ORIGIN) {
    event.respondWith(networkFirst(request, API_CACHE, 10_000));
    return;
  }

  // Google Fonts — Cache First (long TTL)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // Navigation — Cache First (serve app shell instantly), update in background
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((res) => {
          if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()));
          return res;
        }).catch(() => null);
        return cached || networkFetch || caches.match('/offline.html');
      })
    );
    return;
  }

  // Static assets (CSS, JS, images, fonts) — Cache First
  if (
    request.destination === 'style'  ||
    request.destination === 'script' ||
    request.destination === 'image'  ||
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
    if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request, cacheName, timeoutMs) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
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
  const cache        = await caches.open(cacheName);
  const cached       = await cache.match(request);
  const fetchPromise = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

// ─── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try   { data = event.data.json(); }
  catch { data = { title: 'WandaTools', body: event.data.text() }; }

  const options = {
    body:     data.body    || 'You have a new notification from WandaTools.',
    icon:     '/icons/icon.svg',
    badge:    '/icons/icon.svg',
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
          if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// ─── Background sync — replay queued offline requests via wandatools-db ──────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-requests') {
    event.waitUntil(replayPendingRequests());
  }
});

async function replayPendingRequests() {
  return new Promise((resolve) => {
    const dbReq = indexedDB.open('wandatools-db', 1);

    dbReq.onsuccess = async (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('offline_queue')) { resolve(); return; }

      const tx    = db.transaction('offline_queue', 'readwrite');
      const store = tx.objectStore('offline_queue');
      const all   = store.getAll();

      all.onsuccess = async () => {
        for (const item of all.result) {
          try {
            const res = await fetch(item.url, {
              method:  item.method,
              headers: item.headers,
              body:    item.body,
            });
            if (res.ok) store.delete(item.id);
          } catch {
            // Will retry on next sync event
          }
        }
        const clientList = await clients.matchAll({ type: 'window' });
        clientList.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE' }));
        resolve();
      };

      all.onerror = () => resolve();
    };

    dbReq.onerror = () => resolve();
  });
}
