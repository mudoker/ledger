import { StorageEngine, IndexedDbEngine, MemoryStorageEngine } from './storage-engine';

let localDbInstance: StorageEngine | null = null;

export function getLocalDb(): StorageEngine {
  if (localDbInstance) return localDbInstance;

  // Check if browser environment with IndexedDB support
  if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') {
    try {
      localDbInstance = new IndexedDbEngine();
      return localDbInstance;
    } catch {
      // Fallback if IndexedDB cannot be instantiated
      localDbInstance = new MemoryStorageEngine();
      return localDbInstance;
    }
  }

  // Node/Bun/SSR environment
  localDbInstance = new MemoryStorageEngine();
  return localDbInstance;
}

export function setLocalDb(customEngine: StorageEngine) {
  localDbInstance = customEngine;
}

export * from './types';
export * from './storage-engine';
