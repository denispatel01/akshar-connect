import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'sweetalert2/dist/sweetalert2.min.css'
import App from './App.jsx'
import { dataService } from './services/dataService'

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
  const el = document.getElementById('ac-splash')
  if (!el) return
  el.classList.add('ac-hide')
  setTimeout(() => el.remove(), 450)
}
requestAnimationFrame(() => requestAnimationFrame(hideSplash))

// 4) Refresh from the live backend in the background; tell the app when fresh
//    data has arrived so it can re-read without a full reload.
dataService.bootstrap()
  .then(() => window.dispatchEvent(new Event('ac-data-refreshed')))
  .catch(() => {})

// Register the service worker for PWA / offline support.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => {})
  })
}
