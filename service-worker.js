/**
 * The Pilgrim's Interlinear — Service Worker
 * Caches the app shell for offline use.
 * Bible data JSON files are cached on first load and served from cache thereafter.
 */

const CACHE_NAME = 'jammin-interlinear-v42';
const DATA_CACHE  = 'jammin-data-v42';

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

  // App shell → stale-while-revalidate: serve cache instantly, fetch update in background
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (!response.ok) return response;

          // Compare ETags / last-modified to decide if content actually changed
          const cachedEtag    = cached && cached.headers.get('etag');
          const networkEtag   = response.headers.get('etag');
          const cachedDate    = cached && cached.headers.get('last-modified');
          const networkDate   = response.headers.get('last-modified');

          const changed = !cached
            || (networkEtag  && networkEtag  !== cachedEtag)
            || (networkDate  && networkDate  !== cachedDate)
            || (!networkEtag && !networkDate && !cached); // no headers → assume changed if no cache

          if (changed) {
            cache.put(event.request, response.clone());
            // Notify all open tabs that a new version is ready
            self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
              .then(clients => clients.forEach(c => c.postMessage({ type: 'UPDATE_AVAILABLE' })));
          }
          return response;
        }).catch(() => cached);

        return cached || networkFetch;
      })
    )
  );
});
