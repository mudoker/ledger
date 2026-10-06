import { NextResponse } from 'next/server';
import { getDb, getDbStatus } from '../../../../db';

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
  const startTime = Date.now();
  let dbConnected = false;
  let pingLatencyMs = 0;
  let dbError: string | null = null;

  try {
    const db = await getDb();
    if (db) {
      dbConnected = true;
      pingLatencyMs = Date.now() - startTime;
    }
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : 'Database ping failure';
    console.warn('Health check DB init error:', e);
  }

  const memory = process.memoryUsage ? {
    heapUsedMb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
    rssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
  } : null;

  const isHealthy = dbConnected;

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      database: {
        ...getDbStatus(),
        connected: dbConnected,
        pingLatencyMs,
        error: dbError,
      },
      memory,
    },
    {
      status: isHealthy ? 200 : 503,
      headers: corsHeaders,
    }
  );
}
