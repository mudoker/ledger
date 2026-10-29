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
      });
      this.isListening = true;
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

            const res = await fetch('/api/bills', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: bill.id,
                isShared: true,
                visibility: bill.visibility,
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
                  visibility: bill.visibility,
                  shareToken: bill.shareToken,
                },
              }),
            });

            if (res.ok) {
              await db.removePendingOp(op.id);
              bill.sharingStatus = 'shared';
              bill.lastSyncedAt = new Date().toISOString();
              bill.syncError = null;
              await db.saveBill(bill);
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

    try {
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: bill.id,
          isShared: true,
          visibility: bill.visibility,
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
            visibility: bill.visibility,
            shareToken: bill.shareToken,
          },
        }),
      });

      const db = getLocalDb();
      if (res.ok) {
        bill.sharingStatus = 'shared';
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
}

export const syncManager = new SyncManager();
