import { NextResponse } from 'next/server';
import { getDb } from '@/../db';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawQ = url.searchParams.get('q') || '';
    const q = rawQ.trim().slice(0, 100);
    const user = await getSessionUser();
    const db = await getDb();

    if (!db.search || !q) {
      return NextResponse.json({ results: { groups: [], bills: [], items: [] } }, { headers: corsHeaders });
    }

    const results = await db.search(q, user?.id || null);
    return NextResponse.json({ results }, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Search failed';
    console.error('Search error:', error);
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}
