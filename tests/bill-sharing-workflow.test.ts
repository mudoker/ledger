import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { DatabaseAdapter } from '../db/types';
import { SqliteAdapter } from '../db/sqlite';
import { generateShareUrl } from '../src/lib/share';

describe('Bill Sharing Workflow & Revocation (BRD Compliance)', () => {
    let adapter: DatabaseAdapter;

    beforeEach(async () => {
        adapter = new SqliteAdapter(':memory:');
        await adapter.init();

        await adapter.upsertUser!({
            id: 'owner_user',
            email: 'owner@example.com',
            name: 'Bill Owner',
        });
        await adapter.upsertUser!({
            id: 'participant_user',
            email: 'participant@example.com',
            name: 'Allowed Participant',
        });
        await adapter.upsertUser!({
            id: 'stranger_user',
            email: 'stranger@example.com',
            name: 'Uninvited Stranger',
        });
        await adapter.upsertUser!({
            id: 'case_sensitive_user',
            email: 'Alice.Smith@COMPANY.COM',
            name: 'Alice Smith',
        });
    });

    afterEach(async () => {
        if (adapter.close) {
            await adapter.close();
        }
    });

    describe('BR-01 & BR-07: Restricted Participant Sharing', () => {
        it('allows access only to the owner and bill participants when visibility is restricted', async () => {
            const billId = 'bill_restricted_1';
            await adapter.saveBill(
                billId,
                {
                    name: 'Private Team Dinner',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'restricted',
                    people: [
                        { id: 'p1', name: 'Bill Owner', userId: 'owner_user' },
                        { id: 'p2', name: 'Allowed Participant', userId: 'participant_user' },
                    ],
                    items: [
                        { id: 'i1', name: 'Pizza', price: 30, quantity: 1, assignments: { p1: 1, p2: 1 } },
                    ],
                    charges: [],
                },
                'owner_user'
            );

            // Owner can access
            const ownerResult = await adapter.getBill(billId, 'owner_user');
            expect(ownerResult).not.toBeNull();
            expect(ownerResult?.data.name).toBe('Private Team Dinner');

            // Participant can access
            const participantResult = await adapter.getBill(billId, 'participant_user');
            expect(participantResult).not.toBeNull();
            expect(participantResult?.data.name).toBe('Private Team Dinner');

            // Stranger cannot access (returns null)
            const strangerResult = await adapter.getBill(billId, 'stranger_user');
            expect(strangerResult).toBeNull();

            // Anonymous request without token cannot access
            const anonymousResult = await adapter.getBill(billId);
            expect(anonymousResult).toBeNull();
        });

        it('supports case-insensitive email participant matching for restricted bills', async () => {
            const billId = 'bill_email_match';
            await adapter.saveBill(
                billId,
                {
                    name: 'Corporate Offsite',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'restricted',
                    people: [
                        { id: 'p1', name: 'Bill Owner', userId: 'owner_user' },
                        // Participant listed with lowercase email
                        { id: 'p2', name: 'Alice', email: 'alice.smith@company.com' },
                    ],
                    items: [],
                    charges: [],
                },
                'owner_user'
            );

            // User logged in with mixed-case email: Alice.Smith@COMPANY.COM
            const result = await adapter.getBill(billId, 'case_sensitive_user');
            expect(result).not.toBeNull();
            expect(result?.data.name).toBe('Corporate Offsite');
            expect(result?.role).toBe('participant');

            // Stranger cannot access
            const stranger = await adapter.getBill(billId, 'stranger_user');
            expect(stranger).toBeNull();
        });
    });

    describe('BR-06 & BR-10: Public Link Sharing with Token Protection', () => {
        it('allows access to anyone with the correct share token, but rejects invalid tokens', async () => {
            const billId = 'bill_public_1';
            const shareToken = 'sec_token_987654321';

            await adapter.saveBill(
                billId,
                {
                    name: 'Public Community Picnic',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: shareToken,
                    people: [
                        { id: 'p1', name: 'Bill Owner', userId: 'owner_user' },
                    ],
                    items: [
                        { id: 'i1', name: 'Lemonade', price: 5, quantity: 2, assignments: {} },
                    ],
                    charges: [],
                },
                'owner_user'
            );

            // Access with correct token succeeds even without user authentication
            const validTokenResult = await adapter.getBill(billId, undefined, true, shareToken);
            expect(validTokenResult).not.toBeNull();
            expect(validTokenResult?.data.name).toBe('Public Community Picnic');

            // Access with wrong token fails
            const wrongTokenResult = await adapter.getBill(billId, undefined, true, 'wrong_token');
            expect(wrongTokenResult).toBeNull();

            // Access with no token fails for unauthenticated/unrelated user
            const noTokenResult = await adapter.getBill(billId, 'stranger_user');
            expect(noTokenResult).toBeNull();

            // Owner can always access
            const ownerResult = await adapter.getBill(billId, 'owner_user');
            expect(ownerResult).not.toBeNull();
        });

        it('invalidates old share token when owner rotates to a new token', async () => {
            const billId = 'bill_token_rotation';
            const originalToken = 'token_version_1';
            const rotatedToken = 'token_version_2';

            await adapter.saveBill(
                billId,
                {
                    name: 'Project Milestone Dinner',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: originalToken,
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user' }],
                    items: [],
                    charges: [],
                },
                'owner_user'
            );

            // Initial token works
            const initialAccess = await adapter.getBill(billId, undefined, true, originalToken);
            expect(initialAccess).not.toBeNull();

            // Rotate token
            await adapter.saveBill(
                billId,
                {
                    name: 'Project Milestone Dinner',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: rotatedToken,
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user' }],
                    items: [],
                    charges: [],
                },
                'owner_user'
            );

            // Old token now returns null (revoked/invalidated)
            const oldTokenAccess = await adapter.getBill(billId, undefined, true, originalToken);
            expect(oldTokenAccess).toBeNull();

            // New token works
            const newTokenAccess = await adapter.getBill(billId, undefined, true, rotatedToken);
            expect(newTokenAccess).not.toBeNull();
        });

        it('switching visibility from public to restricted immediately disables token access', async () => {
            const billId = 'bill_switch_vis';
            const shareToken = 'tok_switch_123';

            // 1. Initially public
            await adapter.saveBill(
                billId,
                {
                    name: 'Open Bar',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: shareToken,
                    people: [
                        { id: 'p1', name: 'Owner', userId: 'owner_user' },
                        { id: 'p2', name: 'Participant', userId: 'participant_user' },
                    ],
                    items: [],
                    charges: [],
                },
                'owner_user'
            );

            const publicAccess = await adapter.getBill(billId, undefined, true, shareToken);
            expect(publicAccess).not.toBeNull();

            // 2. Switched to restricted
            await adapter.saveBill(
                billId,
                {
                    name: 'Open Bar',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'restricted',
                    shareToken: shareToken,
                    people: [
                        { id: 'p1', name: 'Owner', userId: 'owner_user' },
                        { id: 'p2', name: 'Participant', userId: 'participant_user' },
                    ],
                    items: [],
                    charges: [],
                },
                'owner_user'
            );

            // Public token access is immediately denied
            const deniedTokenAccess = await adapter.getBill(billId, undefined, true, shareToken);
            expect(deniedTokenAccess).toBeNull();

            // Whitelisted participant can still access
            const participantAccess = await adapter.getBill(billId, 'participant_user');
            expect(participantAccess).not.toBeNull();
        });
    });

    describe('BR-04, BR-05 & BR-08: Revocation of Shared Bills', () => {
        it('immediately revokes cloud access when revokeBillShare is invoked', async () => {
            const billId = 'bill_to_revoke';
            const shareToken = 'tok_active_123';

            await adapter.saveBill(
                billId,
                {
                    name: 'Shared Trip',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: shareToken,
                    people: [
                        { id: 'p1', name: 'Bill Owner', userId: 'owner_user' },
                        { id: 'p2', name: 'Participant', userId: 'participant_user' },
                    ],
                    items: [],
                    charges: [],
                },
                'owner_user'
            );

            // Pre-condition: Token access works
            const beforeRevoke = await adapter.getBill(billId, undefined, true, shareToken);
            expect(beforeRevoke).not.toBeNull();

            // Revoke cloud sharing
            if (adapter.revokeBillShare) {
                await adapter.revokeBillShare(billId);
            }

            // Post-condition: The previous share link with token now returns null (404)
            const afterRevokeWithToken = await adapter.getBill(billId, undefined, true, shareToken);
            expect(afterRevokeWithToken).toBeNull();

            // Participant access is now also revoked since it's no longer a shared bill
            const afterRevokeParticipant = await adapter.getBill(billId, 'participant_user');
            expect(afterRevokeParticipant).toBeNull();

            // Owner still retains their bill record in database
            const ownerRecord = await adapter.getBill(billId, 'owner_user');
            expect(ownerRecord).not.toBeNull();
            expect(ownerRecord?.isShared).toBe(false);
            expect(ownerRecord?.shareToken).toBeNull();
        });

        it('prevents unauthorized users from revoking bill sharing', async () => {
            const billId = 'bill_rbac_revoke';
            await adapter.saveBill(
                billId,
                {
                    name: 'Strict Ownership Bill',
                    currency: 'USD',
                    isShared: true,
                    visibility: 'public',
                    shareToken: 'safe_token',
                    people: [{ id: 'p1', name: 'Owner', userId: 'owner_user' }],
                    items: [],
                    charges: [],
                },
                'owner_user'
            );

            // Attempting revocation as a stranger must be rejected
            if (adapter.revokeBillShare) {
                await expect(
                    adapter.revokeBillShare(billId, 'stranger_user')
                ).rejects.toThrow();
            }

            // Bill remains shared and untouched
            const bill = await adapter.getBill(billId, undefined, true, 'safe_token');
            expect(bill).not.toBeNull();
            expect(bill?.isShared).toBe(true);
        });

        it('handles non-existent bill revocation safely', async () => {
            if (adapter.revokeBillShare) {
                const result = await adapter.revokeBillShare('non_existent_bill_id');
                expect(result).toBe(false);
            }
        });
    });

    describe('Share URL Generation', () => {
        it('embeds token parameter when shareToken exists', () => {
            const url = generateShareUrl(
                {
                    people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 0 }],
                    items: [],
                    globalCharges: [],
                    hostId: 'p1',
                    currentBillId: 'bill_abc',
                    shareToken: 'tok_xyz_123',
                },
                true
            );

            expect(url).toContain('id=bill_abc');
            expect(url).toContain('token=tok_xyz_123');
        });

        it('omits token parameter when shareToken is empty or null', () => {
            const url = generateShareUrl(
                {
                    people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 0 }],
                    items: [],
                    globalCharges: [],
                    hostId: 'p1',
                    currentBillId: 'bill_abc',
                    shareToken: null,
                },
                true
            );

            expect(url).toContain('id=bill_abc');
            expect(url).not.toContain('&token=');
        });

        it('falls back to payload compression when id is absent', () => {
            const url = generateShareUrl({
                people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 0 }],
                items: [{ id: 'i1', name: 'Coffee', price: 5, quantity: 1, assignments: {} }],
                globalCharges: [],
                hostId: 'p1',
            });

            expect(url).toContain('v=');
            expect(url).not.toContain('id=');
        });
    });
});
