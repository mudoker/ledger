export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonData {
  id: string;
  name: string;
  sponsorAmount?: number;
  paidAmount?: number;
  userId?: string | null;
  email?: string | null;
}

export interface ItemData {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  assignments?: Record<string, number>;
}

export interface GlobalChargeData {
  id: string;
  name: string;
  type: string;
  amount: number;
}

export interface BillPayload {
  name?: string | null;
  location?: string | null;
  hostId?: string | null;
  qrCode?: string | null;
  currency?: string | null;
  ownerId?: string | null;
  groupId?: string | null;
  group_id?: string | null;
  people?: PersonData[];
  items?: ItemData[];
  globalCharges?: GlobalChargeData[];
  charges?: GlobalChargeData[];
}

export interface GroupItemOverview {
  id: string;
  name: string;
  price: number;
  quantity: number;
  totalPrice: number;
}

export interface GroupBillOverview {
  id: string;
  name: string;
  location: string | null;
  currency: string;
  totalAmount: number;
  created_at: string;
  updated_at: string;
  items: GroupItemOverview[];
}

export interface BillGroupDetail {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_name?: string | null;
  owner_email?: string | null;
  is_owner: boolean;
  currency: string;
  total_amount: number;
  total_bills: number;
  total_items: number;
  created_at: string;
  updated_at: string;
  bills: GroupBillOverview[];
}

export interface BillGroupSummary {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_name?: string | null;
  owner_email?: string | null;
  is_owner: boolean;
  currency: string;
  total_amount: number;
  total_bills: number;
  total_items: number;
  created_at: string;
  updated_at: string;
}

export interface SearchResults {
  groups: Array<{
    id: string;
    name: string;
    description?: string | null;
    total_amount: number;
    total_bills: number;
  }>;
  bills: Array<{
    id: string;
    name: string;
    location?: string | null;
    totalAmount: number;
    group_id?: string | null;
    group_name?: string | null;
  }>;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    bill_id: string;
    bill_name: string;
  }>;
}

export interface BillDetail {
  id: string;
  owner_id?: string | null;
  role?: 'owner' | 'participant' | 'viewer';
  isReadOnly?: boolean;
  group_id?: string | null;
  group_name?: string | null;
  data: {
    name: string | null;
    location: string | null;
    currency?: string | null;
    ownerId?: string | null;
    groupId?: string | null;
    groupName?: string | null;
    people: Array<{
      id: string;
      name: string;
      sponsorAmount: number;
      paidAmount: number;
      userId?: string | null;
      email?: string | null;
    }>;
    items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      assignments: Record<string, number>;
    }>;
    globalCharges: Array<{
      id: string;
      name: string;
      type: string;
      amount: number;
    }>;
    hostId: string | null;
    qrCode: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface BillSummary {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  location: string | null;
  totalAmount: number;
  owner_id?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  role?: 'owner' | 'participant' | 'viewer';
  is_owner?: boolean;
}

export interface DatabaseAdapter {
  readonly type: 'neon' | 'postgres' | 'sqlite';
  init(): Promise<void>;
  getBill(id: string, userId?: string | null, isShare?: boolean): Promise<BillDetail | null>;
  saveBill(billId: string, data: BillPayload, userId?: string | null): Promise<void>;
  deleteBill?(billId: string, userId?: string | null): Promise<boolean>;
  listBills(userId?: string | null): Promise<BillSummary[]>;
  createGroup?(name: string, ownerId: string, description?: string | null, currency?: string): Promise<BillGroupDetail>;
  getGroup?(id: string, userId?: string | null): Promise<BillGroupDetail | null>;
  listGroups?(userId?: string | null): Promise<BillGroupSummary[]>;
  updateGroup?(id: string, data: { name?: string; description?: string | null; currency?: string }, userId?: string | null): Promise<void>;
  deleteGroup?(id: string, userId?: string | null): Promise<boolean>;
  transferGroupOwnership?(id: string, newOwnerId: string, userId?: string | null): Promise<void>;
  transferBillOwnership?(billId: string, newOwnerId: string, userId?: string | null): Promise<void>;
  linkBillToGroup?(billId: string, groupId: string | null, userId?: string | null): Promise<void>;
  search?(query: string, userId?: string | null): Promise<SearchResults>;
  getUserByEmail?(email: string): Promise<User | null>;
  getUserById?(id: string): Promise<User | null>;
  upsertUser?(user: { id?: string; email: string; name?: string | null; avatar_url?: string | null }): Promise<User>;
  searchUsers?(query: string): Promise<Array<{ id: string; email: string; name: string | null; avatar_url: string | null }>>;
  close?(): Promise<void>;
}
