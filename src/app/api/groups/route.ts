import { NextResponse } from 'next/server';
import { getDb } from '@/../db';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const db = await getDb();
    if (!db.listGroups) {
      return NextResponse.json([], { headers: corsHeaders });
    }
    const groups = await db.listGroups(user?.id || null);
    return NextResponse.json(groups, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to list groups';
    console.error('List groups error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Login required to create a group' }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { name, description, currency } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400, headers: corsHeaders });
    }

    const db = await getDb();
    if (!db.createGroup) {
      return NextResponse.json({ error: 'Group creation not supported' }, { status: 500, headers: corsHeaders });
    }

    const group = await db.createGroup(name.trim(), user.id, description || null, currency || 'VND');
    return NextResponse.json(group, { status: 201, headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create group';
    console.error('Create group error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}
