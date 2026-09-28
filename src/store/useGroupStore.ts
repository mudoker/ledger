import { create } from 'zustand';
import type { BillGroupSummary, BillGroupDetail, PersonData } from '@/../db/types';
import { getLocalDb } from '@/lib/local-db';
import type { LocalGroupRecord, LocalPerson, LocalBillRecord } from '@/lib/local-db/types';
import {
  mergeBillsForGroup,
  aggregateGroupSummaries,
  ensureGroupParticipantsSuperset,
} from '@/lib/common-data-model';

interface GroupState {
  groups: BillGroupSummary[];
  currentGroup: BillGroupDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchGroups: () => Promise<void>;
  fetchGroup: (id: string) => Promise<BillGroupDetail | null>;
  syncGroupWithBills: (groupId: string) => Promise<void>;
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

    let localGroups: LocalGroupRecord[] = [];
    let localBills: LocalBillRecord[] = [];
    try {
      const localDb = getLocalDb();
      localGroups = await localDb.listGroups().catch(() => []);
      localBills = await localDb.listBills().catch(() => []);
    } catch (e) {
      console.warn('Failed to load local groups/bills:', e);
    }

    let serverGroups: BillGroupSummary[] = [];
    let fetchError: string | null = null;
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        serverGroups = await res.json();
      } else {
        fetchError = 'Failed to fetch groups from server';
      }
    } catch (e: unknown) {
      fetchError = e instanceof Error ? e.message : 'Network error';
    }

    // Unified group summaries aggregation
    const unifiedSummaries = aggregateGroupSummaries(serverGroups, localGroups, localBills);

    if (unifiedSummaries.length === 0 && fetchError && serverGroups.length === 0 && localGroups.length === 0) {
      set({ error: fetchError, isLoading: false, groups: [] });
      return;
    }

    set({ groups: unifiedSummaries, isLoading: false, error: null });
  },

  fetchGroup: async (id: string) => {
    set({ isLoading: true, error: null });

    // 1. Load server group if available
    let serverGroup: BillGroupDetail | null = null;
    try {
      const res = await fetch(`/api/groups/${id}`);
      if (res.ok) {
        serverGroup = await res.json();
      }
    } catch {
      // Offline fallback
    }

    // 2. Load local group and local bills
    const localDb = getLocalDb();
    const lg = await localDb.getGroup(id).catch(() => null);
    const localBills = await localDb.listBills().catch(() => []);

    // 3. Resolve group metadata & participants by aggregating local and server
    const serverParticipants: PersonData[] = (serverGroup as any)?.participants || [];
    const localParticipants: PersonData[] = (lg as any)?.participants || [];

    const participants = ensureGroupParticipantsSuperset(
      serverParticipants,
      [{ people: localParticipants }]
    );

    const isLocalNewer = lg && serverGroup
      ? new Date(lg.updatedAt).getTime() > new Date(serverGroup.updated_at).getTime()
      : Boolean(lg && !serverGroup);

    const baseGroup = (serverGroup && !isLocalNewer)
      ? { ...serverGroup, participants }
      : (lg ? {
          id: lg.id,
          name: lg.name,
          description: lg.description,
          owner_id: lg.ownerId || serverGroup?.owner_id || 'local',
          owner_name: serverGroup?.owner_name || null,
          owner_email: serverGroup?.owner_email || null,
          is_owner: serverGroup ? serverGroup.is_owner : true,
          currency: lg.currency || serverGroup?.currency || 'VND',
          created_at: serverGroup?.created_at || lg.createdAt,
          updated_at: lg.updatedAt,
          bills: serverGroup?.bills || [],
          participants,
        } : (serverGroup ? { ...serverGroup, participants } : null));

    if (!baseGroup) {
      set({ error: 'Group not found', isLoading: false, currentGroup: null });
      return null;
    }

    // 4. Merge server bills with local bills using common data model
    const serverBills = serverGroup?.bills || [];
    const mergedBills = mergeBillsForGroup(serverBills, localBills, id, participants);

    // Ensure group participants is strictly the superset of all bill participants (Bill.participants ⊆ Group.participants)
    const unifiedParticipants = ensureGroupParticipantsSuperset(participants, mergedBills);

    // If new participants were identified from bills, persist them to local and cloud
    if (unifiedParticipants.length > participants.length) {
      if (lg) {
        lg.participants = unifiedParticipants as any;
        await localDb.saveGroup(lg).catch(() => {});
      }
      if (serverGroup && serverGroup.is_owner) {
        fetch(`/api/groups/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participants: unifiedParticipants }),
        }).catch(() => {});
      }
    }

    const totalAmount = mergedBills.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalItems = mergedBills.reduce((sum, b) => sum + (b.items?.length || 0), 0);

    const finalDetail: BillGroupDetail = {
      ...baseGroup,
      bills: mergedBills,
      total_bills: mergedBills.length,
      total_amount: totalAmount,
      total_items: totalItems,
      participants: unifiedParticipants,
    };

    // Persist aggregated group snapshot locally for offline resilience
    const localParticipantsSnapshot: LocalPerson[] = (unifiedParticipants || []).map(p => ({
      id: p.id,
      name: p.name,
      sponsorAmount: p.sponsorAmount ?? 0,
      paidAmount: p.paidAmount ?? 0,
      userId: p.userId || null,
      email: p.email || null,
    }));

    await localDb.saveGroup({
      id: finalDetail.id,
      name: finalDetail.name,
      description: finalDetail.description,
      currency: finalDetail.currency || 'VND',
      ownerId: finalDetail.owner_id || null,
      participants: localParticipantsSnapshot,
      createdAt: finalDetail.created_at,
      updatedAt: finalDetail.updated_at,
    }).catch(() => {});

    // Update currentGroup and keep groups list in sync
    set((state) => {
      const nextGroups = state.groups.map(g => g.id === id ? {
        ...g,
        total_amount: totalAmount,
        total_bills: mergedBills.length,
        total_items: totalItems,
        participants: unifiedParticipants,
      } : g);
      return {
        currentGroup: finalDetail,
        groups: nextGroups,
        isLoading: false,
        error: null,
      };
    });

    return finalDetail;
  },

  syncGroupWithBills: async (groupId: string) => {
    if (!groupId) return;
    try {
      const current = get().currentGroup;
      if (current && current.id === groupId) {
        await get().fetchGroup(groupId);
      }
      await get().fetchGroups();
    } catch (e) {
      console.warn('syncGroupWithBills failed:', e);
    }
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
    const targetGroup = get().groups.find(g => g.id === groupId);
    const existingGroupParticipants = (targetGroup?.participants && targetGroup.participants.length > 0)
      ? targetGroup.participants
      : (get().currentGroup?.id === groupId ? (get().currentGroup?.participants || []) : []);

    const exists = existingGroupParticipants.some(gp =>
      (gp.email && email && gp.email.trim().toLowerCase() === email.trim().toLowerCase()) ||
      gp.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (exists) return;

    const newPerson: LocalPerson = {
      id: crypto.randomUUID(),
      name: name.trim(),
      sponsorAmount: 0,
      paidAmount: 0,
      email: email?.trim() || null,
    };

    const nextParticipants = [...existingGroupParticipants, newPerson];

    // 1. Update in-memory Zustand state immediately
    set((state) => ({
      currentGroup: state.currentGroup?.id === groupId ? {
        ...state.currentGroup,
        participants: nextParticipants as any,
      } : state.currentGroup,
      groups: state.groups.map(g => g.id === groupId ? {
        ...g,
        participants: nextParticipants as any,
      } : g),
    }));

    // 2. Asynchronously persist to local storage and remote backend
    try {
      const localDb = getLocalDb();
      const lg = await localDb.getGroup(groupId).catch(() => null);
      const localNextParticipants: LocalPerson[] = nextParticipants.map((p: any) => ({
        id: p.id,
        name: p.name,
        sponsorAmount: p.sponsorAmount ?? 0,
        paidAmount: p.paidAmount ?? 0,
        userId: p.userId || null,
        email: p.email || null,
      }));

      if (lg) {
        (lg as any).participants = localNextParticipants;
        await localDb.saveGroup(lg);
      } else {
        const cur = get().currentGroup || get().groups.find(g => g.id === groupId);
        if (cur) {
          await localDb.saveGroup({
            id: cur.id,
            name: cur.name,
            description: cur.description,
            currency: cur.currency || 'VND',
            ownerId: cur.owner_id || null,
            participants: localNextParticipants,
            createdAt: cur.created_at || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: nextParticipants,
        }),
      });
    } catch {}
  },

  removeGroupParticipant: async (groupId: string, participantId: string) => {
    const localDb = getLocalDb();
    const lg = await localDb.getGroup(groupId).catch(() => null);
    const current = get().currentGroup;
    let nextParticipants: LocalPerson[] = [];

    if (current && current.id === groupId) {
      nextParticipants = ((current as any).participants || []).filter((p: any) => p.id !== participantId);
      set((state) => ({
        currentGroup: {
          ...current,
          participants: nextParticipants,
        } as any,
        groups: state.groups.map(g => g.id === groupId ? { ...g, participants: nextParticipants as any } : g),
      }));
    } else {
      const existing = lg ? ((lg as any).participants || []) : [];
      nextParticipants = existing.filter((p: any) => p.id !== participantId);
    }

    if (lg) {
      (lg as any).participants = nextParticipants;
      await localDb.saveGroup(lg);
    } else if (current && current.id === groupId) {
      await localDb.saveGroup({
        id: current.id,
        name: current.name,
        description: current.description,
        currency: current.currency || 'VND',
        ownerId: current.owner_id || null,
        participants: nextParticipants,
        createdAt: current.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
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
