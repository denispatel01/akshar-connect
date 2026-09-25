/* Akshar Connect service worker — simple, safe offline support */
const BUILD_ID = '1790352546316'; // replaced at build time so each deploy ships a new SW
const CACHE_NAME = 'akshar-connect-' + BUILD_ID;
const BASE = self.location.pathname.replace(/sw\.js$/, ''); // e.g. /akshar-connect/
const STATIC_ASSETS = [
  BASE,
  BASE + 'manifest.webmanifest',
  BASE + 'favicon.svg',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'icons/icon-maskable-192.png',
  BASE + 'icons/icon-maskable-512.png',
  BASE + 'icons/apple-touch-icon.png',
  BASE + 'icons/favicon-32.png',
];

// Let the page trigger an immediate activation of a freshly-installed SW.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(STATIC_ASSETS);
      } catch (err) {
        // Never fail install if precaching fails
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        );
      } catch (err) {
        // ignore cleanup errors
      }
      await self.clients.claim();
    })()
  );
});

function isBackendRequest(url) {
  return url.includes('script.google.com') || url.includes('/exec');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = request.url;

  // Never cache / intercept backend API calls — always go to network
  if (isBackendRequest(url)) return;

  // Network-first for navigation requests, with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          try {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
          } catch (err) {
            // ignore cache write errors
          }
          return response;
        } catch (err) {
          const cached = await caches.match(request);
          return cached || (await caches.match(BASE)) || Response.error();
        }
      })()
    );
    return;
  }

  // Cache-first for same-origin static assets
  if (new URL(url).origin === self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          const cached = await caches.match(request);
          if (cached) return cached;
          const response = await fetch(request);
          try {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
          } catch (err) {
            // ignore cache write errors
          }
          return response;
        } catch (err) {
          const cached = await caches.match(request);
          return cached || Response.error();
        }
      })()
    );
  }
});
