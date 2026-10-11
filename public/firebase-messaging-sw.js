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

// Pushes are sent DATA-ONLY (no `notification` block), so the browser does NOT
// auto-display one on top of ours — we show exactly one here. Title/body/link all
// come from payload.data.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'Akshar Connect', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { link: d.link || APP_URL, type: d.type || '' },
  });
});

// Tapping the notification opens the deep-linked section (Vato/Feed/…). If the app
// is already open, navigate that window to the link; otherwise open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.link) || APP_URL;
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      try { await w.navigate(url); } catch (e) { /* cross-doc nav may be blocked */ }
      if ('focus' in w) return w.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
