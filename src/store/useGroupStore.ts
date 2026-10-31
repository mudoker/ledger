import { create } from 'zustand';
import type { BillGroupSummary, BillGroupDetail } from '@/../db/types';
import { getLocalDb } from '@/lib/local-db';
import type { LocalGroupRecord } from '@/lib/local-db/types';

interface GroupState {
  groups: BillGroupSummary[];
  currentGroup: BillGroupDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchGroups: () => Promise<void>;
  fetchGroup: (id: string) => Promise<BillGroupDetail | null>;
  createGroup: (name: string, description?: string | null, currency?: string) => Promise<BillGroupDetail>;
  updateGroup: (id: string, data: { name?: string; description?: string | null; currency?: string }) => Promise<void>;
  deleteGroup: (id: string) => Promise<boolean>;
  transferOwnership: (id: string, newOwnerId: string) => Promise<boolean>;
  clearCurrentGroup: () => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroup: null,
  isLoading: false,
  error: null,

  fetchGroups: async () => {
    set({ isLoading: true, error: null });
    const groupMap = new Map<string, BillGroupSummary>();

    // 1. Load local groups
    try {
      const localDb = getLocalDb();
      const localGroups = await localDb.listGroups();
      const localBills = await localDb.listBills();

      for (const lg of localGroups) {
        const linkedBills = localBills.filter((b) => b.groupId === lg.id);
        const totalAmount = linkedBills.reduce((sum, b) => {
          const subtotal = b.items.reduce((s, i) => s + i.price * i.quantity, 0);
          return sum + subtotal;
        }, 0);
        const totalItems = linkedBills.reduce((sum, b) => sum + b.items.length, 0);

        groupMap.set(lg.id, {
          id: lg.id,
          name: lg.name,
          description: lg.description,
          owner_id: lg.ownerId || 'local',
          is_owner: true,
          currency: lg.currency,
          total_amount: totalAmount,
          total_bills: linkedBills.length,
          total_items: totalItems,
          created_at: lg.createdAt,
          updated_at: lg.updatedAt,
        });
      }
    } catch (e) {
      console.warn('Failed to load local groups:', e);
    }

    // 2. Fetch server groups and merge
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const serverGroups: BillGroupSummary[] = await res.json();
        for (const sg of serverGroups) {
          groupMap.set(sg.id, sg);
        }
      }
    } catch (e: unknown) {
      if (groupMap.size === 0) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch groups';
        set({ error: msg, isLoading: false, groups: [] });
        return;
      }
    }

    set({ groups: Array.from(groupMap.values()), isLoading: false });
  },

  fetchGroup: async (id: string) => {
    set({ isLoading: true, error: null });

    // 1. Try server fetch first
    try {
      const res = await fetch(`/api/groups/${id}`);
      if (res.ok) {
        const data = await res.json();
        set({ currentGroup: data, isLoading: false });
        return data;
      }
    } catch {
      // Offline fallback
    }

    // 2. Local fallback
    try {
      const localDb = getLocalDb();
      const lg = await localDb.getGroup(id);
      if (lg) {
        const localBills = await localDb.listBills();
        const linkedBills = localBills.filter((b) => b.groupId === lg.id);
        const totalAmount = linkedBills.reduce((sum, b) => {
          const subtotal = b.items.reduce((s, i) => s + i.price * i.quantity, 0);
          return sum + subtotal;
        }, 0);
        const totalItems = linkedBills.reduce((sum, b) => sum + b.items.length, 0);

        const groupDetail: BillGroupDetail = {
          id: lg.id,
          name: lg.name,
          description: lg.description,
          owner_id: lg.ownerId || 'local',
          is_owner: true,
          currency: lg.currency,
          total_amount: totalAmount,
          total_bills: linkedBills.length,
          total_items: totalItems,
          created_at: lg.createdAt,
          updated_at: lg.updatedAt,
          bills: linkedBills.map((b) => ({
            id: b.id,
            name: b.name,
            location: b.location,
            currency: b.currency,
            totalAmount: b.items.reduce((s, i) => s + i.price * i.quantity, 0),
            created_at: b.createdAt,
            updated_at: b.updatedAt,
            items: b.items.map((i) => ({
              id: i.id,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              totalPrice: i.price * i.quantity,
              assignments: i.assignments,
            })),
          })),
        };
        set({ currentGroup: groupDetail, isLoading: false });
        return groupDetail;
      }
    } catch (e) {
      console.warn('Local group fallback failed:', e);
    }

    set({ error: 'Group not found', isLoading: false, currentGroup: null });
    return null;
  },

  createGroup: async (name: string, description: string | null = null, currency: string = 'VND') => {
    set({ isLoading: true, error: null });
    const localDb = getLocalDb();
    const newId = crypto.randomUUID();

    const localGroup: LocalGroupRecord = {
      id: newId,
      name,
      description,
      currency,
      ownerId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to local storage
    await localDb.saveGroup(localGroup);

    // Try cloud sync if online
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, currency }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error || 'Failed to create group';
        set({ error: msg, isLoading: false });
        throw new Error(msg);
      }
      const serverGroup = await res.json();
      // Update local group with server ID if different
      await localDb.deleteGroup(newId);
      await localDb.saveGroup({
        ...localGroup,
        id: serverGroup.id,
        ownerId: serverGroup.owner_id,
      });
      await get().fetchGroups();
      set({ currentGroup: serverGroup, isLoading: false });
      return serverGroup;
    } catch (e: unknown) {
      if (e instanceof Error && !e.message.toLowerCase().includes('failed to fetch') && !e.message.toLowerCase().includes('networkerror')) {
        set({ error: e.message, isLoading: false });
        throw e;
      }
      // If server unreachable / network failure, use local group fallback
    }

    const fallbackDetail: BillGroupDetail = {
      id: localGroup.id,
      name: localGroup.name,
      description: localGroup.description,
      owner_id: 'local',
      is_owner: true,
      currency: localGroup.currency,
      total_amount: 0,
      total_bills: 0,
      total_items: 0,
      created_at: localGroup.createdAt,
      updated_at: localGroup.updatedAt,
      bills: [],
    };

    await get().fetchGroups();
    set({ currentGroup: fallbackDetail, isLoading: false });
    return fallbackDetail;
  },

  updateGroup: async (id: string, data) => {
    set({ isLoading: true, error: null });

    // Update local copy
    try {
      const localDb = getLocalDb();
      const lg = await localDb.getGroup(id);
      if (lg) {
        await localDb.saveGroup({
          ...lg,
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Failed to update local group:', e);
    }

    // Try cloud update
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        set((state) => ({
          currentGroup: state.currentGroup?.id === id ? { ...state.currentGroup, ...updated } : state.currentGroup,
          groups: state.groups.map((g) => (g.id === id ? { ...g, ...updated } : g)),
          isLoading: false,
        }));
        return;
      }
    } catch {
      // Offline
    }

    set((state) => ({
      currentGroup: state.currentGroup?.id === id ? { ...state.currentGroup, ...data } : state.currentGroup,
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...data } : g)),
      isLoading: false,
    }));
  },

  deleteGroup: async (id: string) => {
    set({ isLoading: true, error: null });
    const localDb = getLocalDb();
    await localDb.deleteGroup(id);

    try {
      await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    } catch {
      // Offline deletion
    }

    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
      currentGroup: state.currentGroup?.id === id ? null : state.currentGroup,
      isLoading: false,
    }));
    return true;
  },

  transferOwnership: async (id: string, newOwnerId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/groups/${id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_owner_id: newOwnerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to transfer ownership');
      }
      await get().fetchGroup(id);
      await get().fetchGroups();
      set({ isLoading: false });
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to transfer ownership';
      set({ error: msg, isLoading: false });
      throw e;
    }
  },

  clearCurrentGroup: () => set({ currentGroup: null }),
}));
