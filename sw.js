/* Akshar Connect service worker — simple, safe offline support */
const BUILD_ID = '1793299333571'; // replaced at build time so each deploy ships a new SW
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
  // NOTE: we deliberately do NOT call self.skipWaiting() here. A freshly-installed
  // worker stays in "waiting" until the PAGE asks it to activate (the SKIP_WAITING
  // message above), so a new deploy never reloads the app out from under the user
  // mid-task. The in-app "New version — Refresh now / Later" prompt triggers it.
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

  // Stale-while-revalidate for navigation (the app shell / index.html). Serve the
  // CACHED shell instantly so a cold open isn't blocked on a network round-trip to
  // GitHub Pages — this is the #1 cause of a multi-second blank screen on startup —
  // then refresh the cached shell in the background for next time. Staying fresh is
  // still guaranteed: each deploy stamps a new BUILD_ID → a new SW + cache name, and
  // the page auto-reloads once when that new worker activates (see main.jsx), so a
  // new build is always picked up; the cached shell only ever serves the SAME build's
  // index (whose hashed JS chunks are themselves cached), never a cross-build mix.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = (await caches.match(request)) || (await caches.match(BASE));
        // Kick off a background refresh so the next open has the latest shell.
        const fresh = fetch(request, { cache: 'no-store' })
          .then((response) => {
            try { caches.open(CACHE_NAME).then((c) => c.put(request, response.clone())); } catch (err) { /* ignore */ }
            return response;
          })
          .catch(() => null);
        // Instant when cached; first-ever visit (no cache) waits for the network.
        return cached || (await fresh) || Response.error();
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
