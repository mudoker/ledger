import { NextResponse } from 'next/server';
import { getDb } from '../../../../../db';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || url.searchParams.get('shareToken');
    const isShare = url.searchParams.get('share') === '1' || url.searchParams.get('share') === 'true' || Boolean(token);

    const user = await getSessionUser();
    const db = await getDb();
    const bill = await db.getBill(id, user?.id || null, isShare, token);

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found or share link has been revoked' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(bill, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to get bill';
    console.error('Get bill error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const isRevokeOnly = url.searchParams.get('revoke') === '1' || url.searchParams.get('revoke') === 'true';

    const user = await getSessionUser();
    const db = await getDb();

    if (isRevokeOnly && db.revokeBillShare) {
      const revoked = await db.revokeBillShare(id, user?.id || null);
      if (!revoked) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404, headers: corsHeaders });
      }
      return NextResponse.json({ success: true, revoked: true, id }, { headers: corsHeaders });
    }

    if (db.deleteBill) {
      const deleted = await db.deleteBill(id, user?.id || null);
      if (!deleted) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404, headers: corsHeaders });
      }
    }
    return NextResponse.json({ success: true, id }, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete bill';
    console.error('Delete bill error:', error);
    const isForbidden = msg.toLowerCase().includes('forbidden');
    return NextResponse.json({ error: msg }, { status: isForbidden ? 403 : 500, headers: corsHeaders });
  }
}
