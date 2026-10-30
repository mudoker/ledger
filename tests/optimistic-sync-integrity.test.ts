import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { MemoryStorageEngine } from '../src/lib/local-db/storage-engine';
import { setLocalDb } from '../src/lib/local-db';
import { syncManager, SyncCoordinator, syncCoordinator } from '../src/lib/local-db/sync-manager';
import { useAppSettingsStore } from '../src/store/useAppSettingsStore';
import { useBillStore } from '../src/store/useBillStore';
import { useGroupStore } from '../src/store/useGroupStore';
import type { LocalBillRecord } from '../src/lib/local-db/types';

describe('Optimistic Background Sync & Local-Cloud Data Integrity Suite', () => {
  let engine: MemoryStorageEngine;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    (globalThis as any).window = {
      location: { href: 'http://localhost/' },
      history: { replaceState: () => {} },
    };
    engine = new MemoryStorageEngine();
    await engine.init();
    setLocalDb(engine);

    useAppSettingsStore.setState({ storageMode: 'cloud' });
    useBillStore.setState({
      people: [],
      items: [],
      globalCharges: [],
      hostId: null,
      isReadOnly: false,
      isHydrated: true,
      currentBillId: null,
      lastSaved: null,
      isSaving: false,
      billHistory: [],
      billName: '',
      location: '',
      qrCode: null,
      currency: 'VND',
      groupId: null,
      groupName: null,
      sharingStatus: 'local',
      visibility: 'restricted',
      shareToken: null,
      syncError: null,
    });
    useGroupStore.setState({
      groups: [],
      currentGroup: null,
      isLoading: false,
      error: null,
    });

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('SyncCoordinator Serialized Execution & Trailing Coalescing', () => {
    it('executes only one upload at a time and syncs freshest state on trailing pass', async () => {
      const coordinator = new SyncCoordinator();
      const executionLog: string[] = [];
      let currentState = 'State A';

      let resolveFirstUpload: () => void = () => {};
      const firstUploadPromise = new Promise<void>((resolve) => {
        resolveFirstUpload = resolve;
      });

      // 1. First trigger
      coordinator.scheduleSync('bill_1', async () => {
        const stateAtStart = currentState;
        executionLog.push(`Start: ${stateAtStart}`);
        if (stateAtStart === 'State A') {
          await firstUploadPromise;
        }
        executionLog.push(`Done: ${stateAtStart}`);
      });

      expect(coordinator.isSyncing('bill_1')).toBe(true);

      // 2. While first upload is in flight, state updates to 'State B' and 'State C'
      currentState = 'State B';
      coordinator.scheduleSync('bill_1', async () => {});

      currentState = 'State C';
      coordinator.scheduleSync('bill_1', async () => {
        const stateAtStart = currentState;
        executionLog.push(`Start: ${stateAtStart}`);
        executionLog.push(`Done: ${stateAtStart}`);
      });

      // Finish first upload
      resolveFirstUpload();

      // Wait a moment for background loop to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(coordinator.isSyncing('bill_1')).toBe(false);
      // Verify sequence: Start A -> Done A -> Start C -> Done C (State B was superseded by freshest State C)
      expect(executionLog).toEqual([
        'Start: State A',
        'Done: State A',
        'Start: State C',
        'Done: State C',
      ]);
    });
  });

  describe('saveToDb() Optimistic Writes & Background Cloud Recovery', () => {
    it('writes immediately to local storage without blocking and enqueues update on network failure', async () => {
      // Mock fetch to simulate network drop
      globalThis.fetch = mock(async () => {
        throw new Error('Network timeout');
      }) as any;

      useBillStore.setState({
        billName: 'Optimistic Dinner',
        items: [{ id: 'i1', name: 'Hotpot', price: 200000, quantity: 1, assignments: {} }],
        people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 200000 }],
        currentBillId: 'bill_opt_1',
      });

      // saveToDb() returns billId immediately (0ms blocking)
      const billId = await useBillStore.getState().saveToDb();
      expect(billId).toBe('bill_opt_1');

      // Check local storage has the bill immediately
      const savedLocal = await engine.getBill('bill_opt_1');
      expect(savedLocal).not.toBeNull();
      expect(savedLocal?.name).toBe('Optimistic Dinner');

      // Wait for background worker
      await new Promise((r) => setTimeout(r, 60));

      // Verify that failure was recorded in syncError and enqueued into syncManager
      const pendingOps = await engine.getPendingOps();
      expect(pendingOps.length).toBe(1);
      expect(pendingOps[0].billId).toBe('bill_opt_1');
      expect(pendingOps[0].type).toBe('update');

      // Local bill reflects sync error
      const billWithErr = await engine.getBill('bill_opt_1');
      expect(billWithErr?.syncError).toContain('Network timeout');
    });

    it('drains the queue and clears syncError once online connection succeeds', async () => {
      const localBill: LocalBillRecord = {
        id: 'bill_drain_1',
        name: 'Lunch Combo',
        location: null,
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: null,
        items: [{ id: 'i1', name: 'Pho', price: 50000, quantity: 1, assignments: {} }],
        people: [{ id: 'p1', name: 'Bob', sponsorAmount: 0, paidAmount: 50000 }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'restricted',
        shareToken: null,
        lastSyncedAt: null,
        syncError: 'Previous network failure',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await engine.saveBill(localBill);
      await engine.savePendingOp({
        id: 'op_update_drain',
        billId: 'bill_drain_1',
        type: 'update',
        createdAt: new Date().toISOString(),
        attempts: 1,
      });

      // Server is back online
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/bills')) {
          return new Response(JSON.stringify({ success: true, id: 'bill_drain_1' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      await syncManager.processPendingOperations();

      // Pending ops drained
      const remainingOps = await engine.getPendingOps();
      expect(remainingOps.length).toBe(0);

      // Bill status updated to shared and syncError cleared
      const updated = await engine.getBill('bill_drain_1');
      expect(updated?.sharingStatus).toBe('shared');
      expect(updated?.syncError).toBeNull();
      expect(updated?.lastSyncedAt).not.toBeNull();
    });
  });

  describe('fetchBill() SWR Protection Against Stale Cloud Overwrite', () => {
    it('does NOT overwrite local changes with server data if local has pending unsynced operations', async () => {
      const localBill: LocalBillRecord = {
        id: 'bill_swr_protect',
        name: 'Fresh Local Edits (Unsynced)',
        location: 'Local Cafe',
        currency: 'USD',
        hostId: null,
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: null,
        items: [{ id: 'i1', name: 'Latte', price: 6, quantity: 2, assignments: {} }],
        people: [{ id: 'p1', name: 'Carol', sponsorAmount: 0, paidAmount: 12 }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'restricted',
        shareToken: null,
        lastSyncedAt: '2026-10-30T10:00:00.000Z',
        syncError: 'Offline: pending sync',
        createdAt: '2026-10-30T10:00:00.000Z',
        updatedAt: '2026-10-30T10:05:00.000Z',
      };
      await engine.saveBill(localBill);

      // Local has a pending unsynced update
      await engine.savePendingOp({
        id: 'op_swr_1',
        billId: 'bill_swr_protect',
        type: 'update',
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      // Server returns stale or newer timestamp data from before or parallel
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            id: 'bill_swr_protect',
            updated_at: '2026-10-30T10:10:00.000Z', // Even if server timestamp is later
            data: {
              name: 'Stale Server Version',
              location: 'Old Cloud Cafe',
              items: [{ id: 'i1', name: 'Old Coffee', price: 4, quantity: 1, assignments: {} }],
              people: [{ id: 'p1', name: 'Carol', sponsorAmount: 0, paidAmount: 4 }],
              globalCharges: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      await useBillStore.getState().fetchBill('bill_swr_protect');

      // Local edits must NOT be overwritten!
      const currentStore = useBillStore.getState();
      expect(currentStore.billName).toBe('Fresh Local Edits (Unsynced)');
      expect(currentStore.location).toBe('Local Cafe');
      expect(currentStore.items[0].name).toBe('Latte');
    });
  });

  describe('deleteBill() Offline Resilience & Ghost Prevention', () => {
    it('enqueues delete operation when server DELETE fails and filters out ghost bill from fetchHistory', async () => {
      const localBill: LocalBillRecord = {
        id: 'bill_to_delete_offline',
        name: 'Doomed Bill',
        location: null,
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: null,
        items: [],
        people: [],
        globalCharges: [],
        sharingStatus: 'shared',
        visibility: 'restricted',
        shareToken: null,
        lastSyncedAt: new Date().toISOString(),
        syncError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await engine.saveBill(localBill);

      // Server DELETE fails (offline)
      globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';
        if (method === 'DELETE') {
          throw new Error('Offline: failed to connect to server');
        }
        if (url.includes('/api/bills')) {
          // Server still knows about the doomed bill
          return new Response(
            JSON.stringify([
              {
                id: 'bill_to_delete_offline',
                name: 'Doomed Bill (Ghost on Server)',
                updated_at: new Date().toISOString(),
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      // Delete the bill
      const success = await useBillStore.getState().deleteBill('bill_to_delete_offline');
      expect(success).toBe(true);

      // Local DB no longer has it
      const deletedLocal = await engine.getBill('bill_to_delete_offline');
      expect(deletedLocal).toBeNull();

      // Pending delete operation was enqueued
      const pendingOps = await engine.getPendingOps();
      const deleteOp = pendingOps.find((op) => op.billId === 'bill_to_delete_offline');
      expect(deleteOp).toBeDefined();
      expect(deleteOp?.type).toBe('delete');

      // fetchHistory() must NOT resurrect the doomed bill
      await useBillStore.getState().fetchHistory();
      const history = useBillStore.getState().billHistory;
      expect(history.some((b) => b.id === 'bill_to_delete_offline')).toBe(false);

      // When syncManager processes pending ops with server back online:
      let deleteCalledOnServer = false;
      globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';
        if (url.includes('/api/bills/bill_to_delete_offline') && method === 'DELETE') {
          deleteCalledOnServer = true;
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      await syncManager.processPendingOperations();
      expect(deleteCalledOnServer).toBe(true);

      const remainingOps = await engine.getPendingOps();
      expect(remainingOps.some((op) => op.billId === 'bill_to_delete_offline')).toBe(false);
    });
  });
});
