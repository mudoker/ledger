import { NextResponse } from 'next/server';
import { getDb } from '@/../db';
import { signSessionToken, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, name } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name && name.trim()) || cleanEmail.split('@')[0];

    const db = await getDb();
    let user = null;
    if (db.upsertUser) {
      user = await db.upsertUser({
        email: cleanEmail,
        name: cleanName,
        avatar_url: null,
      });
    }

    const sessionPayload = {
      sub: user ? user.id : crypto.randomUUID(),
      email: cleanEmail,
      name: cleanName,
    };

    const sessionToken = await signSessionToken(sessionPayload);

    const res = NextResponse.json({ success: true, user });
    res.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      path: '/',
    });

    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Dev login error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
