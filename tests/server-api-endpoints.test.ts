import { describe, expect, it, beforeEach } from 'bun:test';
import { GET as healthGet, OPTIONS as healthOptions } from '../src/app/api/health/route';
import { POST as billsPost, OPTIONS as billsOptions } from '../src/app/api/bills/route';
import { GET as billIdGet } from '../src/app/api/bills/[id]/route';
import { POST as groupsPost } from '../src/app/api/groups/route';
import { setTestSessionUser } from '../src/lib/auth';

describe('Server API Endpoints & Request Validation Suite', () => {
  beforeEach(() => {
    setTestSessionUser(null);
  });

  describe('Health Check Route (/api/health)', () => {
    it('returns 200 with ok status, uptime, latency, and database diagnostics', async () => {
      const res = await healthGet();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(typeof json.timestamp).toBe('string');
      expect(typeof json.uptime).toBe('number');
      expect(json.database).toBeDefined();
      expect(json.database.connected).toBe(true);
      expect(typeof json.database.pingLatencyMs).toBe('number');
      expect(json.memory).toBeDefined();
      expect(typeof json.memory.heapUsedMb).toBe('number');
    });

    it('handles OPTIONS preflight with 204 No Content and CORS headers', async () => {
      const res = await healthOptions();
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });
  });

  describe('Bills API Payload Validation (/api/bills)', () => {
    it('returns 400 Bad Request when request body is malformed JSON', async () => {
      const req = new Request('http://localhost:3000/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json-{',
      });

      const res = await billsPost(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Malformed JSON payload');
    });

    it('returns 400 Bad Request when visibility is not an allowed value', async () => {
      const req = new Request('http://localhost:3000/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { name: 'Trip Dinner' },
          visibility: 'invalid_mode_xyz',
        }),
      });

      const res = await billsPost(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid visibility parameter');
    });

    it('handles OPTIONS preflight for bills endpoint', async () => {
      const res = await billsOptions();
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Bill Details Route Validation (/api/bills/[id])', () => {
    it('returns 400 Bad Request when id parameter is empty whitespace', async () => {
      const req = new Request('http://localhost:3000/api/bills/   ');
      const res = await billIdGet(req, {
        params: Promise.resolve({ id: '   ' }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid or missing bill ID');
    });
  });

  describe('Groups API Authorization & Validation (/api/groups)', () => {
    it('returns 401 Unauthorized when an unauthenticated user attempts to create a group', async () => {
      const req = new Request('http://localhost:3000/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Camping Trip' }),
      });

      const res = await groupsPost(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns 400 Bad Request when group name is missing or empty', async () => {
      setTestSessionUser({
        id: 'user_tester',
        email: 'tester@example.com',
        name: 'Tester',
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = new Request('http://localhost:3000/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '   ', description: 'Empty name' }),
      });

      const res = await groupsPost(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Group name is required');
    });
  });
});
