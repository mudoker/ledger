import { NextResponse } from 'next/server';
import { getBaseUrl, getGoogleRedirectUri, exchangeGoogleCode, getGoogleUserInfo, signSessionToken, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';
import { getDb } from '@/../db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const baseUrl = getBaseUrl(req);

  if (error) {
    console.error('Google OAuth error from query:', error);
    return NextResponse.redirect(`${baseUrl}/?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/?auth_error=missing_code`);
  }

  // Verify OAuth state cookie
  const cookieHeader = req.headers.get('cookie') || '';
  const stateCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('oauth_state='))
    ?.split('=')[1];

  if (!stateCookie || stateCookie !== state) {
    console.warn('OAuth state mismatch:', { stateCookie, state });
    // Still proceed if in non-production, or redirect with error in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.redirect(`${baseUrl}/?auth_error=state_mismatch`);
    }
  }

  try {
    const redirectUri = getGoogleRedirectUri(baseUrl);
    const tokenData = await exchangeGoogleCode(code, redirectUri);
    const userInfo = await getGoogleUserInfo(tokenData.access_token);

    if (!userInfo?.email) {
      throw new Error('No email found in Google userinfo response');
    }

    const db = await getDb();
    let user = null;
    if (db.upsertUser) {
      user = await db.upsertUser({
        email: userInfo.email,
        name: userInfo.name || userInfo.email.split('@')[0],
        avatar_url: userInfo.picture || null,
      });
    }

    const sessionPayload = {
      sub: user ? user.id : crypto.randomUUID(),
      email: userInfo.email,
      name: userInfo.name || null,
    };

    const sessionToken = await signSessionToken(sessionPayload);

    const res = NextResponse.redirect(`${baseUrl}/`);
    res.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      path: '/',
    });
    res.cookies.delete('oauth_state');

    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Google OAuth callback error:', msg);
    return NextResponse.redirect(`${baseUrl}/?auth_error=${encodeURIComponent(msg)}`);
  }
}
