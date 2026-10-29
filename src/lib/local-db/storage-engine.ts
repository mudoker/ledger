import type { LocalBillRecord, LocalGroupRecord, PendingSyncOperation } from './types';

export interface StorageEngine {
  init(): Promise<void>;
  getBill(id: string): Promise<LocalBillRecord | null>;
  saveBill(bill: LocalBillRecord): Promise<void>;
  listBills(ownerId?: string | null): Promise<LocalBillRecord[]>;
  deleteBill(id: string): Promise<boolean>;

  getGroup(id: string): Promise<LocalGroupRecord | null>;
  saveGroup(group: LocalGroupRecord): Promise<void>;
  listGroups(ownerId?: string | null): Promise<LocalGroupRecord[]>;
  deleteGroup(id: string): Promise<boolean>;

  getPendingOps(): Promise<PendingSyncOperation[]>;
  savePendingOp(op: PendingSyncOperation): Promise<void>;
  removePendingOp(id: string): Promise<void>;

  clear(): Promise<void>;
}

export class MemoryStorageEngine implements StorageEngine {
  private bills = new Map<string, LocalBillRecord>();
  private groups = new Map<string, LocalGroupRecord>();
  private pendingOps = new Map<string, PendingSyncOperation>();

  async init(): Promise<void> {}

  async getBill(id: string): Promise<LocalBillRecord | null> {
    return this.bills.get(id) || null;
  }

  async saveBill(bill: LocalBillRecord): Promise<void> {
    this.bills.set(bill.id, typeof structuredClone === 'function' ? structuredClone(bill) : JSON.parse(JSON.stringify(bill)));
  }

  async listBills(ownerId?: string | null): Promise<LocalBillRecord[]> {
    let all = Array.from(this.bills.values());
    if (ownerId) {
      all = all.filter((b) => !b.ownerId || b.ownerId === ownerId);
    }
    return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async deleteBill(id: string): Promise<boolean> {
    return this.bills.delete(id);
  }

  async getGroup(id: string): Promise<LocalGroupRecord | null> {
    return this.groups.get(id) || null;
  }

  async saveGroup(group: LocalGroupRecord): Promise<void> {
    this.groups.set(group.id, typeof structuredClone === 'function' ? structuredClone(group) : JSON.parse(JSON.stringify(group)));
  }

  async listGroups(ownerId?: string | null): Promise<LocalGroupRecord[]> {
    const all = Array.from(this.groups.values());
    if (ownerId) {
      return all.filter((g) => !g.ownerId || g.ownerId === ownerId);
    }
    return all;
  }

  async deleteGroup(id: string): Promise<boolean> {
    return this.groups.delete(id);
  }

  async getPendingOps(): Promise<PendingSyncOperation[]> {
    return Array.from(this.pendingOps.values());
  }

  async savePendingOp(op: PendingSyncOperation): Promise<void> {
    this.pendingOps.set(op.id, { ...op });
  }

  async removePendingOp(id: string): Promise<void> {
    this.pendingOps.delete(id);
  }

  async clear(): Promise<void> {
    this.bills.clear();
    this.groups.clear();
    this.pendingOps.clear();
  }
}

const DB_NAME = 'ledger_local_db';
const DB_VERSION = 1;

export class IndexedDbEngine implements StorageEngine {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDB is not supported in this environment');
    }

    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('bills')) {
          db.createObjectStore('bills', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('groups')) {
          db.createObjectStore('groups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pending_ops')) {
          db.createObjectStore('pending_ops', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  private getStore(storeName: 'bills' | 'groups' | 'pending_ops', mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async getBill(id: string): Promise<LocalBillRecord | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('bills', 'readonly');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async saveBill(bill: LocalBillRecord): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('bills', 'readwrite');
      const req = store.put(bill);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async listBills(ownerId?: string | null): Promise<LocalBillRecord[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('bills', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => {
        let all: LocalBillRecord[] = req.result || [];
        if (ownerId) {
          all = all.filter((b) => !b.ownerId || b.ownerId === ownerId);
        }
        resolve(all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteBill(id: string): Promise<boolean> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('bills', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getGroup(id: string): Promise<LocalGroupRecord | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('groups', 'readonly');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async saveGroup(group: LocalGroupRecord): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('groups', 'readwrite');
      const req = store.put(group);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async listGroups(ownerId?: string | null): Promise<LocalGroupRecord[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('groups', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => {
        const all: LocalGroupRecord[] = req.result || [];
        if (ownerId) {
          resolve(all.filter((g) => !g.ownerId || g.ownerId === ownerId));
        } else {
          resolve(all);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteGroup(id: string): Promise<boolean> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('groups', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingOps(): Promise<PendingSyncOperation[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('pending_ops', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async savePendingOp(op: PendingSyncOperation): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('pending_ops', 'readwrite');
      const req = store.put(op);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async removePendingOp(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore('pending_ops', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(['bills', 'groups', 'pending_ops'], 'readwrite');
      tx.objectStore('bills').clear();
      tx.objectStore('groups').clear();
      tx.objectStore('pending_ops').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
