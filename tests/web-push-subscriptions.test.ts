import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { setDbInstance, resetDbInstance } from '../db';
import { getVapidKeys, getVapidPublicKey } from '../src/lib/push/vapid';
import { sendPushToUser, sendPushToDevice, sendNotificationToSubscription } from '../src/lib/push/web-push';
import { GET as getVapidKeyRoute } from '../src/app/api/push/vapid-public-key/route';
import { POST as subscribeRoute, DELETE as unsubscribeRoute } from '../src/app/api/push/subscribe/route';
import { POST as sendPushRoute } from '../src/app/api/push/send/route';
import { POST as requestAccessRoute } from '../src/app/api/bills/[id]/request-access/route';
import webpush from 'web-push';

describe('Web Push Notifications & Device Subscriptions System', () => {
    let adapter: SqliteAdapter;

    beforeEach(async () => {
        adapter = new SqliteAdapter(':memory:');
        await adapter.init();
        setDbInstance(adapter);

        await adapter.upsertUser!({
            id: 'owner_user_1',
            email: 'owner@ledger.test',
            name: 'Bill Owner',
        });
        await adapter.upsertUser!({
            id: 'applicant_user_1',
            email: 'applicant@ledger.test',
            name: 'Access Requester',
        });
    });

    afterEach(async () => {
        if (adapter.close) {
            await adapter.close();
        }
        resetDbInstance();
    });

    describe('VAPID Configuration & Key Management', () => {
        it('generates and retrieves valid VAPID public and private keys', () => {
            const keys = getVapidKeys();
            expect(keys).toBeDefined();
            expect(typeof keys.publicKey).toBe('string');
            expect(typeof keys.privateKey).toBe('string');
            expect(keys.publicKey.length).toBeGreaterThan(60);
            expect(keys.privateKey.length).toBeGreaterThan(30);
            expect(keys.subject).toContain('mailto:');

            const pubKey = getVapidPublicKey();
            expect(pubKey).toBe(keys.publicKey);
        });
    });

    describe('Database Uplift: Device Subscriptions CRUD', () => {
        it('persists a new device subscription and retrieves by userId', async () => {
            const saved = await adapter.saveDeviceSubscription!({
                userId: 'owner_user_1',
                deviceId: 'device_phone_123',
                endpoint: 'https://push.example.com/sub/token123',
                keys: {
                    p256dh: 'BNcRdreALRF8M_mock_p256dh',
                    auth: 'mock_auth_secret',
                },
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
            });

            expect(saved.id).toBeDefined();
            expect(saved.user_id).toBe('owner_user_1');
            expect(saved.device_id).toBe('device_phone_123');
            expect(saved.endpoint).toBe('https://push.example.com/sub/token123');

            // Lookup by user
            const userSubs = await adapter.getSubscriptionsByUser!('owner_user_1');
            expect(userSubs.length).toBe(1);
            expect(userSubs[0].endpoint).toBe('https://push.example.com/sub/token123');

            // Lookup by device
            const deviceSubs = await adapter.getSubscriptionsByDevice!('device_phone_123');
            expect(deviceSubs.length).toBe(1);
            expect(deviceSubs[0].id).toBe(saved.id);
        });

        it('upserts on duplicate endpoint without creating redundant rows', async () => {
            const endpoint = 'https://push.example.com/sub/duplicate_check';

            await adapter.saveDeviceSubscription!({
                userId: 'owner_user_1',
                deviceId: 'device_old',
                endpoint,
                keys: { p256dh: 'key1', auth: 'auth1' },
            });

            // Update same endpoint with new deviceId and keys
            await adapter.saveDeviceSubscription!({
                userId: 'owner_user_1',
                deviceId: 'device_new',
                endpoint,
                keys: { p256dh: 'key2', auth: 'auth2' },
            });

            const userSubs = await adapter.getSubscriptionsByUser!('owner_user_1');
            expect(userSubs.length).toBe(1);
            expect(userSubs[0].device_id).toBe('device_new');
            expect(userSubs[0].p256dh).toBe('key2');
        });

        it('deletes subscription by endpoint', async () => {
            const endpoint = 'https://push.example.com/sub/to_delete';

            await adapter.saveDeviceSubscription!({
                userId: 'owner_user_1',
                endpoint,
                keys: { p256dh: 'key', auth: 'auth' },
            });

            expect((await adapter.getSubscriptionsByUser!('owner_user_1')).length).toBe(1);

            const deleted = await adapter.deleteSubscriptionByEndpoint!(endpoint);
            expect(deleted).toBe(true);

            expect((await adapter.getSubscriptionsByUser!('owner_user_1')).length).toBe(0);
        });
    });

    describe('Web Push Delivery & Error Resilience', () => {
        it('handles sending push when user has no active subscriptions gracefully', async () => {
            const summary = await sendPushToUser('user_without_devices', {
                title: 'Test Notification',
                body: 'Hello World',
            });

            expect(summary.total).toBe(0);
            expect(summary.sent).toBe(0);
            expect(summary.error).toContain('No active device subscriptions');
        });

        it('auto-prunes expired (410 Gone) subscriptions from database', async () => {
            const expiredEndpoint = 'https://push.example.com/sub/expired_token';

            await adapter.saveDeviceSubscription!({
                userId: 'owner_user_1',
                endpoint: expiredEndpoint,
                keys: { p256dh: 'p256dh_val', auth: 'auth_val' },
            });

            expect((await adapter.getSubscriptionsByUser!('owner_user_1')).length).toBe(1);

            // Mock webpush.sendNotification throwing 410 Gone
            const originalSendNotification = webpush.sendNotification;
            (webpush as any).sendNotification = mock(async () => {
                const error: any = new Error('Subscription has expired');
                error.statusCode = 410;
                throw error;
            });

            try {
                const summary = await sendPushToUser('owner_user_1', {
                    title: 'Hello',
                    body: 'Are you there?',
                });

                expect(summary.total).toBe(1);
                expect(summary.sent).toBe(0);
                expect(summary.failed).toBe(1);
                expect(summary.expiredCleanedUp).toBe(1);

                // Endpoint should be automatically deleted from DB
                const remainingSubs = await adapter.getSubscriptionsByUser!('owner_user_1');
                expect(remainingSubs.length).toBe(0);
            } finally {
                (webpush as any).sendNotification = originalSendNotification;
            }
        });

        it('handles rate limiting (429) without purging subscription', async () => {
            const endpoint = 'https://push.example.com/sub/rate_limited';

            await adapter.saveDeviceSubscription!({
                userId: 'owner_user_1',
                endpoint,
                keys: { p256dh: 'k', auth: 'a' },
            });

            const originalSendNotification = webpush.sendNotification;
            (webpush as any).sendNotification = mock(async () => {
                const error: any = new Error('Rate limit exceeded');
                error.statusCode = 429;
                throw error;
            });

            try {
                const summary = await sendPushToUser('owner_user_1', {
                    title: 'Spam Alert',
                    body: 'Too fast',
                });

                expect(summary.failed).toBe(1);
                expect(summary.expiredCleanedUp).toBe(0);

                // Subscription must remain preserved
                const remainingSubs = await adapter.getSubscriptionsByUser!('owner_user_1');
                expect(remainingSubs.length).toBe(1);
            } finally {
                (webpush as any).sendNotification = originalSendNotification;
            }
        });
    });

    describe('API Endpoints: Subscribe, Send, and Request Access', () => {
        it('GET /api/push/vapid-public-key returns 200 with applicationServerKey', async () => {
            const res = await getVapidKeyRoute();
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.publicKey).toBeDefined();
            expect(json.publicKey.length).toBeGreaterThan(60);
        });

        it('POST /api/push/subscribe registers subscription into database', async () => {
            const req = new Request('http://localhost/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'owner_user_1',
                    deviceId: 'android_device_007',
                    subscription: {
                        endpoint: 'https://fcm.googleapis.com/fcm/send/token_xyz',
                        keys: {
                            p256dh: 'mock_p256dh',
                            auth: 'mock_auth',
                        },
                    },
                }),
            });

            const res = await subscribeRoute(req);
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.endpoint).toContain('token_xyz');

            const subs = await adapter.getSubscriptionsByUser!('owner_user_1');
            expect(subs.length).toBe(1);
        });

        it('POST /api/push/subscribe returns 400 when subscription fields are incomplete', async () => {
            const req = new Request('http://localhost/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'owner_user_1',
                    subscription: { endpoint: 'https://example.com' }, // missing keys
                }),
            });

            const res = await subscribeRoute(req);
            expect(res.status).toBe(400);
        });

        it('POST /api/push/send sends notification to user with database lookup', async () => {
            await adapter.saveDeviceSubscription!({
                userId: 'owner_user_1',
                endpoint: 'https://push.example.com/sub/active_target',
                keys: { p256dh: 'k', auth: 'a' },
            });

            const originalSendNotification = webpush.sendNotification;
            (webpush as any).sendNotification = mock(async () => ({ statusCode: 201 }));

            try {
                const req = new Request('http://localhost/api/push/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: 'owner_user_1',
                        notification: {
                            title: 'Payment Received',
                            body: 'Alex paid 150,000 VND',
                        },
                    }),
                });

                const res = await sendPushRoute(req);
                expect(res.status).toBe(200);

                const json = await res.json();
                expect(json.success).toBe(true);
                expect(json.summary.sent).toBe(1);
            } finally {
                (webpush as any).sendNotification = originalSendNotification;
            }
        });

        it('POST /api/push/send returns 404 when target user has no registered endpoints', async () => {
            const req = new Request('http://localhost/api/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'unregistered_user_id',
                    notification: {
                        title: 'Test',
                        body: 'Test',
                    },
                }),
            });

            const res = await sendPushRoute(req);
            expect(res.status).toBe(404);
            const json = await res.json();
            expect(json.reason).toBe('no_endpoint');
        });

        it('POST /api/bills/[id]/request-access dispatches push notification to bill owner', async () => {
            const billId = 'bill_request_access_1';
            await adapter.saveBill(
                billId,
                {
                    name: 'Steak & Wine Dinner',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'restricted',
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user_1' }],
                    items: [],
                    charges: [],
                },
                'owner_user_1'
            );

            // Register owner's phone push subscription
            await adapter.saveDeviceSubscription!({
                userId: 'owner_user_1',
                endpoint: 'https://push.example.com/sub/owners_phone',
                keys: { p256dh: 'key', auth: 'auth' },
            });

            let capturedPayload: any = null;
            const originalSendNotification = webpush.sendNotification;
            (webpush as any).sendNotification = mock(async (_sub: any, payloadStr: string) => {
                capturedPayload = JSON.parse(payloadStr);
                return { statusCode: 201 };
            });

            try {
                const req = new Request(`http://localhost/api/bills/${billId}/request-access`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requesterName: 'Hung Tran',
                        requesterEmail: 'hung@example.com',
                        note: 'Can you let me into the dinner bill?',
                    }),
                });

                const res = await requestAccessRoute(req, { params: Promise.resolve({ id: billId }) });
                expect(res.status).toBe(200);

                const json = await res.json();
                expect(json.success).toBe(true);
                expect(json.notified).toBe(true);
                expect(json.ownerId).toBe('owner_user_1');

                // Verify captured push payload
                expect(capturedPayload).not.toBeNull();
                expect(capturedPayload.title).toContain('Access Request: Steak & Wine Dinner');
                expect(capturedPayload.body).toContain('Hung Tran requested access');
                expect(capturedPayload.data.billId).toBe(billId);
                expect(capturedPayload.data.action).toBe('request-access');
            } finally {
                (webpush as any).sendNotification = originalSendNotification;
            }
        });

        it('POST /api/bills/[id]/request-access returns 404 for non-existent bill', async () => {
            const req = new Request('http://localhost/api/bills/non_existent/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterName: 'Stranger' }),
            });

            const res = await requestAccessRoute(req, { params: Promise.resolve({ id: 'non_existent' }) });
            expect(res.status).toBe(404);
        });
    });
});
