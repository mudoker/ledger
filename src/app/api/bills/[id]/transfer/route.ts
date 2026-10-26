import { NextResponse } from 'next/server';
import { getDb } from '@/../db';
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
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Login required' }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const newOwnerId = body.new_owner_id || body.newOwnerId;

    if (!newOwnerId || typeof newOwnerId !== 'string') {
      return NextResponse.json({ error: 'new_owner_id is required' }, { status: 400, headers: corsHeaders });
    }

    const db = await getDb();
    if (!db.transferBillOwnership) {
      return NextResponse.json({ error: 'Bill ownership transfer not supported' }, { status: 500, headers: corsHeaders });
    }

    await db.transferBillOwnership(id, newOwnerId, user.id);
    return NextResponse.json({
      success: true,
      bill_id: id,
      previous_owner_id: user.id,
      new_owner_id: newOwnerId
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to transfer bill ownership';
    console.error('Transfer bill error:', error);
    const isForbidden = msg.toLowerCase().includes('forbidden');
    const isNotFound = msg.toLowerCase().includes('not found');
    return NextResponse.json(
      { error: msg },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500, headers: corsHeaders }
    );
  }
}
