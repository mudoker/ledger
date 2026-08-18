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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Login required' }, { status: 401, headers: corsHeaders });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400, headers: corsHeaders });
    }

    const { name, description, currency, participants } = body || {};

    const db = await getDb();
    if (!db.updateGroup || !db.getGroup) {
      return NextResponse.json({ error: 'Groups not supported' }, { status: 500, headers: corsHeaders });
    }

    await db.updateGroup(id, { name, description, currency, participants }, user.id);
    const updated = await db.getGroup(id, user.id);
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
