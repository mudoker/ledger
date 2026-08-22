import { describe, expect, it, beforeEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { DELETE as billDelete } from '../src/app/api/bills/[id]/route';
import { POST as billTransferPost } from '../src/app/api/bills/[id]/transfer/route';
import { PUT as groupPut, DELETE as groupDelete } from '../src/app/api/groups/[id]/route';
import { POST as groupTransferPost } from '../src/app/api/groups/[id]/transfer/route';
import { setTestSessionUser } from '../src/lib/auth';
import type { User } from '../db/types';

const mockSessionUser: User = {
  id: 'user_1',
  email: 'u1@test.com',
  name: 'User 1',
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Database Optimization & API Hardening Suite', () => {
  beforeEach(() => {
    setTestSessionUser(null);
  });

  describe('Database Adapter Ping & Health Diagnostics', () => {
    it('successfully pings SqliteAdapter and returns true', async () => {
      const adapter = new SqliteAdapter(':memory:');
      await adapter.init();

      expect(typeof adapter.ping).toBe('function');
      const isAlive = await adapter.ping!();
      expect(isAlive).toBe(true);

      await adapter.close!();
      const isDead = await adapter.ping!();
      expect(isDead).toBe(false);
    });

    it('SqliteAdapter batch-fetches listGroups and aggregates stats accurately', async () => {
      const adapter = new SqliteAdapter(':memory:');
      await adapter.init();

      const user = await adapter.upsertUser({ email: 'owner@test.com', name: 'Owner' });
      const group1 = await adapter.createGroup!('Trip A', user.id, 'First trip', 'VND');
      const group2 = await adapter.createGroup!('Trip B', user.id, 'Second trip', 'USD');

      // Add bills to group1
      await adapter.saveBill('bill_a1', {
        name: 'Meal 1',
        groupId: group1.id,
        items: [{ id: 'i1', name: 'Noodles', price: 50000, quantity: 2 }],
      }, user.id);

      await adapter.saveBill('bill_a2', {
        name: 'Meal 2',
        groupId: group1.id,
        items: [{ id: 'i2', name: 'Drinks', price: 20000, quantity: 1 }],
      }, user.id);

      // Add bill to group2
      await adapter.saveBill('bill_b1', {
        name: 'Hotel',
        groupId: group2.id,
        items: [{ id: 'i3', name: 'Room', price: 100, quantity: 1 }],
      }, user.id);

      const summaries = await adapter.listGroups!(user.id);
      expect(summaries.length).toBe(2);

      const s1 = summaries.find(s => s.id === group1.id);
      expect(s1).toBeDefined();
      expect(s1?.total_bills).toBe(2);
      expect(s1?.total_amount).toBe(120000); // (50000*2) + (20000*1)

      const s2 = summaries.find(s => s.id === group2.id);
      expect(s2).toBeDefined();
      expect(s2?.total_bills).toBe(1);
      expect(s2?.total_amount).toBe(100);

      await adapter.close!();
    });

    it('SqliteAdapter getGroup batch-fetches nested bills and item assignments in single pass', async () => {
      const adapter = new SqliteAdapter(':memory:');
      await adapter.init();

      const user = await adapter.upsertUser({ email: 'batch@test.com', name: 'Batch Tester' });
      const group = await adapter.createGroup!('Family Gathering', user.id, null, 'VND');

      await adapter.saveBill('bill_fam_1', {
        name: 'BBQ',
        groupId: group.id,
        people: [
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' },
        ],
        items: [
          { id: 'item_beef', name: 'Beef', price: 80000, quantity: 2, assignments: { p1: 1, p2: 1 } },
        ],
        charges: [
          { id: 'c1', name: 'VAT', type: 'percent', amount: 10 },
        ],
      }, user.id);

      const detail = await adapter.getGroup!(group.id, user.id);
      expect(detail).not.toBeNull();
      expect(detail?.bills.length).toBe(1);
      expect(detail?.bills[0]?.items.length).toBe(1);
      expect(detail?.bills[0]?.items[0]?.assignments?.['p1']).toBe(1);
      expect(detail?.bills[0]?.people?.length).toBe(2);
      expect(detail?.bills[0]?.globalCharges?.length).toBe(1);

      await adapter.close!();
    });
  });

  describe('API Route Input Validation & Hardening', () => {
    it('DELETE /api/bills/[id] returns 400 Bad Request when id is empty whitespace', async () => {
      const req = new Request('http://localhost:3000/api/bills/%20%20', { method: 'DELETE' });
      const res = await billDelete(req, { params: Promise.resolve({ id: '   ' }) });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid or missing bill ID');
    });

    it('POST /api/bills/[id]/transfer returns 400 Bad Request on malformed JSON payload', async () => {
      setTestSessionUser(mockSessionUser);
      const req = new Request('http://localhost:3000/api/bills/b1/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'malformed-{',
      });

      const res = await billTransferPost(req, { params: Promise.resolve({ id: 'b1' }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Malformed JSON payload');
    });

    it('PUT /api/groups/[id] returns 400 Bad Request on malformed JSON payload', async () => {
      setTestSessionUser(mockSessionUser);
      const req = new Request('http://localhost:3000/api/groups/g1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'bad-json-syntax',
      });

      const res = await groupPut(req, { params: Promise.resolve({ id: 'g1' }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Malformed JSON payload');
    });

    it('DELETE /api/groups/[id] returns 400 Bad Request when id is whitespace', async () => {
      setTestSessionUser(mockSessionUser);
      const req = new Request('http://localhost:3000/api/groups/%20%20', { method: 'DELETE' });
      const res = await groupDelete(req, { params: Promise.resolve({ id: '   ' }) });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid or missing group ID');
    });

    it('POST /api/groups/[id]/transfer returns 400 Bad Request when new_owner_id is missing', async () => {
      setTestSessionUser(mockSessionUser);
      const req = new Request('http://localhost:3000/api/groups/g1/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await groupTransferPost(req, { params: Promise.resolve({ id: 'g1' }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('new_owner_id is required');
    });
  });
});
