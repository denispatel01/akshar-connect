// Push notifications. Two paths, same backend:
//   • Native app (Capacitor/Android APK) → @capacitor/push-notifications → FCM token.
//   • Web / PWA (Android, desktop, iOS 16.4+ installed to Home Screen) → Firebase
//     JS SDK → FCM token.
// Either way the device's FCM token goes to the backend, which sends via FCM HTTP v1.
import { Capacitor } from '@capacitor/core';
import { dataService } from './dataService';
import { firebaseConfig, VAPID_KEY, firebaseConfigured } from './firebaseConfig';

let autoStarted = false;

// Auto-attempt on login/launch. On Android/desktop this silently registers if
// permission is already granted. On iOS the OS ignores a non-gesture permission
// request, so iPhone users enable via the button (enablePush) instead.
export async function initPush(user) {
  if (autoStarted) return;
  autoStarted = true;
  try {
    if (Capacitor?.isNativePlatform?.()) { await initNativePush(user); return; }
    // Web: only auto-register if the user already granted permission before (no prompt).
    if (firebaseConfigured && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await registerWebPush(user);
    }
  } catch (e) { console.warn('initPush failed', e); }
}

// Tap-triggered enable — call this from a BUTTON click (required by iOS to show
// the permission prompt). Returns a status string for UI feedback.
export async function enablePush(user) {
  try {
    if (Capacitor?.isNativePlatform?.()) { await initNativePush(user); return 'granted'; }
    if (!firebaseConfigured) return 'unconfigured';
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) return 'unsupported';
    const { isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return 'unsupported'; // e.g. iOS Safari tab not installed as PWA
    let perm = Notification.permission;
    if (perm !== 'granted') perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'dismissed';
    const ok = await registerWebPush(user);
    return ok ? 'granted' : 'error';
  } catch (e) { console.warn('enablePush failed', e); return 'error'; }
}

// Current permission state for UI ('granted' | 'denied' | 'default' | 'unsupported').
export function pushPermission() {
  try { return ('Notification' in window) ? Notification.permission : 'unsupported'; }
  catch { return 'unsupported'; }
}

// ── Web / PWA push via Firebase Cloud Messaging ──────────────────────────────
async function registerWebPush(user) {
  if (!firebaseConfigured) return false;
  const { getMessaging, getToken, onMessage } = await import('firebase/messaging');
  const { initializeApp, getApps } = await import('firebase/app');
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  // Register on a DEDICATED scope so it never collides with the app's main sw.js
  // (two SWs on the same scope evict each other → controllerchange → reload loop).
  const base = import.meta.env.BASE_URL || '/';
  const pushScope = base + 'firebase-cloud-messaging-push-scope';
  // Clean up any earlier Firebase SW registered at the WRONG (main) scope, which is
  // what caused the reload loop before this fix.
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = (r.active || r.waiting || r.installing || {}).scriptURL || '';
      if (url.includes('firebase-messaging-sw') && r.scope.indexOf(pushScope) === -1) {
        await r.unregister();
      }
    }
  } catch (e) {}
  const swReg = await navigator.serviceWorker.register(base + 'firebase-messaging-sw.js', { scope: pushScope });
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  if (!token) return false;
  await dataService.registerPushToken({
    token, devoteeId: user?.devoteeId || '', mobile: user?.mobile || '', name: user?.name || '', platform: 'web',
  });
  onMessage(messaging, (payload) => {
    try { dataService.getAnnouncements(); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('ac-push-received', { detail: payload })); } catch (e) {}
  });
  return true;
}

// ── Native app push via Capacitor ────────────────────────────────────────────
async function initNativePush(user) {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;
  PushNotifications.addListener('registration', (tok) => {
    dataService.registerPushToken({
      token: tok.value, devoteeId: user?.devoteeId || '', mobile: user?.mobile || '', name: user?.name || '', platform: Capacitor.getPlatform(),
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
