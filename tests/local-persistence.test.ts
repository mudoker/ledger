import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { MemoryStorageEngine } from '../src/lib/local-db/storage-engine';
import { setLocalDb } from '../src/lib/local-db';
import { syncManager } from '../src/lib/local-db/sync-manager';
import { useAppSettingsStore } from '../src/store/useAppSettingsStore';
import type { LocalBillRecord, LocalGroupRecord } from '../src/lib/local-db/types';

describe('Local Database & Offline Persistence Engine', () => {
    let engine: MemoryStorageEngine;

    beforeEach(async () => {
        engine = new MemoryStorageEngine();
        await engine.init();
        setLocalDb(engine);
        useAppSettingsStore.setState({ storageMode: 'local' });
    });

    describe('Bill Local CRUD Operations', () => {
        it('saves and retrieves a local-only bill record', async () => {
            const bill: LocalBillRecord = {
                id: 'local_bill_1',
                name: 'Taco Tuesday',
                location: null,
                currency: 'USD',
                hostId: 'p_1',
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: 'user_1',
                items: [{ id: 'item_1', name: 'Taco', price: 12, quantity: 2, assignments: {} }],
                people: [{ id: 'p_1', name: 'Alice', sponsorAmount: 0, paidAmount: 24 }],
                globalCharges: [],
                sharingStatus: 'local',
                visibility: 'restricted',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await engine.saveBill(bill);
            const retrieved = await engine.getBill('local_bill_1');

            expect(retrieved).not.toBeNull();
            expect(retrieved?.id).toBe('local_bill_1');
            expect(retrieved?.name).toBe('Taco Tuesday');
            expect(retrieved?.sharingStatus).toBe('local');
            expect(retrieved?.items.length).toBe(1);
            expect(retrieved?.items[0].name).toBe('Taco');
        });

        it('lists all local bills sorted by updatedAt descending', async () => {
            const bill1: LocalBillRecord = {
                id: 'bill_a',
                name: 'Breakfast',
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: null,
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'local',
                visibility: 'restricted',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date(1000).toISOString(),
                updatedAt: new Date(1000).toISOString(),
            };

            const bill2: LocalBillRecord = {
                id: 'bill_b',
                name: 'Dinner',
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: null,
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'local',
                visibility: 'restricted',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date(2000).toISOString(),
                updatedAt: new Date(3000).toISOString(),
            };

            await engine.saveBill(bill1);
            await engine.saveBill(bill2);

            const list = await engine.listBills();
            expect(list.length).toBe(2);
            expect(list[0].id).toBe('bill_b');
            expect(list[1].id).toBe('bill_a');
        });

        it('deletes a bill from local storage', async () => {
            const bill: LocalBillRecord = {
                id: 'bill_to_delete',
                name: 'To Delete',
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: null,
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'local',
                visibility: 'restricted',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await engine.saveBill(bill);
            expect(await engine.getBill('bill_to_delete')).not.toBeNull();

            await engine.deleteBill('bill_to_delete');
            expect(await engine.getBill('bill_to_delete')).toBeNull();
        });

        it('isolates saved data via deep copy protection', async () => {
            const originalBill: LocalBillRecord = {
                id: 'bill_isolated',
                name: 'Original Name',
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: 'user_x',
                items: [{ id: 'i1', name: 'Item 1', price: 10, quantity: 1, assignments: {} }],
                people: [],
                globalCharges: [],
                sharingStatus: 'local',
                visibility: 'local',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await engine.saveBill(originalBill);

            // Mutate external object reference
            originalBill.name = 'Hacked Name';
            originalBill.items.push({ id: 'i2', name: 'Injected Item', price: 99, quantity: 1, assignments: {} });

            // Stored copy in engine must be pristine
            const fetched = await engine.getBill('bill_isolated');
            expect(fetched?.name).toBe('Original Name');
            expect(fetched?.items.length).toBe(1);
        });

        it('filters bills by ownerId respecting privacy boundaries', async () => {
            await engine.saveBill({
                id: 'bill_alice',
                name: "Alice's Bill",
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: 'user_alice',
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'local',
                visibility: 'local',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            await engine.saveBill({
                id: 'bill_bob',
                name: "Bob's Bill",
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: 'user_bob',
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'local',
                visibility: 'local',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            const aliceBills = await engine.listBills('user_alice');
            expect(aliceBills.length).toBe(1);
            expect(aliceBills[0].id).toBe('bill_alice');

            const bobBills = await engine.listBills('user_bob');
            expect(bobBills.length).toBe(1);
            expect(bobBills[0].id).toBe('bill_bob');
        });
    });

    describe('Group Local CRUD Operations', () => {
        it('saves and retrieves local groups', async () => {
            const group: LocalGroupRecord = {
                id: 'local_group_1',
                name: 'Trip to Tokyo',
                description: 'Vacation group',
                currency: 'JPY',
                ownerId: 'user_1',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await engine.saveGroup(group);
            const retrieved = await engine.getGroup('local_group_1');

            expect(retrieved).not.toBeNull();
            expect(retrieved?.id).toBe('local_group_1');
            expect(retrieved?.name).toBe('Trip to Tokyo');
            expect(retrieved?.description).toBe('Vacation group');
        });

        it('deletes a group from local storage', async () => {
            const group: LocalGroupRecord = {
                id: 'group_to_delete',
                name: 'Old Group',
                description: null,
                currency: 'USD',
                ownerId: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await engine.saveGroup(group);
            await engine.deleteGroup('group_to_delete');
            expect(await engine.getGroup('group_to_delete')).toBeNull();
        });

        it('filters groups by ownerId', async () => {
            await engine.saveGroup({
                id: 'g_alice',
                name: 'Alice Group',
                description: null,
                currency: 'USD',
                ownerId: 'user_alice',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            await engine.saveGroup({
                id: 'g_bob',
                name: 'Bob Group',
                description: null,
                currency: 'EUR',
                ownerId: 'user_bob',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            const aliceGroups = await engine.listGroups('user_alice');
            expect(aliceGroups.length).toBe(1);
            expect(aliceGroups[0].id).toBe('g_alice');
        });
    });

    describe('Offline Sync Queue Operations', () => {
        it('enqueues, peeks, and removes pending sync operations', async () => {
            await engine.savePendingOp({
                id: 'op_1',
                billId: 'bill_100',
                type: 'upload',
                payload: { name: 'Test Bill' },
                attempts: 0,
                createdAt: new Date(1000).toISOString(),
            });

            await engine.savePendingOp({
                id: 'op_2',
                billId: 'bill_100',
                type: 'revoke',
                payload: null,
                attempts: 0,
                createdAt: new Date(2000).toISOString(),
            });

            const pending = await engine.getPendingOps();
            expect(pending.length).toBe(2);
            expect(pending[0].id).toBe('op_1');
            expect(pending[1].id).toBe('op_2');

            await engine.removePendingOp('op_1');
            const remaining = await engine.getPendingOps();
            expect(remaining.length).toBe(1);
            expect(remaining[0].id).toBe('op_2');

            await engine.clear();
            const empty = await engine.getPendingOps();
            expect(empty.length).toBe(0);
        });
    });

    describe('SyncManager Background Processing & Recovery', () => {
        it('processes pending upload and updates local bill sharingStatus to shared', async () => {
            const bill: LocalBillRecord = {
                id: 'bill_sync_test',
                name: 'Pending Sync Bill',
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: 'user_1',
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'uploading',
                visibility: 'public',
                shareToken: 'tok_abc',
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await engine.saveBill(bill);

            await engine.savePendingOp({
                id: 'op_upload_1',
                billId: 'bill_sync_test',
                type: 'upload',
                attempts: 0,
                createdAt: new Date().toISOString(),
            });

            // Mock successful network upload
            globalThis.fetch = mock(async () => ({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            })) as any;

            await syncManager.processPendingOperations();

            // Op should be cleared
            const pending = await engine.getPendingOps();
            expect(pending.length).toBe(0);

            // Bill should be marked shared
            const updatedBill = await engine.getBill('bill_sync_test');
            expect(updatedBill?.sharingStatus).toBe('shared');
            expect(updatedBill?.lastSyncedAt).not.toBeNull();
        });

        it('handles network failure by incrementing retry attempts', async () => {
            const bill: LocalBillRecord = {
                id: 'bill_failing_sync',
                name: 'Failing Bill',
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: null,
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'uploading',
                visibility: 'restricted',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await engine.saveBill(bill);

            await engine.savePendingOp({
                id: 'op_fail_1',
                billId: 'bill_failing_sync',
                type: 'upload',
                attempts: 0,
                createdAt: new Date().toISOString(),
            });

            // Mock network failure
            globalThis.fetch = mock(async () => {
                throw new Error('Connection refused');
            }) as any;

            await syncManager.processPendingOperations();

            const pending = await engine.getPendingOps();
            expect(pending.length).toBe(1);
            expect(pending[0].attempts).toBe(1);
        });

        it('processes pending revoke, returns bill to local mode, and clears shareToken', async () => {
            const bill: LocalBillRecord = {
                id: 'bill_revoke_test',
                name: 'Bill To Revoke',
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: 'user_1',
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'revocation_pending',
                visibility: 'public',
                shareToken: 'tok_to_delete',
                lastSyncedAt: new Date().toISOString(),
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await engine.saveBill(bill);

            await engine.savePendingOp({
                id: 'op_revoke_1',
                billId: 'bill_revoke_test',
                type: 'revoke',
                attempts: 0,
                createdAt: new Date().toISOString(),
            });

            globalThis.fetch = mock(async () => ({
                ok: true,
                status: 200,
                json: async () => ({ success: true, revoked: true }),
            })) as any;

            await syncManager.processPendingOperations();

            const pending = await engine.getPendingOps();
            expect(pending.length).toBe(0);

            const updatedBill = await engine.getBill('bill_revoke_test');
            expect(updatedBill?.sharingStatus).toBe('local');
            expect(updatedBill?.visibility).toBe('local');
            expect(updatedBill?.shareToken).toBeNull();
        });

        it('syncBillIfNeeded strictly obeys storageMode setting', async () => {
            let networkCallCount = 0;
            globalThis.fetch = mock(async () => {
                networkCallCount++;
                return { ok: true, json: async () => ({}) };
            }) as any;

            const localBill: LocalBillRecord = {
                id: 'bill_privacy_check',
                name: 'Private Expense',
                location: null,
                currency: 'USD',
                hostId: null,
                qrCode: null,
                groupId: null,
                groupName: null,
                ownerId: 'user_1',
                items: [],
                people: [],
                globalCharges: [],
                sharingStatus: 'local',
                visibility: 'local',
                shareToken: null,
                lastSyncedAt: null,
                syncError: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            // Case 1: In 'local' mode with sharingStatus 'local', 0 network requests
            useAppSettingsStore.setState({ storageMode: 'local' });
            await syncManager.syncBillIfNeeded(localBill);
            expect(networkCallCount).toBe(0);

            // Case 2: In 'cloud' mode, upload is triggered
            useAppSettingsStore.setState({ storageMode: 'cloud' });
            await syncManager.syncBillIfNeeded(localBill);
            expect(networkCallCount).toBe(1);
        });
    });
});
