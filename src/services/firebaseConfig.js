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
  apiKey: 'AIzaSyClXbb0FSSUx1oi5g34l0hZqlSwm8ZPR78',
  authDomain: 'akshar-connect-625b6.firebaseapp.com',
  projectId: 'akshar-connect-625b6',
  storageBucket: 'akshar-connect-625b6.firebasestorage.app',
  messagingSenderId: '25605823162',
  appId: '1:25605823162:web:09f4fe30b0b8800544c083',
};

// Web Push certificate public key (VAPID) from Firebase → Cloud Messaging.
export const VAPID_KEY = 'BOc2FohlX4bNHHg5DlVelQUGRsODpOhV4GQctRFzrM9LJEu5wQU1C_iCd9DacrcfTPpSdQxoE7T47TMy86kPM3g';

// True once the real values are in place (so we don't try to init with placeholders).
export const firebaseConfigured =
  !String(firebaseConfig.apiKey).startsWith('REPLACE_') &&
  !String(VAPID_KEY).startsWith('REPLACE_');
