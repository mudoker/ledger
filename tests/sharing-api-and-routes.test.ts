import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { setDbInstance, resetDbInstance } from '../db';
import { setTestSessionUser } from '../src/lib/auth';
import { GET as getBillRoute, DELETE as deleteBillRoute } from '../src/app/api/bills/[id]/route';
import { POST as shareBillRoute, DELETE as revokeShareRoute } from '../src/app/api/bills/[id]/share/route';

describe('Sharing API Route Handlers & RBAC Guards', () => {
    let adapter: SqliteAdapter;

    beforeEach(async () => {
        adapter = new SqliteAdapter(':memory:');
        await adapter.init();
        setDbInstance(adapter);
        setTestSessionUser(null);

        await adapter.upsertUser!({
            id: 'owner_user_1',
            email: 'owner@ledger.test',
            name: 'Bill Owner',
        });
        await adapter.upsertUser!({
            id: 'participant_user_1',
            email: 'guest@ledger.test',
            name: 'Invited Guest',
        });
    });

    afterEach(async () => {
        setTestSessionUser(null);
        if (adapter.close) {
            await adapter.close();
        }
        resetDbInstance();
    });

    describe('GET /api/bills/[id] Token and Revocation Enforcement', () => {
        it('returns 200 when requesting public bill with valid share token', async () => {
            const billId = 'route_bill_pub';
            const shareToken = 'tok_secure_abc123';

            await adapter.saveBill(
                billId,
                {
                    name: 'Sunset Cocktail',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken,
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [{ id: 'i1', name: 'Mojito', price: 12, quantity: 2, assignments: {} }],
                    charges: [],
                },
                'owner_user_1'
            );

            const req = new Request(`http://localhost/api/bills/${billId}?token=${shareToken}`);
            const res = await getBillRoute(req, { params: Promise.resolve({ id: billId }) });

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.id).toBe(billId);
            expect(json.data.name).toBe('Sunset Cocktail');
            expect(json.role).toBe('viewer');
            expect(json.isReadOnly).toBe(true);
        });

        it('returns 404 when share token is missing for a public bill accessed anonymously', async () => {
            const billId = 'route_bill_no_tok';
            await adapter.saveBill(
                billId,
                {
                    name: 'Token Protected Bill',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: 'secret_token_xyz',
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            // Request without token
            const req = new Request(`http://localhost/api/bills/${billId}`);
            const res = await getBillRoute(req, { params: Promise.resolve({ id: billId }) });

            expect(res.status).toBe(404);
            const json = await res.json();
            expect(json.error).toContain('revoked');
        });

        it('returns 404 when share token is incorrect', async () => {
            const billId = 'route_bill_wrong_tok';
            await adapter.saveBill(
                billId,
                {
                    name: 'Token Protected Bill 2',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: 'correct_token',
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            const req = new Request(`http://localhost/api/bills/${billId}?token=completely_wrong`);
            const res = await getBillRoute(req, { params: Promise.resolve({ id: billId }) });

            expect(res.status).toBe(404);
        });

        it('returns 404 when a previously shared bill has been revoked', async () => {
            const billId = 'route_bill_revoked';
            const shareToken = 'tok_will_be_revoked';

            await adapter.saveBill(
                billId,
                {
                    name: 'Revoked Bill',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken,
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            // 1. Verify it was accessible initially
            const preReq = new Request(`http://localhost/api/bills/${billId}?token=${shareToken}`);
            const preRes = await getBillRoute(preReq, { params: Promise.resolve({ id: billId }) });
            expect(preRes.status).toBe(200);

            // 2. Revoke the bill
            await adapter.revokeBillShare!(billId);

            // 3. Verify it now returns 404 even with the original valid token
            const postReq = new Request(`http://localhost/api/bills/${billId}?token=${shareToken}`);
            const postRes = await getBillRoute(postReq, { params: Promise.resolve({ id: billId }) });
            expect(postRes.status).toBe(404);
        });
    });

    describe('POST /api/bills/[id]/share Configuration & Token Generation', () => {
        it('enables sharing, sets visibility, and generates a random shareToken', async () => {
            const billId = 'route_share_new';
            setTestSessionUser({
                id: 'owner_user_1',
                email: 'owner@ledger.test',
                name: 'Bill Owner',
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            await adapter.saveBill(
                billId,
                {
                    name: 'Local Only Bill',
                    currency: 'USD',
                    isShared: false,
                    visibility: 'local',
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            const req = new Request(`http://localhost/api/bills/${billId}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visibility: 'public' }),
            });

            const res = await shareBillRoute(req, { params: Promise.resolve({ id: billId }) });
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.isShared).toBe(true);
            expect(json.visibility).toBe('public');
            expect(typeof json.shareToken).toBe('string');
            expect(json.shareToken.length).toBeGreaterThan(16);

            // Check database updated
            const updated = await adapter.getBill(billId, null, true, json.shareToken);
            expect(updated).not.toBeNull();
            expect(updated?.isShared).toBe(true);
        });

        it('regenerates share token when regenerateToken is true', async () => {
            const billId = 'route_share_regen';
            const initialToken = 'initial_token_123';
            setTestSessionUser({
                id: 'owner_user_1',
                email: 'owner@ledger.test',
                name: 'Bill Owner',
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            await adapter.saveBill(
                billId,
                {
                    name: 'Token Regen Bill',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: initialToken,
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            const req = new Request(`http://localhost/api/bills/${billId}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ regenerateToken: true }),
            });

            const res = await shareBillRoute(req, { params: Promise.resolve({ id: billId }) });
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.shareToken).not.toBe(initialToken);

            // Old token no longer works
            const oldReq = await adapter.getBill(billId, null, true, initialToken);
            expect(oldReq).toBeNull();

            // New token works
            const newReq = await adapter.getBill(billId, null, true, json.shareToken);
            expect(newReq).not.toBeNull();
        });

        it('rejects forbidden share request if user is a participant but not the owner', async () => {
            const billId = 'route_share_forbidden_participant';
            await adapter.saveBill(
                billId,
                {
                    name: 'Group Dinner',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'restricted',
                    people: [
                        { id: 'p1', name: 'Owner', userId: 'owner_user_1' },
                        { id: 'p2', name: 'Participant', userId: 'participant_user_1' },
                    ],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            // Participant attempts to change share settings
            setTestSessionUser({
                id: 'participant_user_1',
                email: 'guest@ledger.test',
                name: 'Invited Guest',
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            const req = new Request(`http://localhost/api/bills/${billId}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visibility: 'public' }),
            });

            const res = await shareBillRoute(req, { params: Promise.resolve({ id: billId }) });
            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toContain('Forbidden');
        });

        it('returns 404 for unshared private bills probed by an uninvited stranger', async () => {
            const billId = 'route_share_secret';
            await adapter.saveBill(
                billId,
                {
                    name: 'Secret Private Bill',
                    currency: 'USD',
                    isShared: false,
                    visibility: 'local',
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            // Stranger probes
            setTestSessionUser({
                id: 'stranger_user',
                email: 'stranger@example.com',
                name: 'Stranger',
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            const req = new Request(`http://localhost/api/bills/${billId}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visibility: 'public' }),
            });

            const res = await shareBillRoute(req, { params: Promise.resolve({ id: billId }) });
            expect(res.status).toBe(404);
        });

        it('returns 404 when attempting to share a non-existent bill', async () => {
            setTestSessionUser({
                id: 'owner_user_1',
                email: 'owner@ledger.test',
                name: 'Bill Owner',
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            const req = new Request('http://localhost/api/bills/non_existent/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visibility: 'public' }),
            });

            const res = await shareBillRoute(req, { params: Promise.resolve({ id: 'non_existent' }) });
            expect(res.status).toBe(404);
        });
    });

    describe('DELETE /api/bills/[id]/share Cloud Revocation', () => {
        it('revokes sharing via dedicated DELETE /share endpoint', async () => {
            const billId = 'route_del_share';
            const token = 'tok_del_share';
            setTestSessionUser({
                id: 'owner_user_1',
                email: 'owner@ledger.test',
                name: 'Bill Owner',
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            await adapter.saveBill(
                billId,
                {
                    name: 'Bill To Revoke Via Share Endpoint',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: token,
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            const req = new Request(`http://localhost/api/bills/${billId}/share`, { method: 'DELETE' });
            const res = await revokeShareRoute(req, { params: Promise.resolve({ id: billId }) });

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.revoked).toBe(true);

            // Old link returns 404
            setTestSessionUser(null);
            const checkReq = new Request(`http://localhost/api/bills/${billId}?token=${token}`);
            const checkRes = await getBillRoute(checkReq, { params: Promise.resolve({ id: billId }) });
            expect(checkRes.status).toBe(404);
        });
    });

    describe('DELETE /api/bills/[id]?revoke=1 Query Revocation', () => {
        it('revokes cloud copy when ?revoke=1 is passed without deleting the local bill', async () => {
            const billId = 'route_revoke_query';
            const token = 'tok_query_revoke';
            setTestSessionUser({
                id: 'owner_user_1',
                email: 'owner@ledger.test',
                name: 'Bill Owner',
                avatar_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            await adapter.saveBill(
                billId,
                {
                    name: 'Revoke Via Query Param',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: token,
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            const req = new Request(`http://localhost/api/bills/${billId}?revoke=1`, { method: 'DELETE' });
            const res = await deleteBillRoute(req, { params: Promise.resolve({ id: billId }) });

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.revoked).toBe(true);

            // Owner can still access their local record
            const ownerBill = await adapter.getBill(billId, 'owner_user_1');
            expect(ownerBill).not.toBeNull();
            expect(ownerBill?.isShared).toBe(false);

            // Public access is revoked
            const publicAccess = await adapter.getBill(billId, null, true, token);
            expect(publicAccess).toBeNull();
        });
    });
});
