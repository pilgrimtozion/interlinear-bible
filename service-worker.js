/**
 * Berean Interlinear Bible — Service Worker
 * Caches the app shell for offline use.
 * Bible data JSON files are cached on first load and served from cache thereafter.
 */

const CACHE_NAME = 'jammin-interlinear-v20';
const DATA_CACHE  = 'jammin-data-v20';

// App shell — files that must be cached immediately on install
const SHELL_FILES = [
  '/interlinear-bible/interlinear_bible.html',
  '/interlinear-bible/manifest.json',
];

// ── Install: cache the app shell ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache, fall back to network ────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bible data JSON files → cache-first with network update
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached); // offline fallback
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // App shell → cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache same-origin successful responses
        if (response.ok && url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/interlinear-bible/interlinear_bible.html');
        }
      });
    })
  );
});
