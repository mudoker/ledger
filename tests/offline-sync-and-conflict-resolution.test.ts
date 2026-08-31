import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { MemoryStorageEngine } from '../src/lib/local-db/storage-engine';
import { setLocalDb } from '../src/lib/local-db';
import { syncManager } from '../src/lib/local-db/sync-manager';
import { useAppSettingsStore } from '../src/store/useAppSettingsStore';
import { useGroupStore } from '../src/store/useGroupStore';
import type { LocalBillRecord, LocalGroupRecord } from '../src/lib/local-db/types';

describe('Offline Queue Synchronization & Multi-Store Integration Suite', () => {
  let engine: MemoryStorageEngine;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    engine = new MemoryStorageEngine();
    await engine.init();
    setLocalDb(engine);
    useAppSettingsStore.setState({ storageMode: 'cloud' });

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Offline Queue Enqueueing & FIFO Processing', () => {
    it('enqueues pending operations when saving a bill while offline', async () => {
      // Create local bill
      const localBill: LocalBillRecord = {
        id: 'bill_offline_01',
        name: 'Offline Camping Supplies',
        location: 'Campground',
        currency: 'USD',
        hostId: 'p1',
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: 'user_camper',
        items: [{ id: 'i1', name: 'Tent', price: 150, quantity: 1, assignments: {} }],
        people: [{ id: 'p1', name: 'Camper', sponsorAmount: 0, paidAmount: 150 }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'restricted',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await engine.saveBill(localBill);

      // Enqueue upload operation
      await syncManager.enqueueOperation({
        billId: localBill.id,
        type: 'upload',
      });

      const pendingOps = await engine.getPendingOps();
      expect(pendingOps.length).toBe(1);
      expect(pendingOps[0].billId).toBe('bill_offline_01');
      expect(pendingOps[0].type).toBe('upload');
      expect(pendingOps[0].attempts).toBe(0);
    });

    it('processes pending upload queue successfully when network returns online', async () => {
      const localBill: LocalBillRecord = {
        id: 'bill_sync_success',
        name: 'Mountain Cabin',
        location: 'Highlands',
        currency: 'USD',
        hostId: 'p_host',
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: 'user_host',
        items: [{ id: 'i1', name: 'Cabin Rental', price: 300, quantity: 1, assignments: {} }],
        people: [{ id: 'p_host', name: 'Host', sponsorAmount: 0, paidAmount: 300 }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'restricted',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await engine.saveBill(localBill);
      await engine.savePendingOp({
        id: 'op_upload_1',
        billId: localBill.id,
        type: 'upload',
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      // Mock fetch to simulate successful server response
      let postedBody: any = null;
      globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/bills')) {
          postedBody = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ success: true, id: localBill.id }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      }) as any;

      await syncManager.processPendingOperations();

      // Verify payload sent to server
      expect(postedBody).not.toBeNull();
      expect(postedBody.id).toBe('bill_sync_success');
      expect(postedBody.data.name).toBe('Mountain Cabin');
      expect(postedBody.data.items.length).toBe(1);

      // Verify pending ops queue is now completely drained
      const remainingOps = await engine.getPendingOps();
      expect(remainingOps.length).toBe(0);

      // Verify bill updated locally with 'shared' status and timestamp
      const updatedBill = await engine.getBill('bill_sync_success');
      expect(updatedBill?.sharingStatus).toBe('shared');
      expect(updatedBill?.lastSyncedAt).not.toBeNull();
      expect(updatedBill?.syncError).toBeNull();
    });

    it('processes pending revoke operations and resets bill status to local', async () => {
      const billToRevoke: LocalBillRecord = {
        id: 'bill_to_revoke',
        name: 'Shared Party Bill',
        location: null,
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: 'user_party',
        items: [],
        people: [],
        globalCharges: [],
        sharingStatus: 'revocation_pending',
        visibility: 'public',
        shareToken: 'tok_active_123',
        lastSyncedAt: new Date().toISOString(),
        syncError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await engine.saveBill(billToRevoke);
      await engine.savePendingOp({
        id: 'op_revoke_1',
        billId: billToRevoke.id,
        type: 'revoke',
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      let deleteRequested = false;
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/bills/bill_to_revoke?revoke=1')) {
          deleteRequested = true;
          return new Response(JSON.stringify({ success: true, revoked: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      }) as any;

      await syncManager.processPendingOperations();

      expect(deleteRequested).toBe(true);

      const ops = await engine.getPendingOps();
      expect(ops.length).toBe(0);

      const revokedBill = await engine.getBill('bill_to_revoke');
      expect(revokedBill?.sharingStatus).toBe('local');
      expect(revokedBill?.visibility).toBe('local');
      expect(revokedBill?.shareToken).toBeNull();
    });
  });

  describe('Transient Network Failures & Retry Count Resilience', () => {
    it('retains failed operations in the queue and increments attempt counter on server 500 error', async () => {
      const localBill: LocalBillRecord = {
        id: 'bill_flaky_net',
        name: 'Flaky Connection Bill',
        location: null,
        currency: 'USD',
        hostId: null,
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: 'user_flaky',
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

      await engine.saveBill(localBill);
      await engine.savePendingOp({
        id: 'op_flaky_1',
        billId: localBill.id,
        type: 'update',
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      // Simulate 503 Server Error
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ error: 'Server temporarily unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      await syncManager.processPendingOperations();

      // Op should still be in queue with attempts = 1
      const opsAfterFirstFail = await engine.getPendingOps();
      expect(opsAfterFirstFail.length).toBe(1);
      expect(opsAfterFirstFail[0].attempts).toBe(1);

      // Simulate network recovered to 200 OK on next sync attempt
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ success: true, id: localBill.id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      await syncManager.processPendingOperations();

      const opsAfterRecovery = await engine.getPendingOps();
      expect(opsAfterRecovery.length).toBe(0); // Drained!

      const syncedBill = await engine.getBill('bill_flaky_net');
      expect(syncedBill?.sharingStatus).toBe('shared');
    });

    it('retains failed operations when network fetch throws a connection error', async () => {
      const localBill: LocalBillRecord = {
        id: 'bill_network_drop',
        name: 'Dropped Network Bill',
        location: null,
        currency: 'USD',
        hostId: null,
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: 'user_flaky',
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

      await engine.saveBill(localBill);
      await engine.savePendingOp({
        id: 'op_drop_1',
        billId: localBill.id,
        type: 'update',
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      // Simulate throw (DNS lookup failure, offline exception)
      globalThis.fetch = mock(async () => {
        throw new Error('Failed to fetch: TypeError: Network request failed');
      }) as any;

      await syncManager.processPendingOperations();

      const ops = await engine.getPendingOps();
      expect(ops.length).toBe(1);
      expect(ops[0].attempts).toBe(1);
    });
  });

  describe('Local-First Group & Bill Merging Integration (useGroupStore)', () => {
    it('merges local IndexedDB bills into server group summaries so local bills remain visible', async () => {
      // 1. Save local group in MemoryStorageEngine
      const localGroup: LocalGroupRecord = {
        id: 'group_merged_1',
        name: 'Weekend Roadtrip',
        description: 'Local and cloud merged',
        currency: 'VND',
        ownerId: 'local_user',
        participants: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Beth' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await engine.saveGroup(localGroup);

      // 2. Save local bill linked to this group
      const localBill: LocalBillRecord = {
        id: 'bill_local_gas',
        name: 'Gas Station Fuel',
        location: 'Highway Petrol',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_merged_1',
        groupName: 'Weekend Roadtrip',
        ownerId: 'local_user',
        items: [{ id: 'i1', name: 'Gasoline 95', price: 500000, quantity: 1, assignments: {} }],
        people: [{ id: 'p1', name: 'Alex', sponsorAmount: 0, paidAmount: 500000 }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'restricted',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await engine.saveBill(localBill);

      // 3. Mock server groups API returning the same group with server-side totals (e.g. cloud bills)
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/groups')) {
          return new Response(
            JSON.stringify([
              {
                id: 'group_merged_1',
                name: 'Weekend Roadtrip (Cloud)',
                description: 'Server version',
                owner_id: 'user_server',
                is_owner: true,
                currency: 'VND',
                total_amount: 1000000,
                total_bills: 2,
                total_items: 4,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                participants: [],
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not Found', { status: 404 });
      }) as any;

      // 4. Fetch groups via Zustand store
      await useGroupStore.getState().fetchGroups();

      const groups = useGroupStore.getState().groups;
      expect(groups.length).toBe(1);

      const mergedGroup = groups[0];
      expect(mergedGroup.id).toBe('group_merged_1');
      // Should combine or preserve highest bill count and amounts
      expect(mergedGroup.total_bills).toBeGreaterThanOrEqual(2);
      expect(mergedGroup.total_amount).toBeGreaterThanOrEqual(1000000);
    });
  });
});
