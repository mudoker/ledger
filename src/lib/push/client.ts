'use client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface PushSubscriptionResult {
  success: boolean;
  permission?: NotificationPermission;
  error?: string;
  subscription?: PushSubscription;
}

/**
 * Requests push notification permission and registers a device subscription with the server.
 */
export async function registerPushNotifications(deviceId?: string): Promise<PushSubscriptionResult> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Cannot register push notifications in non-browser environment' };
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, error: 'Push notifications are not supported on this browser or platform' };
  }

  try {
    // 1. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, permission, error: 'Notification permission was denied or dismissed' };
    }

    // 2. Register service worker
    const registration = await navigator.serviceWorker.register('/sw-push.js');
    await navigator.serviceWorker.ready;

    // 3. Fetch VAPID applicationServerKey
    const vapidRes = await fetch('/api/push/vapid-public-key');
    if (!vapidRes.ok) {
      throw new Error('Failed to retrieve VAPID public key from server');
    }
    const { publicKey } = await vapidRes.json();
    if (!publicKey) {
      throw new Error('Server returned empty VAPID public key');
    }

    // 4. Subscribe with PushManager
    const convertedKey = urlBase64ToUint8Array(publicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey as unknown as BufferSource,
    });

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      throw new Error('Browser returned incomplete PushSubscription object');
    }

    // 5. Send subscription to server
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: {
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
          },
        },
        deviceId: deviceId || localStorage.getItem('ledger_device_id') || undefined,
      }),
    });

    if (!saveRes.ok) {
      const err = await saveRes.json().catch(() => ({}));
      throw new Error(err.error || 'Server failed to save push subscription');
    }

    return {
      success: true,
      permission,
      subscription,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error during push registration';
    console.error('Push notification registration failed:', error);
    return {
      success: false,
      error: msg,
    };
  }
}
