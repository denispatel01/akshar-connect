/* Firebase Cloud Messaging service worker — handles PUSH when the PWA is in the
 * background or closed. This file is served at the site root and runs on its own,
 * so it cannot import src config — keep the config below IN SYNC with
 * src/services/firebaseConfig.js (same PUBLIC values, no secrets).
 */
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'REPLACE_API_KEY',
  authDomain: 'REPLACE_PROJECT_ID.firebaseapp.com',
  projectId: 'REPLACE_PROJECT_ID',
  storageBucket: 'REPLACE_PROJECT_ID.appspot.com',
  messagingSenderId: 'REPLACE_SENDER_ID',
  appId: 'REPLACE_APP_ID',
});

const messaging = firebase.messaging();

// Show the notification when a push arrives in the background.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'Akshar Connect', {
    body: n.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || {},
  });
});

// Focus/open the app when the user taps the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) return w.focus(); }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
