import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'sweetalert2/dist/sweetalert2.min.css'
import App from './App.jsx'
import { dataService } from './services/dataService'
import { ghariService } from './services/ghariService'

// Stale-deployment recovery: when a lazily-loaded chunk can't be fetched
// (a newer build replaced it), reload once to pick up the fresh build.
window.addEventListener('vite:preloadError', (e) => {
  try {
    dataService.reportError({ message: 'vite:preloadError — ' + (e?.payload?.message || 'dynamic import failed'), page: location.hash });
    if (!sessionStorage.getItem('ac-preload-reloaded')) {
      sessionStorage.setItem('ac-preload-reloaded', '1');
      e.preventDefault();
      location.reload();
    }
  } catch (_) {}
});

// Global safety net: email the admin on any uncaught error / promise rejection.
window.addEventListener('error', (e) => {
  dataService.reportError({ message: e?.message, stack: e?.error?.stack, page: location.hash });
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e?.reason;
  dataService.reportError({ message: r?.message || String(r), stack: r?.stack, page: location.hash });
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

    // The new worker took control → reload once to swap in the new code.
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  })
}
