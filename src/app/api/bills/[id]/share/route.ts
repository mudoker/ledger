import { NextResponse } from 'next/server';
import { getDb } from '../../../../../../db';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
    const { id } = await params;
    const user = await getSessionUser();
    const body = await req.json().catch(() => ({}));
    const { visibility = 'public', regenerateToken = false } = body;

    const db = await getDb();
    const bill = await db.getBill(id, user?.id || null);

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404, headers: corsHeaders });
    }

    if (bill.owner_id && user && bill.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Only the owner can share this bill' }, { status: 403, headers: corsHeaders });
    }

    const shareToken = (regenerateToken || !bill.shareToken)
      ? crypto.randomUUID().replace(/-/g, '')
      : bill.shareToken;

    await db.saveBill(
      id,
      {
        ...bill.data,
        visibility,
        shareToken,
        isShared: true,
      },
      user?.id || bill.owner_id || null
    );

    return NextResponse.json(
      {
        success: true,
        id,
        visibility,
        shareToken,
        isShared: true,
      },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update share settings';
    console.error('Share settings error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    const db = await getDb();

    if (db.revokeBillShare) {
      const revoked = await db.revokeBillShare(id, user?.id || null);
      if (!revoked) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404, headers: corsHeaders });
      }
    }

    return NextResponse.json({ success: true, revoked: true, id }, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to revoke sharing';
    console.error('Revoke share error:', error);
    const isForbidden = msg.toLowerCase().includes('forbidden');
    return NextResponse.json({ error: msg }, { status: isForbidden ? 403 : 500, headers: corsHeaders });
  }
}
