// Firebase WEB config for push notifications (PWA — no APK needed).
// These values are PUBLIC client config (safe in the frontend / git) — they are
// NOT secrets. The secret part (service-account key) lives only in Apps Script
// Script Properties on the backend.
//
// HOW TO FILL THIS (one time, in the Firebase console for your project):
//   1. Project settings (gear) → General → "Your apps" → Add app → Web (</>) →
//      register app → copy the firebaseConfig values below.
//   2. Project settings → Cloud Messaging → "Web Push certificates" →
//      Generate key pair → copy the public key into VAPID_KEY below.
//
// Until these are filled, web push is simply disabled (the app still works).

export const firebaseConfig = {
  apiKey: 'REPLACE_API_KEY',
  authDomain: 'REPLACE_PROJECT_ID.firebaseapp.com',
  projectId: 'REPLACE_PROJECT_ID',
  storageBucket: 'REPLACE_PROJECT_ID.appspot.com',
  messagingSenderId: 'REPLACE_SENDER_ID',
  appId: 'REPLACE_APP_ID',
};

// Web Push certificate public key (VAPID) from Firebase → Cloud Messaging.
export const VAPID_KEY = 'REPLACE_VAPID_PUBLIC_KEY';

// True once the real values are in place (so we don't try to init with placeholders).
export const firebaseConfigured =
  !String(firebaseConfig.apiKey).startsWith('REPLACE_') &&
  !String(VAPID_KEY).startsWith('REPLACE_');
