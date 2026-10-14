import { NextResponse } from 'next/server';
import { getDb } from '@/../db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawQ = url.searchParams.get('q') || '';
    const q = rawQ.trim().slice(0, 100);

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const db = await getDb();
    if (db.searchUsers) {
      const results = await db.searchUsers(q);
      return NextResponse.json({ users: results });
    }

    return NextResponse.json({ users: [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'User search failed';
    return NextResponse.json({ error: msg, users: [] }, { status: 500 });
  }
}
