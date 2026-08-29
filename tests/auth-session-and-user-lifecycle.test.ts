import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { setDbInstance, resetDbInstance } from '../db';
import { setTestSessionUser, signSessionToken, verifySessionToken } from '../src/lib/auth';
import { POST as devLoginPost } from '../src/app/api/auth/dev-login/route';
import { GET as authMeGet } from '../src/app/api/auth/me/route';
import { POST as signoutPost, GET as signoutGet } from '../src/app/api/auth/signout/route';
import { GET as userSearchGet } from '../src/app/api/users/search/route';
import { POST as billsPost } from '../src/app/api/bills/route';
import { DELETE as billIdDelete } from '../src/app/api/bills/[id]/route';
import { POST as billTransferPost } from '../src/app/api/bills/[id]/transfer/route';
import { PUT as groupIdPut, DELETE as groupIdDelete } from '../src/app/api/groups/[id]/route';
import { POST as groupTransferPost } from '../src/app/api/groups/[id]/transfer/route';
import type { User } from '../db/types';

describe('Auth Session, User Management & RBAC Security Integration Suite', () => {
  let adapter: SqliteAdapter;

  const userAlice: User = {
    id: 'user_alice_auth',
    email: 'alice@security.com',
    name: 'Alice Security',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const userBob: User = {
    id: 'user_bob_auth',
    email: 'bob@security.com',
    name: 'Bob Security',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();
    setDbInstance(adapter);

    await adapter.upsertUser(userAlice);
    await adapter.upsertUser(userBob);

    setTestSessionUser(null);
  });

  afterEach(async () => {
    setTestSessionUser(null);
    if (adapter.close) {
      await adapter.close();
    }
    resetDbInstance();
  });

  describe('Dev Login Route & Session Cookie Issuance', () => {
    it('creates a user record and issues HTTP-only session cookie on valid credentials', async () => {
      const req = new Request('http://localhost/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'Carol@Security.COM ',
          name: 'Carol Auditor',
        }),
      });

      const res = await devLoginPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.user).toBeDefined();
      expect(json.user.email).toBe('carol@security.com'); // Normalized lowercase
      expect(json.user.name).toBe('Carol Auditor');

      // Verify cookie was set
      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).not.toBeNull();
      expect(cookieHeader).toContain('session_token=');
      expect(cookieHeader).toContain('HttpOnly');
    });

    it('rejects dev login with 400 Bad Request if email is invalid or missing', async () => {
      const invalidEmails = ['', 'not-an-email', 'missing-at-sign.com', null];

      for (const email of invalidEmails) {
        const req = new Request('http://localhost/api/auth/dev-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const res = await devLoginPost(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Valid email is required');
      }
    });

    it('is idempotent: logging in repeatedly with the same email reuses existing user', async () => {
      const email = 'idempotent@test.com';
      const req1 = new Request('http://localhost/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: 'First Name' }),
      });
      const res1 = await devLoginPost(req1);
      const json1 = await res1.json();

      const req2 = new Request('http://localhost/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: 'Updated Name' }),
      });
      const res2 = await devLoginPost(req2);
      const json2 = await res2.json();

      expect(json1.user.id).toBe(json2.user.id);
      expect(json2.user.name).toBe('Updated Name');
    });
  });

  describe('JWT Session Token Sign & Verification Integration', () => {
    it('signs and verifies JWT payloads with valid expiry timestamp', async () => {
      const payload = {
        sub: 'user_jwt_test',
        email: 'jwt@security.com',
        name: 'JWT Tester',
      };

      const token = await signSessionToken(payload);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const verified = await verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe(payload.sub);
      expect(verified?.email).toBe(payload.email);
      expect(verified?.name).toBe(payload.name);
      expect(verified?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('rejects tokens with tampered signature, altered body, or malformed segments', async () => {
      const token = await signSessionToken({ sub: 'user_legit', email: 'legit@sec.com' });
      const [header, body, sig] = token.split('.');

      // 1. Altered body
      const tamperedBody = Buffer.from(JSON.stringify({ sub: 'user_hacker', email: 'hacker@sec.com' })).toString('base64url');
      const tamperedToken = `${header}.${tamperedBody}.${sig}`;
      const resTampered = await verifySessionToken(tamperedToken);
      expect(resTampered).toBeNull();

      // 2. Corrupted signature
      const corruptedSigToken = `${header}.${body}.invalidsignaturexyz`;
      const resCorrupted = await verifySessionToken(corruptedSigToken);
      expect(resCorrupted).toBeNull();

      // 3. Malformed segments (not 3 segments)
      expect(await verifySessionToken('only-one-segment')).toBeNull();
      expect(await verifySessionToken('two.segments')).toBeNull();
      expect(await verifySessionToken('')).toBeNull();
    });
  });

  describe('Auth Me and Signout Routes', () => {
    it('returns null user when unauthenticated and returns user profile when authenticated', async () => {
      // 1. Unauthenticated
      setTestSessionUser(null);
      const res1 = await authMeGet();
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.user).toBeNull();

      // 2. Authenticated
      setTestSessionUser(userAlice);
      const res2 = await authMeGet();
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.user).not.toBeNull();
      expect(json2.user.id).toBe(userAlice.id);
      expect(json2.user.email).toBe(userAlice.email);
    });

    it('clears session cookie on POST and GET signout requests', async () => {
      const postRes = await signoutPost();
      expect(postRes.status).toBe(200);
      const postCookie = postRes.headers.get('set-cookie');
      expect(postCookie).toContain('session_token=;'); // Deleted / expired cookie

      const getReq = new Request('http://localhost:3000/api/auth/signout');
      const getRes = await signoutGet(getReq);
      expect(getRes.status).toBe(307); // Redirect to landing
      const getCookie = getRes.headers.get('set-cookie');
      expect(getCookie).toContain('session_token=;');
    });
  });

  describe('User Search Endpoint (/api/users/search)', () => {
    it('finds users by name or email substring with case insensitivity', async () => {
      const reqByName = new Request('http://localhost/api/users/search?q=alice');
      const resByName = await userSearchGet(reqByName);
      const jsonByName = await resByName.json();
      expect(jsonByName.users.length).toBe(1);
      expect(jsonByName.users[0].email).toBe('alice@security.com');

      const reqByEmail = new Request('http://localhost/api/users/search?q=security.com');
      const resByEmail = await userSearchGet(reqByEmail);
      const jsonByEmail = await resByEmail.json();
      expect(jsonByEmail.users.length).toBe(2); // Alice & Bob
    });

    it('returns empty list for queries shorter than 2 characters or whitespace', async () => {
      const shortQueries = ['a', ' ', '   ', ''];
      for (const q of shortQueries) {
        const req = new Request(`http://localhost/api/users/search?q=${encodeURIComponent(q)}`);
        const res = await userSearchGet(req);
        const json = await res.json();
        expect(json.users).toEqual([]);
      }
    });
  });

  describe('Multi-Tenant Access Isolation & RBAC Cross-Entity Protection', () => {
    it('strictly forbids Bob from editing, deleting, or transferring Alice bills', async () => {
      // Alice creates a bill
      setTestSessionUser(userAlice);
      const billId = 'alice_confidential_bill';
      await adapter.saveBill(billId, {
        name: 'Alice Secret Project',
        currency: 'USD',
        items: [{ id: 'i1', name: 'Item 1', price: 100, quantity: 1 }],
      }, userAlice.id);

      // Bob tries to edit Alice's bill -> 403 Forbidden
      setTestSessionUser(userBob);
      const editReq = new Request('http://localhost/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: billId,
          data: { name: 'Bob Hacked Name' },
        }),
      });
      const editRes = await billsPost(editReq);
      expect(editRes.status).toBe(403);

      // Bob tries to transfer Alice's bill -> 403 Forbidden
      const transferReq = new Request(`http://localhost/api/bills/${billId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_owner_id: userBob.id }),
      });
      const transferRes = await billTransferPost(transferReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(transferRes.status).toBe(403);

      // Bob tries to delete Alice's bill -> 403 Forbidden
      const deleteReq = new Request(`http://localhost/api/bills/${billId}`, {
        method: 'DELETE',
      });
      const deleteRes = await billIdDelete(deleteReq, {
        params: Promise.resolve({ id: billId }),
      });
      expect(deleteRes.status).toBe(403);

      // Verify Alice's bill remained completely untouched
      const billInDb = await adapter.getBill(billId, userAlice.id);
      expect(billInDb?.data.name).toBe('Alice Secret Project');
      expect(billInDb?.owner_id).toBe(userAlice.id);
    });

    it('strictly forbids Bob from editing, deleting, or transferring Alice groups', async () => {
      // Alice creates a group
      const group = await adapter.createGroup!('Alice Secret Group', userAlice.id, 'Alice confidential', 'USD');

      // Bob tries to update Alice's group -> 403 Forbidden
      setTestSessionUser(userBob);
      const editReq = new Request(`http://localhost/api/groups/${group.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bob Hacked Group' }),
      });
      const editRes = await groupIdPut(editReq, {
        params: Promise.resolve({ id: group.id }),
      });
      expect(editRes.status).toBe(403);

      // Bob tries to transfer Alice's group -> 403 Forbidden
      const transferReq = new Request(`http://localhost/api/groups/${group.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_owner_id: userBob.id }),
      });
      const transferRes = await groupTransferPost(transferReq, {
        params: Promise.resolve({ id: group.id }),
      });
      expect(transferRes.status).toBe(403);

      // Bob tries to delete Alice's group -> 403 Forbidden
      const deleteReq = new Request(`http://localhost/api/groups/${group.id}`, {
        method: 'DELETE',
      });
      const deleteRes = await groupIdDelete(deleteReq, {
        params: Promise.resolve({ id: group.id }),
      });
      expect(deleteRes.status).toBe(403);

      // Verify Alice's group remains intact
      const groupInDb = await adapter.getGroup!(group.id, userAlice.id);
      expect(groupInDb?.name).toBe('Alice Secret Group');
      expect(groupInDb?.owner_id).toBe(userAlice.id);
    });
  });
});
