import { NextResponse } from 'next/server';
import { getDb } from '../../../../../../db';
import { sendPushToUser } from '@/lib/push/web-push';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;
    const body = await req.json().catch(() => ({}));
    const { requesterName, requesterEmail, note } = body;

    const db = await getDb();
    const sessionUser = await getSessionUser();

    // Look up bill directly in database to locate owner
    const bill = db.getBillMeta ? await db.getBillMeta(billId) : await db.getBill(billId, null);
    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found or has been deleted' },
        { status: 404, headers: corsHeaders }
      );
    }

    const ownerId = bill.owner_id;
    if (!ownerId) {
      return NextResponse.json(
        {
          error: 'This bill does not have an associated cloud owner account to receive notifications',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const applicant =
      requesterName ||
      requesterEmail ||
      sessionUser?.name ||
      sessionUser?.email ||
      'A user';

    const billName = ('name' in bill && bill.name) || (bill as any).data?.name || 'Private Bill';

    const pushPayload = {
      title: `Access Request: ${billName}`,
      body: `${applicant} requested access to view or join "${billName}".`,
      url: `/?id=${billId}`,
      tag: `access-request-${billId}`,
      data: {
        billId,
        action: 'request-access',
        requesterName: applicant,
        requesterEmail: requesterEmail || sessionUser?.email || null,
        note: note || null,
        requestedAt: new Date().toISOString(),
      },
    };

    // Dispatch push notification to all owner's registered devices
    const delivery = await sendPushToUser(ownerId, pushPayload);

    const wasDelivered = delivery.sent > 0;

    return NextResponse.json(
      {
        success: true,
        notified: wasDelivered,
        ownerId,
        message: wasDelivered
          ? 'Push notification successfully delivered to bill owner'
          : 'Request logged, but bill owner has no active device push subscriptions',
        delivery,
      },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to request bill access';
    console.error('Request access error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}
