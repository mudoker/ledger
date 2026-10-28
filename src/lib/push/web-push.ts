import webpush from 'web-push';
import { getVapidKeys } from './vapid';
import { getDb } from '../../../db';
import type { DeviceSubscription } from '../../../db/types';

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, any>;
}

export interface SendPushResult {
  endpoint: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  expired?: boolean;
}

export interface PushDeliverySummary {
  total: number;
  sent: number;
  failed: number;
  expiredCleanedUp: number;
  results: SendPushResult[];
  error?: string;
}

let isVapidInitialized = false;

export function configureWebPush(): void {
  const keys = getVapidKeys();
  try {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    isVapidInitialized = true;
  } catch (err) {
    console.error('Failed to configure webpush VAPID details:', err);
    throw err;
  }
}

/**
 * Sends a push notification to a single device subscription.
 * Correctly classifies expired, unauthorized, and network errors.
 */
export async function sendNotificationToSubscription(
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  payload: PushNotificationPayload
): Promise<SendPushResult> {
  if (!isVapidInitialized) {
    configureWebPush();
  }

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    url: payload.url || '/',
    tag: payload.tag || 'ledger-notification',
    data: payload.data || {},
  });

  try {
    const pushSub: webpush.PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const res = await webpush.sendNotification(pushSub, notificationPayload);

    return {
      endpoint: subscription.endpoint,
      success: true,
      statusCode: res.statusCode,
    };
  } catch (err: any) {
    const statusCode = err?.statusCode || 500;
    const isExpired = statusCode === 410 || statusCode === 404;
    const isUnauthorized = statusCode === 401 || statusCode === 403;
    const isRateLimited = statusCode === 429;

    let errorMessage = err?.message || 'Failed to deliver push notification';
    if (isExpired) {
      errorMessage = 'Subscription has expired or is no longer registered (410/404)';
    } else if (isUnauthorized) {
      errorMessage = 'Unauthorized VAPID credentials or applicationServerKey mismatch (401/403)';
    } else if (isRateLimited) {
      errorMessage = 'Push service rate limit exceeded (429)';
    }

    return {
      endpoint: subscription.endpoint,
      success: false,
      statusCode,
      error: errorMessage,
      expired: isExpired,
    };
  }
}

/**
 * Dispatches a push notification to all devices registered to a specific user.
 * Automatically prunes any stale/expired endpoints from the database.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushNotificationPayload
): Promise<PushDeliverySummary> {
  const db = await getDb();
  if (!db.getSubscriptionsByUser) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      expiredCleanedUp: 0,
      results: [],
      error: 'Database adapter does not support device subscriptions',
    };
  }

  const subscriptions = await db.getSubscriptionsByUser(userId);

  if (subscriptions.length === 0) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      expiredCleanedUp: 0,
      results: [],
      error: 'No active device subscriptions found for this user',
    };
  }

  return processSubscriptions(db, subscriptions, payload);
}

/**
 * Dispatches a push notification to all subscriptions matching a device ID.
 */
export async function sendPushToDevice(
  deviceId: string,
  payload: PushNotificationPayload
): Promise<PushDeliverySummary> {
  const db = await getDb();
  if (!db.getSubscriptionsByDevice) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      expiredCleanedUp: 0,
      results: [],
      error: 'Database adapter does not support device subscriptions',
    };
  }

  const subscriptions = await db.getSubscriptionsByDevice(deviceId);

  if (subscriptions.length === 0) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      expiredCleanedUp: 0,
      results: [],
      error: 'No active subscriptions found for this device',
    };
  }

  return processSubscriptions(db, subscriptions, payload);
}

async function processSubscriptions(
  db: any,
  subscriptions: DeviceSubscription[],
  payload: PushNotificationPayload
): Promise<PushDeliverySummary> {
  let sent = 0;
  let failed = 0;
  let expiredCleanedUp = 0;
  const results: SendPushResult[] = [];

  const promises = subscriptions.map(async (sub) => {
    const res = await sendNotificationToSubscription(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      payload
    );

    results.push(res);

    if (res.success) {
      sent++;
    } else {
      failed++;
      // Auto-prune dead/expired subscriptions
      if (res.expired && db.deleteSubscriptionByEndpoint) {
        try {
          await db.deleteSubscriptionByEndpoint(sub.endpoint);
          expiredCleanedUp++;
        } catch (cleanupErr) {
          console.warn('Failed to prune expired subscription:', cleanupErr);
        }
      }
    }
  });

  await Promise.all(promises);

  return {
    total: subscriptions.length,
    sent,
    failed,
    expiredCleanedUp,
    results,
  };
}
