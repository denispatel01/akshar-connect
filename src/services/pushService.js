// Push notifications on the native (Capacitor/Android) app.
// On the web this is a no-op — FCM push requires the installed app. The flow:
//   1. ask permission, 2. register with APNs/FCM, 3. send the device token to the
//   backend tied to the logged-in user, 4. react to incoming pushes.
import { Capacitor } from '@capacitor/core';
import { dataService } from './dataService';

let started = false;

// Call after login so the token is tied to the right person.
export async function initPush(user) {
  if (started) return;
  if (!Capacitor?.isNativePlatform?.()) return; // web / PWA — skip
  started = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    // Token arrives asynchronously after register().
    PushNotifications.addListener('registration', (tok) => {
      dataService.registerPushToken({
        token: tok.value,
        devoteeId: user?.devoteeId || '',
        mobile: user?.mobile || '',
        name: user?.name || '',
        platform: Capacitor.getPlatform(),
      });
    });
    PushNotifications.addListener('registrationError', (err) => {
      console.warn('push registration error', err);
    });
    // A push arriving while the app is open — refresh the in-app announcements
    // so the bell updates, and let the app show a banner if it wants.
    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      try { dataService.getAnnouncements(); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('ac-push-received', { detail: notif })); } catch (e) {}
    });
    // User tapped a push from the tray.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      try { window.dispatchEvent(new CustomEvent('ac-push-opened', { detail: action })); } catch (e) {}
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn('initPush failed', e);
  }
}
