import { create } from 'zustand';
import type { BillGroupSummary, BillGroupDetail } from '@/../db/types';
import { getLocalDb } from '@/lib/local-db';
import type { LocalGroupRecord, LocalPerson } from '@/lib/local-db/types';

interface GroupState {
  groups: BillGroupSummary[];
  currentGroup: BillGroupDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchGroups: () => Promise<void>;
  fetchGroup: (id: string) => Promise<BillGroupDetail | null>;
  createGroup: (name: string, description?: string | null, currency?: string) => Promise<BillGroupDetail>;
  updateGroup: (id: string, data: { name?: string; description?: string | null; currency?: string; participants?: any[] }) => Promise<void>;
  deleteGroup: (id: string) => Promise<boolean>;
  transferOwnership: (id: string, newOwnerId: string) => Promise<boolean>;
  addGroupParticipant: (groupId: string, name: string, email?: string | null) => Promise<void>;
  removeGroupParticipant: (groupId: string, participantId: string) => Promise<void>;
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
          participants: lg.participants || [],
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
        const localDb = getLocalDb();
        const localBills = await localDb.listBills().catch(() => []);

        for (const sg of serverGroups) {
          const linkedLocalBills = localBills.filter((b) => b.groupId === sg.id);
          const localEntry = groupMap.get(sg.id);
          const finalTotalBills = Math.max(sg.total_bills, linkedLocalBills.length, localEntry?.total_bills || 0);
          const finalTotalAmount = Math.max(sg.total_amount, localEntry?.total_amount || 0);
          groupMap.set(sg.id, {
            ...sg,
            total_bills: finalTotalBills,
            total_amount: finalTotalAmount,
            participants: (sg as any).participants || (localEntry as any)?.participants || [],
          });
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
    let serverGroup: BillGroupDetail | null = null;
    try {
      const res = await fetch(`/api/groups/${id}`);
      if (res.ok) {
        serverGroup = await res.json();
      }
    } catch {
      // Offline fallback
    }

    // 2. Load local group and bills
    const localDb = getLocalDb();
    const lg = await localDb.getGroup(id).catch(() => null);
    const localBills = await localDb.listBills().catch(() => []);
    const linkedLocalBills = localBills.filter((b) => b.groupId === id || (b as any).group_id === id);

    if (serverGroup) {
      if (!serverGroup.bills) {
        serverGroup.bills = [];
      }
      // Merge local bills linked to this group so they are always listed on enter!
      const existingBillIds = new Set(serverGroup.bills.map((b) => b.id));
      for (const lb of linkedLocalBills) {
        if (!existingBillIds.has(lb.id)) {
          const lbItems = lb.items || [];
          const totalAmount = lbItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
          serverGroup.bills.push({
            id: lb.id,
            name: lb.name,
            location: lb.location,
            currency: lb.currency,
            totalAmount,
            created_at: lb.createdAt,
            updated_at: lb.updatedAt,
            items: lbItems.map((i) => ({
              id: i.id,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              totalPrice: i.price * i.quantity,
              assignments: i.assignments,
            })),
            isLocal: true,
          } as any);
        }
      }

      serverGroup.total_bills = serverGroup.bills.length;
      serverGroup.total_amount = serverGroup.bills.reduce((sum, b) => sum + b.totalAmount, 0);
      serverGroup.total_items = serverGroup.bills.reduce((sum, b) => sum + b.items.length, 0);

      if ((lg as any)?.participants?.length && !(serverGroup as any).participants?.length) {
        (serverGroup as any).participants = (lg as any).participants;
      }

      set({ currentGroup: serverGroup, isLoading: false });
      return serverGroup;
    }

    // 2. Local fallback
    if (lg) {
      const totalAmount = linkedLocalBills.reduce((sum, b) => {
        const subtotal = b.items.reduce((s, i) => s + i.price * i.quantity, 0);
        return sum + subtotal;
      }, 0);
      const totalItems = linkedLocalBills.reduce((sum, b) => sum + b.items.length, 0);

      const groupDetail: BillGroupDetail = {
        id: lg.id,
        name: lg.name,
        description: lg.description,
        owner_id: lg.ownerId || 'local',
        is_owner: true,
        currency: lg.currency,
        total_amount: totalAmount,
        total_bills: linkedLocalBills.length,
        total_items: totalItems,
        created_at: lg.createdAt,
        updated_at: lg.updatedAt,
        participants: (lg as any).participants || [],
        bills: linkedLocalBills.map((b) => ({
          id: b.id,
          name: b.name,
          location: b.location,
          currency: b.currency,
          totalAmount: b.items.reduce((s, i) => s + i.price * i.quantity, 0),
          created_at: b.createdAt,
          updated_at: b.updatedAt,
          isLocal: true,
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
      participants: [],
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
      participants: [],
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

    // Also unlink any local bills linked to this group
    try {
      const localBills = await localDb.listBills();
      for (const b of localBills) {
        if (b.groupId === id) {
          b.groupId = null;
          b.groupName = null;
          await localDb.saveBill(b);
        }
      }
    } catch (e) {
      console.warn('Failed to unlink local bills on group delete:', e);
    }

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

  addGroupParticipant: async (groupId: string, name: string, email?: string | null) => {
    const newPerson: LocalPerson = {
      id: crypto.randomUUID(),
      name: name.trim(),
      sponsorAmount: 0,
      paidAmount: 0,
      email: email?.trim() || null,
    };

    const localDb = getLocalDb();
    const lg = await localDb.getGroup(groupId).catch(() => null);
    if (lg) {
      const existing = (lg as any).participants || [];
      (lg as any).participants = [...existing, newPerson];
      await localDb.saveGroup(lg);
    }

    const current = get().currentGroup;
    let nextParticipants: LocalPerson[] = [];
    if (current && current.id === groupId) {
      nextParticipants = [...((current as any).participants || []), newPerson];
      set({
        currentGroup: {
          ...current,
          participants: nextParticipants,
        } as any,
      });
    }

    try {
      await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: nextParticipants.length ? nextParticipants : [newPerson],
        }),
      });
    } catch {}
  },

  removeGroupParticipant: async (groupId: string, participantId: string) => {
    const localDb = getLocalDb();
    const lg = await localDb.getGroup(groupId).catch(() => null);
    if (lg) {
      (lg as any).participants = ((lg as any).participants || []).filter((p: any) => p.id !== participantId);
      await localDb.saveGroup(lg);
    }

    const current = get().currentGroup;
    let nextParticipants: LocalPerson[] = [];
    if (current && current.id === groupId) {
      nextParticipants = ((current as any).participants || []).filter((p: any) => p.id !== participantId);
      set({
        currentGroup: {
          ...current,
          participants: nextParticipants,
        } as any,
      });
    }

    try {
      await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: nextParticipants,
        }),
      });
    } catch {}
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
