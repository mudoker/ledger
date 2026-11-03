import { getLocalDb } from './index';
import type { LocalBillRecord, PendingSyncOperation } from './types';
import { useAppSettingsStore } from '@/store/useAppSettingsStore';

class SyncManager {
  private isProcessing = false;
  private isListening = false;

  init() {
    if (this.isListening) return;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.processPendingOperations();
        this.syncAllLocalDataToCloud().catch(() => {});
      });
      this.isListening = true;
      const mode = useAppSettingsStore.getState().storageMode;
      if (mode === 'cloud' || mode === 'hybrid') {
        this.syncAllLocalDataToCloud().catch(() => {});
      }
    }
  }

  async enqueueOperation(op: Omit<PendingSyncOperation, 'id' | 'createdAt' | 'attempts'>) {
    const db = getLocalDb();
    const fullOp: PendingSyncOperation = {
      ...op,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    await db.savePendingOp(fullOp);

    // If online, attempt to process immediately
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (isOnline) {
      this.processPendingOperations();
    }
  }

  async processPendingOperations() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const db = getLocalDb();
      const ops = await db.getPendingOps();

      for (const op of ops) {
        try {
          if (op.type === 'revoke') {
            const res = await fetch(`/api/bills/${op.billId}?revoke=1`, {
              method: 'DELETE',
            });
            if (res.ok || res.status === 404) {
              await db.removePendingOp(op.id);
              const bill = await db.getBill(op.billId);
              if (bill && bill.sharingStatus === 'revocation_pending') {
                bill.sharingStatus = 'local';
                bill.visibility = 'local';
                bill.shareToken = null;
                await db.saveBill(bill);
              }
            } else {
              op.attempts += 1;
              await db.savePendingOp(op);
            }
          } else if (op.type === 'upload' || op.type === 'update') {
            const bill = await db.getBill(op.billId);
            if (!bill) {
              await db.removePendingOp(op.id);
              continue;
            }

            const effectiveVisibility = !bill.visibility || bill.visibility === 'local' ? 'restricted' : bill.visibility;
            const res = await fetch('/api/bills', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: bill.id,
                isShared: true,
                visibility: effectiveVisibility,
                shareToken: bill.shareToken,
                data: {
                  name: bill.name,
                  location: bill.location,
                  currency: bill.currency,
                  hostId: bill.hostId,
                  qrCode: bill.qrCode,
                  groupId: bill.groupId,
                  people: bill.people,
                  items: bill.items,
                  globalCharges: bill.globalCharges,
                  visibility: effectiveVisibility,
                  shareToken: bill.shareToken,
                },
              }),
            });

            if (res.ok) {
              await db.removePendingOp(op.id);
              bill.sharingStatus = 'shared';
              bill.visibility = effectiveVisibility;
              bill.lastSyncedAt = new Date().toISOString();
              bill.syncError = null;
              await db.saveBill(bill);
              // Drain any redundant upload/update operations for this bill
              const remainingOps = await db.getPendingOps();
              for (const rop of remainingOps) {
                if (rop.billId === bill.id && (rop.type === 'upload' || rop.type === 'update')) {
                  await db.removePendingOp(rop.id);
                }
              }
            } else {
              op.attempts += 1;
              await db.savePendingOp(op);
            }
          } else if (op.type === 'delete') {
            const res = await fetch(`/api/bills/${op.billId}`, {
              method: 'DELETE',
            });
            if (res.ok || res.status === 404) {
              await db.removePendingOp(op.id);
            } else {
              op.attempts += 1;
              await db.savePendingOp(op);
            }
          }
        } catch {
          op.attempts += 1;
          await db.savePendingOp(op);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async syncBillIfNeeded(bill: LocalBillRecord): Promise<void> {
    const storageMode = useAppSettingsStore.getState().storageMode;
    // Only auto-sync if mode is cloud, hybrid, or bill is explicitly marked as shared
    const shouldSync = storageMode === 'cloud' || storageMode === 'hybrid' || bill.sharingStatus === 'shared';
    if (!shouldSync) return;

    // Check online status
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      if (bill.sharingStatus === 'shared' || storageMode === 'cloud' || storageMode === 'hybrid') {
        await this.enqueueOperation({
          billId: bill.id,
          type: 'update',
        });
      }
      return;
    }

    const effectiveVisibility = !bill.visibility || bill.visibility === 'local' ? 'restricted' : bill.visibility;
    try {
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: bill.id,
          isShared: true,
          visibility: effectiveVisibility,
          shareToken: bill.shareToken,
          data: {
            name: bill.name,
            location: bill.location,
            currency: bill.currency,
            hostId: bill.hostId,
            qrCode: bill.qrCode,
            groupId: bill.groupId,
            people: bill.people,
            items: bill.items,
            globalCharges: bill.globalCharges,
            visibility: effectiveVisibility,
            shareToken: bill.shareToken,
          },
        }),
      });

      const db = getLocalDb();
      if (res.ok) {
        bill.sharingStatus = 'shared';
        bill.visibility = effectiveVisibility;
        bill.lastSyncedAt = new Date().toISOString();
        bill.syncError = null;
        await db.saveBill(bill);
      } else {
        bill.syncError = 'Failed to sync with cloud';
        await db.saveBill(bill);
      }
    } catch (e: any) {
      const db = getLocalDb();
      bill.syncError = e.message || 'Network error syncing with cloud';
      await db.saveBill(bill);
      await this.enqueueOperation({
        billId: bill.id,
        type: 'update',
      });
    }
  }

  /**
   * Synchronizes all existing local groups and bills to the cloud when transitioning
   * to 'cloud' or 'hybrid' mode, without wiping localDb data, and clears any stale 'Local' badges.
   */
  async syncAllLocalDataToCloud(): Promise<void> {
    const storageMode = useAppSettingsStore.getState().storageMode;
    if (storageMode !== 'cloud' && storageMode !== 'hybrid') return;

    const db = getLocalDb();
    const [pendingOps, localGroups, localBills] = await Promise.all([
      db.getPendingOps().catch(() => []),
      db.listGroups().catch(() => []),
      db.listBills().catch(() => []),
    ]);

    const pendingDeleteIds = new Set(
      pendingOps.filter(op => op.type === 'delete').map(op => op.billId)
    );
    const pendingRevokeIds = new Set(
      pendingOps.filter(op => op.type === 'revoke').map(op => op.billId)
    );

    const billsToSync = localBills.filter(
      b =>
        !pendingDeleteIds.has(b.id) &&
        !pendingRevokeIds.has(b.id) &&
        b.sharingStatus !== 'revocation_pending' &&
        (b.sharingStatus !== 'shared' || !b.lastSyncedAt || b.visibility === 'local')
    );

    // Also update in-memory stores immediately so UI badges update without delay
    let hasStoreLocalItems = false;
    try {
      const { useBillStore } = await import('@/store/useBillStore');
      const { useGroupStore } = await import('@/store/useGroupStore');

      const billState = useBillStore.getState();
      if (
        billState.sharingStatus === 'local' ||
        billState.visibility === 'local' ||
        billState.billHistory.some(b => b.sharingStatus === 'local' || b.visibility === 'local')
      ) {
        hasStoreLocalItems = true;
        useBillStore.setState(s => ({
          sharingStatus: s.sharingStatus === 'local' ? 'shared' : s.sharingStatus,
          visibility: s.visibility === 'local' ? 'restricted' : s.visibility,
          billHistory: s.billHistory.map(b =>
            b.sharingStatus === 'revocation_pending'
              ? b
              : {
                  ...b,
                  sharingStatus: 'shared',
                  visibility: !b.visibility || b.visibility === 'local' ? 'restricted' : b.visibility,
                }
          ),
        }));
      }

      const groupState = useGroupStore.getState();
      if (groupState.currentGroup?.bills?.some(b => b.isLocal)) {
        hasStoreLocalItems = true;
        const curGroup = groupState.currentGroup;
        const localBillsOnServer = curGroup.bills.filter(b => b.isLocal);
        useGroupStore.setState({
          currentGroup: {
            ...curGroup,
            bills: curGroup.bills.map(b => ({ ...b, isLocal: false })),
          },
        });
        if (curGroup.is_owner && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          for (const lb of localBillsOnServer) {
            fetch(`/api/bills/${lb.id}/share`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ visibility: curGroup.visibility || 'public' }),
            }).catch(() => {});
          }
        }
      }
    } catch {}

    if (
      pendingOps.length === 0 &&
      localGroups.length === 0 &&
      billsToSync.length === 0 &&
      !hasStoreLocalItems
    ) {
      return;
    }

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      for (const bill of billsToSync) {
        const effectiveVis = !bill.visibility || bill.visibility === 'local' ? 'restricted' : bill.visibility;
        bill.sharingStatus = 'shared';
        bill.visibility = effectiveVis;
        await db.saveBill(bill);
        await this.enqueueOperation({
          billId: bill.id,
          type: 'update',
        });
      }
      return;
    }

    if (pendingOps.length > 0) {
      await this.processPendingOperations();
    }

    // 1. Sync local groups to cloud (preserving group IDs)
    for (const lg of localGroups) {
      try {
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: lg.id,
            name: lg.name,
            description: lg.description,
            currency: lg.currency || 'VND',
            visibility: lg.visibility || 'public',
            participants: lg.participants || [],
          }),
        });
        if (res.ok) {
          const serverGroup = await res.json().catch(() => null);
          if (serverGroup && serverGroup.owner_id && (!lg.ownerId || lg.ownerId === 'local')) {
            lg.ownerId = serverGroup.owner_id;
            await db.saveGroup(lg);
          }
        }
      } catch {}
    }

    // 2. Sync local bills to cloud and mark them as shared in localDb
    for (const bill of billsToSync) {
      const effectiveVisibility = !bill.visibility || bill.visibility === 'local' ? 'restricted' : bill.visibility;
      try {
        const res = await fetch('/api/bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: bill.id,
            isShared: true,
            visibility: effectiveVisibility,
            shareToken: bill.shareToken,
            data: {
              name: bill.name,
              location: bill.location,
              currency: bill.currency,
              hostId: bill.hostId,
              qrCode: bill.qrCode,
              groupId: bill.groupId,
              people: bill.people,
              items: bill.items,
              globalCharges: bill.globalCharges,
              visibility: effectiveVisibility,
              shareToken: bill.shareToken,
            },
          }),
        });
        if (res.ok) {
          bill.sharingStatus = 'shared';
          bill.visibility = effectiveVisibility;
          bill.lastSyncedAt = new Date().toISOString();
          bill.syncError = null;
          await db.saveBill(bill);
        }
      } catch {
        await this.enqueueOperation({
          billId: bill.id,
          type: 'update',
        });
      }
    }
  }
}

