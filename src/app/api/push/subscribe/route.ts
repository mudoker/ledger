import { NextResponse } from 'next/server';
import { getDb } from '../../../../../db';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscription, deviceId, userId: customUserId } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { error: 'Missing subscription details (endpoint, keys.p256dh, keys.auth are required)' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sessionUser = await getSessionUser();
    const effectiveUserId = customUserId || sessionUser?.id || null;
    const userAgent = req.headers.get('user-agent') || null;

    const db = await getDb();
    if (!db.saveDeviceSubscription) {
      return NextResponse.json(
        { error: 'Database adapter does not support device subscriptions' },
        { status: 501, headers: corsHeaders }
      );
    }

    const saved = await db.saveDeviceSubscription({
      userId: effectiveUserId,
      deviceId: deviceId || null,
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      userAgent,
    });

    return NextResponse.json(
      {
        success: true,
        id: saved.id,
        endpoint: saved.endpoint,
        userId: saved.user_id,
        deviceId: saved.device_id,
      },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to register push subscription';
    console.error('Push subscribe error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const endpoint = url.searchParams.get('endpoint') || body?.endpoint;

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Subscription endpoint is required to unsubscribe' },
        { status: 400, headers: corsHeaders }
      );
    }

    const db = await getDb();
    if (!db.deleteSubscriptionByEndpoint) {
      return NextResponse.json(
        { error: 'Database adapter does not support deleting subscriptions' },
        { status: 501, headers: corsHeaders }
      );
    }

    const deleted = await db.deleteSubscriptionByEndpoint(endpoint);
    return NextResponse.json({ success: true, deleted }, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to unsubscribe';
    console.error('Push unsubscribe error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}
