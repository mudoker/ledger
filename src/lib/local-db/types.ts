export type BillSharingStatus =
  | 'local'               // Only on this device
  | 'uploading'           // Upload in progress
  | 'shared'              // Active cloud copy on server
  | 'revoking'            // Revocation in progress
  | 'revocation_pending'  // Offline; will revoke upon reconnect
  | 'sync_error';         // Sync error; retryable

export type BillVisibility = 'local' | 'restricted' | 'public';

export interface LocalPerson {
  id: string;
  name: string;
  sponsorAmount: number;
  paidAmount: number;
  userId?: string | null;
  email?: string | null;
}

export interface LocalItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  assignments: Record<string, number>;
}

export interface LocalGlobalCharge {
  id: string;
  name: string;
  type: 'fixed' | 'percent';
  amount: number;
}

export interface LocalBillRecord {
  id: string;
  name: string;
  location: string | null;
  currency: string;
  hostId: string | null;
  qrCode: string | null;
  groupId: string | null;
  groupName: string | null;
  ownerId: string | null;
  people: LocalPerson[];
  items: LocalItem[];
  globalCharges: LocalGlobalCharge[];
  sharingStatus: BillSharingStatus;
  visibility: BillVisibility;
  shareToken: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalGroupRecord {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  ownerId: string | null;
  participants?: LocalPerson[];
  createdAt: string;
  updatedAt: string;
}

export interface PendingSyncOperation {
  id: string;
  billId: string;
  type: 'upload' | 'update' | 'revoke' | 'delete';
  payload?: any;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
}
