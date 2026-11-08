import { defineBoot } from '#q-app';
import { Capacitor } from '@capacitor/core';
import { api, getAuthToken } from '@/lib/api';
import { announceLowBalance } from '@/utils/alertSpeak';

export default defineBoot(async () => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', (token) => {
      if (!getAuthToken()) return;
      void api('/alerts/push-token', {
        method: 'POST',
        json: { fcmToken: token.value },
      }).catch((err) => console.warn('[push] token upload failed', err));
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const body = notification.body || '';
      const match = /below\s+(\d+(?:\.\d+)?).*Balance\s+(\d+(?:\.\d+)?)/i.exec(body);
      const threshold = match ? Number(match[1]) : 0;
      const balance = match ? Number(match[2]) : 0;
      void announceLowBalance(threshold || 0, balance || 0);
    });
  } catch (err) {
    console.warn('[push] plugin unavailable', err);
  }
});
