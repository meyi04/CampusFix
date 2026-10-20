import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  PushNotifications,
} from '@capacitor/push-notifications';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/firebase/client';

export interface PushSetupResult {
  available: boolean;
  message: string;
  cleanup: () => Promise<void>;
}

async function tokenDocumentId(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function prepareNativePush(
  uid: string,
  onError: (error: Error) => void,
  onReportOpen: (reportId: string) => void,
): Promise<PushSetupResult> {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, message: 'Push notifications are available in the Android app after Firebase native setup.', cleanup: async () => {} };
  }
  if (!auth?.currentUser || auth.currentUser.uid !== uid || !db) {
    throw new Error('Sign in before enabling notifications on this device.');
  }
  const database = db;

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    return { available: false, message: 'Notification permission was not granted. You can enable it later in Android settings.', cleanup: async () => {} };
  }

  const listeners: PluginListenerHandle[] = [];
  listeners.push(await PushNotifications.addListener('registration', async ({ value: token }) => {
    try {
      const id = await tokenDocumentId(token);
      await setDoc(doc(database, 'users', uid, 'devices', id), {
        token,
        platform: Capacitor.getPlatform(),
        updatedAt: serverTimestamp(),
      });
    } catch (cause) {
      onError(cause instanceof Error ? cause : new Error('Unable to register this device for notifications.'));
    }
  }));
  listeners.push(await PushNotifications.addListener('registrationError', (event) => {
    onError(new Error(event.error || 'Native push registration failed. Check Firebase Android configuration.'));
  }));
  listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const reportId = event.notification.data.reportId;
    if (typeof reportId === 'string' && reportId) onReportOpen(reportId);
  }));

  await PushNotifications.register();
  return {
    available: true,
    message: 'Permission granted. Push delivery still requires Firebase Android configuration and deployed Cloud Functions.',
    cleanup: async () => { await Promise.all(listeners.map((listener) => listener.remove())); },
  };
}
