import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { setDbInstance, resetDbInstance } from '../db';
import { setTestSessionUser } from '../src/lib/auth';
import { GET as billIdGet } from '../src/app/api/bills/[id]/route';
import { POST as sharePost, DELETE as shareDelete } from '../src/app/api/bills/[id]/share/route';
import { POST as requestAccessPost } from '../src/app/api/bills/[id]/request-access/route';
import { POST as billsPost } from '../src/app/api/bills/route';
import type { User } from '../db/types';

describe('Bill Access Requests, Sharing Lifecycle & Notification Integration', () => {
  let adapter: SqliteAdapter;

  const ownerAlice: User = {
    id: 'user_alice_owner',
    email: 'alice.host@domain.test',
    name: 'Alice Host',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const guestBob: User = {
    id: 'user_bob_guest',
    email: 'bob.guest@domain.test',
    name: 'Bob Guest',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const strangerCharlie: User = {
    id: 'user_charlie_stranger',
    email: 'charlie.stranger@domain.test',
    name: 'Charlie Stranger',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();
    setDbInstance(adapter);

    await adapter.upsertUser(ownerAlice);
    await adapter.upsertUser(guestBob);
    await adapter.upsertUser(strangerCharlie);

    setTestSessionUser(null);
  });

  afterEach(async () => {
    setTestSessionUser(null);
    if (adapter.close) {
      await adapter.close();
    }
    resetDbInstance();
  });

  describe('Restricted Bill Access & Request Access Workflow', () => {
    it('executes complete access request flow: stranger blocked -> requests access -> owner approves -> stranger granted access', async () => {
      // 1. Alice creates a restricted bill with only herself and Bob
      const billId = 'bill_secret_meeting';
      setTestSessionUser(ownerAlice);

      await adapter.saveBill(
        billId,
        {
          name: 'Executive Committee Dinner',
          currency: 'USD',
          visibility: 'restricted',
          isShared: true,
          people: [
            { id: 'p_alice', name: 'Alice Host', userId: ownerAlice.id, paidAmount: 200 },
            { id: 'p_bob', name: 'Bob Guest', userId: guestBob.id, paidAmount: 0 },
          ],
          items: [{ id: 'i1', name: 'Course Menu', price: 200, quantity: 1, assignments: { p_alice: 1, p_bob: 1 } }],
          charges: [],
        },
        ownerAlice.id
      );

      // Register device subscription for Alice so she can receive web push notifications
      await adapter.saveDeviceSubscription!({
        userId: ownerAlice.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/alice_device_token',
        keys: {
          p256dh: 'mock_p256dh_key',
          auth: 'mock_auth_secret',
        },
      });

      // 2. Charlie (stranger) attempts to view the bill -> receives 404 (hidden for privacy)
      setTestSessionUser(strangerCharlie);
      const unauthorizedReq = new Request(`http://localhost/api/bills/${billId}`);
      const unauthorizedRes = await billIdGet(unauthorizedReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(unauthorizedRes.status).toBe(404);

      // 3. Charlie posts an access request
      const requestAccessReq = new Request(`http://localhost/api/bills/${billId}/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterName: 'Charlie Stranger',
          requesterEmail: 'charlie.stranger@domain.test',
          note: 'Please let me see what I owe for the wine',
        }),
      });

      const requestAccessRes = await requestAccessPost(requestAccessReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(requestAccessRes.status).toBe(200);
      const accessJson = await requestAccessRes.json();
      expect(accessJson.success).toBe(true);

      // 4. Owner Alice approves Charlie by updating the bill participants
      setTestSessionUser(ownerAlice);
      const approveReq = new Request('http://localhost/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: billId,
          isShared: true,
          visibility: 'restricted',
          data: {
            name: 'Executive Committee Dinner',
            currency: 'USD',
            people: [
              { id: 'p_alice', name: 'Alice Host', userId: ownerAlice.id, paidAmount: 200 },
              { id: 'p_bob', name: 'Bob Guest', userId: guestBob.id, paidAmount: 0 },
              { id: 'p_charlie', name: 'Charlie Stranger', userId: strangerCharlie.id, paidAmount: 0 },
            ],
            items: [
              { id: 'i1', name: 'Course Menu', price: 200, quantity: 1, assignments: { p_alice: 1, p_bob: 1, p_charlie: 1 } },
            ],
            charges: [],
          },
        }),
      });

      const approveRes = await billsPost(approveReq);
      expect(approveRes.status).toBe(200);

      // 5. Charlie now requests the bill again -> Receives 200 OK!
      setTestSessionUser(strangerCharlie);
      const authorizedReq = new Request(`http://localhost/api/bills/${billId}`);
      const authorizedRes = await billIdGet(authorizedReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(authorizedRes.status).toBe(200);
      const billData = await authorizedRes.json();
      expect(billData.id).toBe(billId);
      expect(billData.data.people.some((p: any) => p.userId === strangerCharlie.id)).toBe(true);
    });

    it('rejects access requests with 404 if bill does not exist or has been deleted', async () => {
      setTestSessionUser(strangerCharlie);
      const req = new Request('http://localhost/api/bills/non_existent_bill/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterName: 'Charlie' }),
      });

      const res = await requestAccessPost(req, {
        params: Promise.resolve({ id: 'non_existent_bill' }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('not found');
    });

    it('rejects access request with 400 if bill has no cloud owner account', async () => {
      // Local bill without an owner_id saved to DB
      await adapter.saveBill('bill_unowned', {
        name: 'Local Scratch Bill',
        items: [],
      }, null);

      setTestSessionUser(strangerCharlie);
      const req = new Request('http://localhost/api/bills/bill_unowned/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterName: 'Charlie' }),
      });

      const res = await requestAccessPost(req, {
        params: Promise.resolve({ id: 'bill_unowned' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('associated cloud owner account');
    });
  });

  describe('Public Token Sharing & Instant Token Revocation', () => {
    it('creates public share token, verifies anonymous access, and confirms instant token invalidation on revocation', async () => {
      const billId = 'bill_public_token_demo';
      setTestSessionUser(ownerAlice);

      await adapter.saveBill(
        billId,
        {
          name: 'Annual Charity Gala',
          currency: 'USD',
          visibility: 'restricted',
          isShared: true,
          people: [{ id: 'p1', name: 'Alice', userId: ownerAlice.id }],
          items: [{ id: 'i1', name: 'Gala Ticket', price: 100, quantity: 1, assignments: {} }],
        },
        ownerAlice.id
      );

      // 1. Owner generates a public share token
      const shareReq = new Request(`http://localhost/api/bills/${billId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      });

      const shareRes = await sharePost(shareReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(shareRes.status).toBe(200);
      const shareJson = await shareRes.json();
      expect(shareJson.success).toBe(true);
      expect(shareJson.shareToken).toBeDefined();
      expect(typeof shareJson.shareToken).toBe('string');
      const shareToken = shareJson.shareToken;

      // 2. Anonymous user (no session) accesses bill using the share token
      setTestSessionUser(null);
      const anonValidReq = new Request(`http://localhost/api/bills/${billId}?token=${shareToken}`);
      const anonValidRes = await billIdGet(anonValidReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(anonValidRes.status).toBe(200);
      const anonBill = await anonValidRes.json();
      expect(anonBill.data.name).toBe('Annual Charity Gala');

      // 3. Anonymous user with wrong token gets 404
      const anonInvalidReq = new Request(`http://localhost/api/bills/${billId}?token=invalid_forged_token`);
      const anonInvalidRes = await billIdGet(anonInvalidReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(anonInvalidRes.status).toBe(404);

      // 4. Owner revokes sharing
      setTestSessionUser(ownerAlice);
      const revokeReq = new Request(`http://localhost/api/bills/${billId}/share`, {
        method: 'DELETE',
      });
      const revokeRes = await shareDelete(revokeReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(revokeRes.status).toBe(200);

      // 5. Access with the old share token is now immediately 404
      setTestSessionUser(null);
      const postRevokeReq = new Request(`http://localhost/api/bills/${billId}?token=${shareToken}`);
      const postRevokeRes = await billIdGet(postRevokeReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(postRevokeRes.status).toBe(404);
    });
  });
});
