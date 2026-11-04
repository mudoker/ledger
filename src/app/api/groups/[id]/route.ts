import { NextResponse } from 'next/server';
import { getDb } from '@/../db';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid or missing group ID' }, { status: 400, headers: corsHeaders });
    }

    const user = await getSessionUser();
    const db = await getDb();
    if (!db.getGroup) {
      return NextResponse.json({ error: 'Groups not supported' }, { status: 500, headers: corsHeaders });
    }

    const group = await db.getGroup(id, user?.id || null);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json(group, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to get group';
    console.error('Get group error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid or missing group ID' }, { status: 400, headers: corsHeaders });
    }

    const user = await getSessionUser();

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400, headers: corsHeaders });
    }

    const { name, description, currency, visibility, participants, payment_qrs, paymentQrs } = body || {};
    const effectivePaymentQrs = payment_qrs !== undefined ? payment_qrs : paymentQrs;

    const isCoreSettings = name !== undefined || description !== undefined || currency !== undefined || visibility !== undefined;
    if (isCoreSettings && !user) {
      return NextResponse.json({ error: 'Unauthorized: Login required' }, { status: 401, headers: corsHeaders });
    }

    const db = await getDb();
    if (!db.updateGroup || !db.getGroup) {
      return NextResponse.json({ error: 'Groups not supported' }, { status: 500, headers: corsHeaders });
    }

    const existingGroup = await db.getGroup(id, user?.id || null);
    if (!existingGroup) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: corsHeaders });
    }

    if (isCoreSettings && !existingGroup.is_owner) {
      return NextResponse.json({ error: 'Forbidden: Only the group owner can update group settings' }, { status: 403, headers: corsHeaders });
    }

    await db.updateGroup(
      id,
      {
        name,
        description,
        currency,
        visibility,
        participants,
        payment_qrs: effectivePaymentQrs,
      },
      user?.id || null
    );
    const updated = await db.getGroup(id, user?.id || null);
    return NextResponse.json(updated, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update group';
    console.error('Update group error:', error);
    const isForbidden = msg.toLowerCase().includes('forbidden');
    return NextResponse.json({ error: msg }, { status: isForbidden ? 403 : 500, headers: corsHeaders });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid or missing group ID' }, { status: 400, headers: corsHeaders });
    }

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Login required' }, { status: 401, headers: corsHeaders });
    }

    const db = await getDb();
    if (!db.deleteGroup) {
      return NextResponse.json({ error: 'Groups not supported' }, { status: 500, headers: corsHeaders });
    }

    const deleted = await db.deleteGroup(id, user.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, id }, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete group';
    console.error('Delete group error:', error);
    const isForbidden = msg.toLowerCase().includes('forbidden');
    return NextResponse.json({ error: msg }, { status: isForbidden ? 403 : 500, headers: corsHeaders });
  }
}
