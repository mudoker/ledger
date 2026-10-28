import { NextResponse } from 'next/server';
import {
  sendPushToUser,
  sendPushToDevice,
  sendNotificationToSubscription,
  type PushNotificationPayload,
} from '@/lib/push/web-push';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId, deviceId, endpoint, keys, notification } = body;

    if (!notification || typeof notification.title !== 'string' || typeof notification.body !== 'string') {
      return NextResponse.json(
        { error: 'Invalid notification payload (notification.title and notification.body are required)' },
        { status: 400, headers: corsHeaders }
      );
    }

    const payload: PushNotificationPayload = {
      title: notification.title.trim(),
      body: notification.body.trim(),
      icon: notification.icon || '/favicon.ico',
      badge: notification.badge || '/favicon.ico',
      url: notification.url || '/',
      tag: notification.tag || 'ledger-push',
      data: notification.data || {},
    };

    // Case 1: Send to User ID (Lookup in database)
    if (userId) {
      const summary = await sendPushToUser(userId, payload);
      if (summary.total === 0) {
        return NextResponse.json(
          {
            success: false,
            reason: 'no_endpoint',
            error: summary.error || 'No active push endpoints registered for this user in database',
            summary,
          },
          { status: 404, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        {
          success: summary.sent > 0,
          deliveredTo: `${summary.sent}/${summary.total} devices`,
          summary,
        },
        { headers: corsHeaders }
      );
    }

    // Case 2: Send to Device ID (Lookup in database)
    if (deviceId) {
      const summary = await sendPushToDevice(deviceId, payload);
      if (summary.total === 0) {
        return NextResponse.json(
          {
            success: false,
            reason: 'no_endpoint',
            error: summary.error || 'No active push endpoints registered for this device ID in database',
            summary,
          },
          { status: 404, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        {
          success: summary.sent > 0,
          deliveredTo: `${summary.sent}/${summary.total} endpoints`,
          summary,
        },
        { headers: corsHeaders }
      );
    }

    // Case 3: Direct send to explicit endpoint
    if (endpoint && keys?.p256dh && keys?.auth) {
      const result = await sendNotificationToSubscription({ endpoint, keys }, payload);
      const isOk = result.success;

      return NextResponse.json(
        {
          success: isOk,
          result,
        },
        { status: isOk ? 200 : (result.statusCode || 500), headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: 'Must provide either userId, deviceId, or { endpoint, keys } to send push notification' },
      { status: 400, headers: corsHeaders }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to send push notification';
    console.error('Push send endpoint error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}
