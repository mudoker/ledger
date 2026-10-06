import { NextResponse } from 'next/server';
import { getDb } from '../../../../db';
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
    const summary = await db.listBills(user?.id || null);
    return NextResponse.json(summary, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to list bills';
    console.error('List bills error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400, headers: corsHeaders });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid payload: expected an object' }, { status: 400, headers: corsHeaders });
    }

    const { id, data, isShared, visibility, shareToken } = body;

    if (visibility && !['local', 'restricted', 'public'].includes(visibility)) {
      return NextResponse.json({ error: 'Invalid visibility parameter' }, { status: 400, headers: corsHeaders });
    }

    const billId = id || crypto.randomUUID();

    const db = await getDb();
    await db.saveBill(
      billId,
      {
        ...(data || {}),
        isShared: isShared !== undefined ? isShared : data?.isShared,
        visibility: visibility || data?.visibility,
        shareToken: shareToken !== undefined ? shareToken : data?.shareToken,
      },
      user?.id || null
    );

    return NextResponse.json({ id: billId, success: true }, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save bill';
    console.error('Save error:', error);
    const isForbidden = msg.toLowerCase().includes('forbidden');
    return NextResponse.json({ error: msg }, { status: isForbidden ? 403 : 500, headers: corsHeaders });
  }
}
