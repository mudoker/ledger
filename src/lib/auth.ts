import { cookies } from 'next/headers';
import { getDb } from '../../db';
import type { User } from '../../db/types';

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'ledger-secret-jwt-key-2026';

let cachedCryptoKey: CryptoKey | null = null;

async function getHmacKey(): Promise<CryptoKey> {
  if (cachedCryptoKey) return cachedCryptoKey;
  const enc = new TextEncoder();
  cachedCryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return cachedCryptoKey;
}

export const SESSION_MAX_AGE_SECONDS = 20 * 365 * 24 * 60 * 60; // 20 years - effectively permanent

export interface SessionPayload {
  sub: string;
  email: string;
  name?: string | null;
  iat: number;
  exp: number;
}

export async function signSessionToken(payload: { sub: string; email: string; name?: string | null }): Promise<string> {
  const key = await getHmacKey();
  const enc = new TextEncoder();

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const message = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const sigB64 = Buffer.from(signature).toString('base64url');

  return `${message}.${sigB64}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const key = await getHmacKey();
    const enc = new TextEncoder();

    const message = `${headerB64}.${payloadB64}`;
    const sigBytes = Buffer.from(sigB64, 'base64url');

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(message));
    if (!isValid) return null;

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload: SessionPayload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch (err) {
    console.error('Session verify error:', err);
    return null;
  }
}

let testSessionUser: User | null = null;

export function setTestSessionUser(user: User | null) {
  testSessionUser = user;
}

export async function getSessionUser(): Promise<User | null> {
  if (testSessionUser) return testSessionUser;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;
    if (!token) return null;

    const payload = await verifySessionToken(token);
    if (!payload?.sub) return null;

    const db = await getDb();
    if (db.getUserById) {
      const user = await db.getUserById(payload.sub);
      if (user) return user;
    }

    // Fallback using token payload if user lookup is partial
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name || null,
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  } catch (err: any) {
    if (!err?.message?.includes('outside a request scope')) {
      console.error('getSessionUser error:', err);
    }
    return null;
  }
}

export function getBaseUrl(req?: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }

  if (req) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    if (host) {
      return `${proto}://${host}`;
    }
  }

  return 'https://ledger.mudoker.com';
}

export function getGoogleRedirectUri(baseUrl: string): string {
  return `${baseUrl}/api/auth/callback/google`;
}

export function getGoogleAuthUrl(state: string, redirectUri: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token exchange failed: ${errText}`);
  }

  return await res.json();
}

export async function getGoogleUserInfo(accessToken: string) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch Google userinfo: ${errText}`);
  }

  return await res.json();
}
