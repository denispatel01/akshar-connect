import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'sweetalert2/dist/sweetalert2.min.css'
import App from './App.jsx'
import { dataService } from './services/dataService'
import { ghariService } from './services/ghariService'
import { busService } from './services/busService'

// Stale-deployment recovery: when a lazily-loaded chunk can't be fetched
// (a newer build replaced it), reload once to pick up the fresh build.
window.addEventListener('vite:preloadError', (e) => {
  try {
    dataService.reportError({ message: 'vite:preloadError — ' + (e?.payload?.message || 'dynamic import failed'), page: location.href });
    if (!sessionStorage.getItem('ac-preload-reloaded')) {
      sessionStorage.setItem('ac-preload-reloaded', '1');
      e.preventDefault();
      location.reload();
    }
  } catch (_) {}
});

// Global safety net: email the admin on any uncaught error / promise rejection.
// A bare "Script error." with no stack is the browser's opaque cross-origin error
// (details hidden for scripts without CORS) — so capture whatever context IS
// available (source file, line/col, and the full page URL) to make it diagnosable.
window.addEventListener('error', (e) => {
  // The same 'error' event fires for BOTH uncaught JS exceptions and failed
  // resource loads (an <img>/<script>/<link> that 404s or is blocked). They need
  // different handling: a resource error has no message but DOES name the element
  // and its URL, while a JS error has a message but — when cross-origin — hides
  // everything as a bare "Script error." Capture whichever context exists.
  const tgt = e?.target;
  const isResource = tgt && tgt !== window && (tgt.src || tgt.href);
  if (isResource) {
    dataService.reportError({
      message: `Resource failed to load: <${(tgt.tagName || '?').toLowerCase()}>`,
      stack: `url: ${tgt.src || tgt.href}`,
      page: location.href,
    });
    return;
  }
  const loc = [e?.filename, e?.lineno, e?.colno].filter(Boolean).join(':');
  // A message of exactly "Script error." with no file/line is the browser's
  // opaque cross-origin error — flag it so the admin knows WHY it has no stack.
  const opaque = !loc && /^script error\.?$/i.test(String(e?.message || '').trim());
  const msg = (e?.message || 'Unknown error') + (loc ? ` @ ${loc}` : '')
    + (opaque ? ' (opaque cross-origin error — thrown by a 3rd-party/injected script or an uninstrumented chunk; no stack available)' : '');
  dataService.reportError({
    message: msg,
    stack: e?.error?.stack || (loc ? `at ${loc}` : ''),
    page: location.href,
  });
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e?.reason;
  dataService.reportError({
    message: r?.message || String(r),
    stack: r?.stack || '',
    page: location.href,
  });
});

const root = createRoot(document.getElementById('root'))

// 1) Load cached / bundled data synchronously so the app shows instantly —
//    no blocking network wait, no re-login (the session is read from storage).
dataService.hydrateSync()

// 2) Render the app right away.
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Tell the index.html failsafe the app mounted, so it never force-reloads a
// working app (the failsafe only fires if this never runs — e.g. a stale cached
// index.html pointed at a chunk that 404'd after a deploy).
try { window.__acMounted = true; clearTimeout(window.__acRecover); } catch { /* ignore */ }

// 3) Fade out the branded splash (declared in index.html) once we've mounted.
function hideSplash() {
  try { clearTimeout(window.__acSplashTimer) } catch { /* ignore */ }
  const el = document.getElementById('ac-splash')
  if (!el) return
  // If it never became visible (fast load), just remove it — no fade, no flash.
  if (!el.classList.contains('ac-show')) { el.remove(); return }
  el.classList.add('ac-hide')
  setTimeout(() => el.remove(), 450)
}
requestAnimationFrame(() => requestAnimationFrame(hideSplash))

// 4) Refresh from the live backend in the background; tell the app when fresh
//    data has arrived so it can re-read without a full reload.
dataService.bootstrap()
  .then(() => window.dispatchEvent(new Event('ac-data-refreshed')))
  .catch(() => {})

// Drain any Ghari Seva orders saved offline in a previous session as soon as the
// app loads, even before the admin opens that page — this is money, so pending
// writes must reach the cloud at the first opportunity.
try { ghariService.init() } catch { /* non-fatal */ }
try { busService.init() } catch { /* non-fatal */ }

// Register the service worker for PWA / offline support, with automatic
// update-and-reload so users always get the latest code without a manual
// "Empty Cache & Hard Reload".
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        // When an updated worker finishes installing, activate it immediately.
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
        // Check for a new build now and whenever the app regains focus.
        reg.update().catch(() => {})
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        })
      })
      .catch(() => {})

    // The new worker took control → reload ONCE to swap in the new code. Loop guard
    // is TIME-based (not once-per-session): at most one auto-reload per 15s. This
    // still makes a churning worker harmless (loops fire within ~1s) but — unlike the
    // old persistent per-session flag — lets a long-lived installed PWA pick up a
    // LATER deploy in the same session instead of being stuck on a stale bundle.
    let reloadedThisLoad = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedThisLoad) return
      let last = 0
      try { last = Number(sessionStorage.getItem('ac-sw-reload-ts') || '0') } catch (e) {}
      if (Date.now() - last < 15000) return // another reload just happened → avoid a loop
      reloadedThisLoad = true
      try { sessionStorage.setItem('ac-sw-reload-ts', String(Date.now())) } catch (e) {}
      window.location.reload()
    })
  })
}
