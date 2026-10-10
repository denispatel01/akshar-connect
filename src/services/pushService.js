// Push notifications. Two paths, same backend:
//   • Native app (Capacitor/Android APK) → @capacitor/push-notifications → FCM token.
//   • Web / PWA (Android, desktop, iOS 16.4+ installed to Home Screen) → Firebase
//     JS SDK → FCM token.
// Either way the device's FCM token goes to the backend, which sends via FCM HTTP v1.
import { Capacitor } from '@capacitor/core';
import { dataService } from './dataService';
import { firebaseConfig, VAPID_KEY, firebaseConfigured } from './firebaseConfig';

let started = false;

export async function initPush(user) {
  if (started) return;
  started = true;
  try {
    if (Capacitor?.isNativePlatform?.()) await initNativePush(user);
    else await initWebPush(user);
  } catch (e) {
    console.warn('initPush failed', e);
    started = false; // allow a retry on the next login
  }
}

// ── Web / PWA push via Firebase Cloud Messaging ──────────────────────────────
async function initWebPush(user) {
  if (!firebaseConfigured) return;                 // not set up yet — stay silent
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const { isSupported, getMessaging, getToken, onMessage } = await import('firebase/messaging');
  if (!(await isSupported())) return;              // e.g. iOS Safari not installed as PWA

  // Ask permission (must be triggered by the app after login).
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return;

  const { initializeApp, getApps } = await import('firebase/app');
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

  // Dedicated SW for background messages (separate from the PWA cache SW).
  const swReg = await navigator.serviceWorker.register(
    (import.meta.env.BASE_URL || '/') + 'firebase-messaging-sw.js'
  );

  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  if (token) {
    await dataService.registerPushToken({
      token,
      devoteeId: user?.devoteeId || '',
      mobile: user?.mobile || '',
      name: user?.name || '',
      platform: 'web',
    });
  }

  // Foreground message (app open): refresh the bell and let the UI react.
  onMessage(messaging, (payload) => {
    try { dataService.getAnnouncements(); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('ac-push-received', { detail: payload })); } catch (e) {}
  });
}

// ── Native app push via Capacitor ────────────────────────────────────────────
async function initNativePush(user) {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return;

  PushNotifications.addListener('registration', (tok) => {
    dataService.registerPushToken({
      token: tok.value,
      devoteeId: user?.devoteeId || '',
      mobile: user?.mobile || '',
      name: user?.name || '',
      platform: Capacitor.getPlatform(),
    });
  });
  PushNotifications.addListener('registrationError', (err) => console.warn('push registration error', err));
  PushNotifications.addListener('pushNotificationReceived', (notif) => {
    try { dataService.getAnnouncements(); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('ac-push-received', { detail: notif })); } catch (e) {}
  });
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    try { window.dispatchEvent(new CustomEvent('ac-push-opened', { detail: action })); } catch (e) {}
  });
  await PushNotifications.register();
}
