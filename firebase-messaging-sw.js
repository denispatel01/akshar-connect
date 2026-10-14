/* Firebase Cloud Messaging service worker — handles PUSH when the PWA is in the
 * background or closed. This file is served at the site root and runs on its own,
 * so it cannot import src config — keep the config below IN SYNC with
 * src/services/firebaseConfig.js (same PUBLIC values, no secrets).
 */
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyClXbb0FSSUx1oi5g34l0hZqlSwm8ZPR78',
  authDomain: 'akshar-connect-625b6.firebaseapp.com',
  projectId: 'akshar-connect-625b6',
  storageBucket: 'akshar-connect-625b6.firebasestorage.app',
  messagingSenderId: '25605823162',
  appId: '1:25605823162:web:09f4fe30b0b8800544c083',
});

const messaging = firebase.messaging();
const APP_URL = 'https://denispatel01.github.io/akshar-connect/';
// Backend endpoint — must match src/services/dataService.js API_URL. Used to report
// a notification tap (which devotee opened which notification).
const API_URL = 'https://script.google.com/macros/s/AKfycbw-LyYduU1mUaXwamTGPyh_TtP6pZkO3pTCPPGKMQOhUwJhFa_Z4wFzz83FYXnq9YqAnA/exec';

// Tell the backend this device tapped the notification (best-effort).
function reportClick(nid, rid) {
  if (!nid) return Promise.resolve();
  const url = API_URL + '?action=pushClicked&nid=' + encodeURIComponent(nid) + '&rid=' + encodeURIComponent(rid || '');
  return fetch(url, { method: 'GET', keepalive: true, mode: 'no-cors' }).catch(() => {});
}

// Pull the deep-link page (?n=vato|feed|…) out of a link so we can both navigate
// to it AND stash it for iOS (see below).
function pageFromLink(link) {
  try { return new URL(link, APP_URL).searchParams.get('n') || ''; } catch (e) { return ''; }
}

// iOS drops the notificationclick target URL when the PWA was killed — it just
// reopens the app at its manifest start_url, losing ?n=. So we also persist the
// pending page to the Cache API (shared same-origin storage the SW can write and
// the freshly-launched app reads on boot — see App.jsx). TTL guards staleness.
async function stashPending(page) {
  if (!page) return;
  try {
    const cache = await caches.open('ac-deeplink');
    await cache.put('pending', new Response(JSON.stringify({ page, ts: Date.now() }),
      { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) { /* best effort */ }
}

// Pushes are sent DATA-ONLY (no `notification` block), so the browser does NOT
// auto-display one on top of ours — we show exactly one here. Title/body/link all
// come from payload.data.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'Akshar Connect', {
    body: d.body || '',
    icon: APP_URL + 'icons/icon-192.png',
    badge: APP_URL + 'icons/icon-192.png',
    // nid/rid let the click handler report who opened which notification.
    data: { link: d.link || APP_URL, type: d.type || '', nid: d.nid || '', rid: d.rid || '' },
  });
});

// Tapping the notification opens the deep-linked section (Vato/Feed/…). If the app
// is already open, navigate that window; otherwise open a new one. On iOS where the
// target URL is ignored, the stashed page (read by the app on boot) routes instead.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const nd = event.notification.data || {};
  const url = nd.link || APP_URL;
  const page = pageFromLink(url);
  event.waitUntil((async () => {
    await reportClick(nd.nid, nd.rid);
    await stashPending(page);
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      // navigate() BEFORE focus() — on some platforms a focus()-first window
      // refuses the later navigate() and stays on its current page.
      try { await w.navigate(url); } catch (e) { /* cross-doc nav may be blocked */ }
      if ('focus' in w) { try { return await w.focus(); } catch (e) { /* ignore */ } }
    }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
