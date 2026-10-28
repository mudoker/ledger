import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/push/vapid';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const publicKey = getVapidPublicKey();
    return NextResponse.json({ publicKey }, { headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to retrieve VAPID public key';
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
}