export const syncManager = new SyncManager();

export class SyncCoordinator {
  private activeUploads = new Set<string>();
  private pendingRetries = new Set<string>();

  /**
   * Schedules an asynchronous, background upload for a bill with trailing coalescing.
   * Guarantees:
   * 1. Only one upload runs at a time for a given bill (no out-of-order race conditions).
   * 2. If rapid edits occur while an upload is in flight, a trailing upload executes with the freshest snapshot.
   * 3. Completely non-blocking on the UI thread (0ms delay, zero jitter).
   */
  scheduleSync(billId: string, runUpload: () => Promise<void>): void {
    if (this.activeUploads.has(billId)) {
      this.pendingRetries.add(billId);
      return;
    }

    this.activeUploads.add(billId);
    this.pendingRetries.delete(billId);

    // Run non-blocking background queue
    (async () => {
      try {
        while (true) {
          await runUpload();
          if (this.pendingRetries.has(billId)) {
            this.pendingRetries.delete(billId);
            // Run again to sync the freshest state that was saved during previous upload
            continue;
          }
          break;
        }
      } catch (e) {
        console.warn(`[SyncCoordinator] Unexpected error during sync of bill ${billId}:`, e);
      } finally {
        this.activeUploads.delete(billId);
        this.pendingRetries.delete(billId);
      }
    })();
  }

  isSyncing(billId: string): boolean {
    return this.activeUploads.has(billId);
  }
}

export const syncCoordinator = new SyncCoordinator();

