const CACHE_NAME = 'malerprofis-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/logo.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // We only cache GET requests
  if (req.method !== 'GET') {
    return;
  }

  // Handle API Requests: Network first, then fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(req).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If offline and not in cache, return a friendly JSON error
            return new Response(JSON.stringify({ error: "Offline - Daten konnten nicht geladen werden." }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
  } else {
    // Handle Static Assets: Stale-While-Revalidate / Cache-First
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) {
          // Fetch updated version in the background
          fetch(req).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(req).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        }).catch(() => {
          // Offline fallback for html requests
          if (req.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
        });
      })
    );
  }
});
