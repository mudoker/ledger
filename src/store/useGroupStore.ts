import { create } from 'zustand';
import type { BillGroupSummary, BillGroupDetail, PersonData, GroupPaymentQr } from '@/../db/types';
import { getLocalDb } from '@/lib/local-db';
import type { LocalGroupRecord, LocalPerson, LocalBillRecord } from '@/lib/local-db/types';
import {
  mergeBillsForGroup,
  aggregateGroupSummaries,
  ensureGroupParticipantsSuperset,
} from '@/lib/common-data-model';
import { useAppSettingsStore } from '@/store/useAppSettingsStore';

interface GroupState {
  groups: BillGroupSummary[];
  currentGroup: BillGroupDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchGroups: () => Promise<void>;
  fetchGroup: (id: string) => Promise<BillGroupDetail | null>;
  syncGroupWithBills: (groupId: string) => Promise<void>;
  createGroup: (name: string, description?: string | null, currency?: string, visibility?: 'public' | 'restricted') => Promise<BillGroupDetail>;
  updateGroup: (id: string, data: { name?: string; description?: string | null; currency?: string; visibility?: 'public' | 'restricted'; participants?: any[]; payment_qrs?: GroupPaymentQr[] }) => Promise<void>;
  deleteGroup: (id: string) => Promise<boolean>;
  transferOwnership: (id: string, newOwnerId: string) => Promise<boolean>;
  addGroupParticipant: (groupId: string, name: string, email?: string | null) => Promise<void>;
  removeGroupParticipant: (groupId: string, participantId: string) => Promise<void>;
  addPaymentQr: (groupId: string, qr: { payerName: string; payerId?: string | null; qrUrl: string; note?: string | null }) => Promise<void>;
  removePaymentQr: (groupId: string, qrId: string) => Promise<void>;
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
      const allLocalBills = await localDb.listBills().catch(() => []);
      const pendingOps = await localDb.getPendingOps().catch(() => []);
      const pendingDeleteIds = new Set(pendingOps.filter(op => op.type === 'delete').map(op => op.billId));
      localBills = allLocalBills.filter(b => !pendingDeleteIds.has(b.id));

      if (localGroups.length > 0 && get().groups.length === 0) {
        const fastSummaries = aggregateGroupSummaries([], localGroups, localBills);
        if (fastSummaries.length > 0) {
          set({ groups: fastSummaries });
        }
      }
    } catch (e) {
      console.warn('Failed to load local groups/bills:', e);
    }

    let serverGroups: BillGroupSummary[] = [];
    let fetchError: string | null = null;
    try {
      const res = await fetch('/api/groups', { cache: 'no-store' });
      if (res.ok) {
        serverGroups = await res.json();
      } else {
        fetchError = 'Failed to fetch groups from server';
      }
    } catch (e: unknown) {
      fetchError = e instanceof Error ? e.message : 'Network error';
    } finally {
      // Unified group summaries aggregation
      const unifiedSummaries = aggregateGroupSummaries(serverGroups, localGroups, localBills);

      // Reconcile with currently loaded currentGroup if available in memory
      const current = get().currentGroup;
      const reconciledSummaries = current
        ? unifiedSummaries.map(g => (g.id === current.id ? {
            ...g,
            total_amount: current.total_amount,
            total_bills: current.total_bills,
            total_items: current.total_items,
            participants: current.participants || g.participants,
          } : g))
        : unifiedSummaries;

      if (reconciledSummaries.length === 0 && fetchError && serverGroups.length === 0 && localGroups.length === 0) {
        set({ error: fetchError, isLoading: false, groups: [] });
      } else {
        set({ groups: reconciledSummaries, isLoading: false, error: null });
      }
    }
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
    const storageMode = useAppSettingsStore.getState().storageMode;
    const isAutoSyncMode = storageMode === 'cloud' || storageMode === 'hybrid';
    const localDb = getLocalDb();
    const lg = await localDb.getGroup(id).catch(() => null);
    const localBills = await localDb.listBills().catch(() => []);
    const pendingOps = await localDb.getPendingOps().catch(() => []);
    const pendingDeleteIds = new Set(pendingOps.filter(op => op.type === 'delete').map(op => op.billId));

    // In cloud/hybrid mode, if any server bill owned by the user was previously saved with is_shared = 0 (isLocal: true),
    // automatically promote it on the server in the background so it is synced across all devices.
    if (isAutoSyncMode && serverGroup?.is_owner && Array.isArray(serverGroup.bills)) {
      for (const sb of serverGroup.bills) {
        if (sb.isLocal) {
          fetch(`/api/bills/${sb.id}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visibility: serverGroup.visibility || 'public' }),
          }).catch(() => {});
        }
      }
    }

    // 3. Resolve group metadata & participants by aggregating local and server
    const serverParticipants: PersonData[] = (serverGroup as any)?.participants || [];
    const localParticipants: PersonData[] = (lg as any)?.participants || [];

    const participants = ensureGroupParticipantsSuperset(
      serverParticipants,
      [{ people: localParticipants }]
    );

    const isLocalNewer = storageMode !== 'cloud' && lg && serverGroup
      ? new Date(lg.updatedAt).getTime() > new Date(serverGroup.updated_at).getTime()
      : Boolean(lg && !serverGroup);

    // Merge payment QRs across server, local DB, and in-memory currentGroup
    const serverPaymentQrs: GroupPaymentQr[] = (serverGroup as any)?.payment_qrs || [];
    const localPaymentQrs: GroupPaymentQr[] = (lg as any)?.payment_qrs || [];
    const inMemoryPaymentQrs: GroupPaymentQr[] = (get().currentGroup?.id === id) ? (get().currentGroup?.payment_qrs || []) : [];

    const mergedQrsMap = new Map<string, GroupPaymentQr>();
    serverPaymentQrs.forEach(q => mergedQrsMap.set(q.id, q));
    localPaymentQrs.forEach(q => mergedQrsMap.set(q.id, q));
    inMemoryPaymentQrs.forEach(q => mergedQrsMap.set(q.id, q));
    const unifiedPaymentQrs = Array.from(mergedQrsMap.values());

    const baseGroup = (serverGroup && !isLocalNewer)
      ? { ...serverGroup, participants, payment_qrs: unifiedPaymentQrs }
      : (lg ? {
          id: lg.id,
          name: lg.name,
          description: lg.description,
          owner_id: lg.ownerId || serverGroup?.owner_id || 'local',
          owner_name: serverGroup?.owner_name || null,
          owner_email: serverGroup?.owner_email || null,
          is_owner: serverGroup ? serverGroup.is_owner : true,
          currency: lg.currency || serverGroup?.currency || 'VND',
          visibility: lg.visibility || serverGroup?.visibility || 'public',
          created_at: serverGroup?.created_at || lg.createdAt,
          updated_at: lg.updatedAt,
          bills: (serverGroup?.bills || []).filter(b => !pendingDeleteIds.has(b.id)),
          participants,
          payment_qrs: unifiedPaymentQrs,
        } : (serverGroup ? { ...serverGroup, participants, payment_qrs: unifiedPaymentQrs } : null));

    if (!baseGroup) {
      set({ error: 'Group not found', isLoading: false, currentGroup: null });
      return null;
    }

    // 4. Merge server bills with local bills using common data model
    const serverBills = (serverGroup?.bills || []).filter(b => !pendingDeleteIds.has(b.id));
    const activeLocalBills = localBills.filter(b => !pendingDeleteIds.has(b.id));
    const mergedBills = mergeBillsForGroup(serverBills, activeLocalBills, id, participants);

    // Ensure group participants is strictly the superset of all bill participants (Bill.participants ⊆ Group.participants)
    const unifiedParticipants = ensureGroupParticipantsSuperset(participants, mergedBills);

    // If new participants were identified from bills, persist them to local and cloud
    if (unifiedParticipants.length > participants.length) {
      if (lg && storageMode !== 'cloud') {
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
      payment_qrs: unifiedPaymentQrs,
    };

    // Persist aggregated group snapshot locally for offline resilience (except in cloud-only mode)
    if (storageMode !== 'cloud') {
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
        visibility: finalDetail.visibility || 'public',
        ownerId: finalDetail.owner_id || null,
        participants: localParticipantsSnapshot,
        payment_qrs: unifiedPaymentQrs,
        totalAmount: finalDetail.total_amount,
        totalBills: finalDetail.total_bills,
        totalItems: finalDetail.total_items,
        createdAt: finalDetail.created_at,
        updatedAt: finalDetail.updated_at,
      }).catch(() => {});
    }

    // Update currentGroup and keep groups list in sync
    set((state) => {
      const nextGroups = state.groups.map(g => g.id === id ? {
        ...g,
        name: finalDetail.name,
        description: finalDetail.description,
        currency: finalDetail.currency || g.currency,
        visibility: finalDetail.visibility || g.visibility,
        total_amount: totalAmount,
        total_bills: mergedBills.length,
        total_items: totalItems,
        participants: unifiedParticipants,
        payment_qrs: unifiedPaymentQrs,
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

  createGroup: async (name: string, description: string | null = null, currency: string = 'VND', visibility: 'public' | 'restricted' = 'public') => {
    set({ isLoading: true, error: null });
    const storageMode = useAppSettingsStore.getState().storageMode;
    const localDb = getLocalDb();
    const newId = crypto.randomUUID();

    const localGroup: LocalGroupRecord = {
      id: newId,
      name,
      description,
      currency,
      visibility,
      ownerId: null,
      participants: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to local storage in 'local' and 'hybrid' modes (not in 'cloud' mode)
    if (storageMode !== 'cloud') {
      await localDb.saveGroup(localGroup);
    }

    // Try cloud sync if online
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, name, description, currency, visibility }),
      });
      if (!res.ok) {
        if (storageMode !== 'cloud') {
          await localDb.deleteGroup(newId).catch(() => {});
        }
        const err = await res.json().catch(() => ({}));
        const msg = err.error || 'Failed to create group';
        set({ error: msg, isLoading: false });
        throw new Error(msg);
      }
      const serverGroup = await res.json();
      if (storageMode !== 'cloud') {
        if (serverGroup.id !== newId) {
          await localDb.deleteGroup(newId);
          // Remap any local bills that linked to newId
          const bills = await localDb.listBills().catch(() => []);
          for (const b of bills) {
            if (b.groupId === newId) {
              b.groupId = serverGroup.id;
              await localDb.saveBill(b).catch(() => {});
            }
          }
        }
        await localDb.saveGroup({
          ...localGroup,
          id: serverGroup.id,
          ownerId: serverGroup.owner_id,
        });
      }
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
      visibility: localGroup.visibility || 'public',
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
    const storageMode = useAppSettingsStore.getState().storageMode;

    // Update local copy (only when not in cloud-only mode)
    let allLocalBills: LocalBillRecord[] = [];
    try {
      const localDb = getLocalDb();
      if (storageMode !== 'cloud') {
        const lg = await localDb.getGroup(id);
        if (lg) {
          await localDb.saveGroup({
            ...lg,
            ...data,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      const pendingOps = await localDb.getPendingOps().catch(() => []);
      const pendingDeleteIds = new Set(pendingOps.filter(op => op.type === 'delete').map(op => op.billId));
      const rawLocalBills = await localDb.listBills().catch(() => []);
      allLocalBills = rawLocalBills.filter(b => !pendingDeleteIds.has(b.id));
    } catch (e) {
      console.warn('Failed to update local group:', e);
    }

    // In local mode for a local group, do not transmit to server
    const currentG = get().currentGroup?.id === id ? get().currentGroup : get().groups.find(g => g.id === id);
    const isLocalGroup = currentG?.owner_id === 'local';
    if (isLocalGroup && storageMode === 'local') {
      set((state) => ({
        currentGroup: state.currentGroup?.id === id ? { ...state.currentGroup, ...data } : state.currentGroup,
        groups: state.groups.map((g) => (g.id === id ? { ...g, ...data } : g)),
        isLoading: false,
      }));
      return;
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
        if (allLocalBills.length > 0 && Array.isArray(updated.bills)) {
          const mergedBills = mergeBillsForGroup(updated.bills, allLocalBills, id, updated.participants);
          updated.bills = mergedBills;
          updated.total_bills = mergedBills.length;
          updated.total_amount = mergedBills.reduce((s, b) => s + b.totalAmount, 0);
          updated.total_items = mergedBills.reduce((s, b) => s + (b.items?.length || 0), 0);
        }
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

    // 2. Asynchronously persist to local storage (when not cloud-only) and remote backend
    try {
      const storageMode = useAppSettingsStore.getState().storageMode;
      if (storageMode !== 'cloud') {
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
    const storageMode = useAppSettingsStore.getState().storageMode;
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

    if (storageMode !== 'cloud') {
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

  addPaymentQr: async (groupId: string, qrData: { payerName: string; payerId?: string | null; qrUrl: string; note?: string | null }) => {
    const cur = get().currentGroup?.id === groupId ? get().currentGroup : get().groups.find(g => g.id === groupId);
    let existingQrs: GroupPaymentQr[] = cur?.payment_qrs || [];
    if (existingQrs.length === 0) {
      const localG = await getLocalDb().getGroup(groupId).catch(() => null);
      if (localG?.payment_qrs && localG.payment_qrs.length > 0) {
        existingQrs = localG.payment_qrs;
      }
    }
    const newQr: GroupPaymentQr = {
      id: crypto.randomUUID(),
      payerName: qrData.payerName.trim(),
      payerId: qrData.payerId || null,
      qrUrl: qrData.qrUrl,
      note: qrData.note?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    const nextQrs = [...existingQrs, newQr];

    set((state) => ({
      currentGroup: state.currentGroup?.id === groupId ? {
        ...state.currentGroup,
        payment_qrs: nextQrs,
      } : state.currentGroup,
      groups: state.groups.map(g => g.id === groupId ? { ...g, payment_qrs: nextQrs } : g),
    }));

    // Persist to localDb immediately for instant resilience
    const storageMode = useAppSettingsStore.getState().storageMode;
    if (storageMode !== 'cloud') {
      const localDb = getLocalDb();
      const lg = await localDb.getGroup(groupId).catch(() => null);
      if (lg) {
        lg.payment_qrs = nextQrs;
        await localDb.saveGroup(lg).catch(() => {});
      }
    }

    await get().updateGroup(groupId, { payment_qrs: nextQrs });
  },

  removePaymentQr: async (groupId: string, qrId: string) => {
    const cur = get().currentGroup?.id === groupId ? get().currentGroup : get().groups.find(g => g.id === groupId);
    let existingQrs: GroupPaymentQr[] = cur?.payment_qrs || [];
    if (existingQrs.length === 0) {
      const localG = await getLocalDb().getGroup(groupId).catch(() => null);
      if (localG?.payment_qrs && localG.payment_qrs.length > 0) {
        existingQrs = localG.payment_qrs;
      }
    }
    const nextQrs = existingQrs.filter(q => q.id !== qrId);

    set((state) => ({
      currentGroup: state.currentGroup?.id === groupId ? {
        ...state.currentGroup,
        payment_qrs: nextQrs,
      } : state.currentGroup,
      groups: state.groups.map(g => g.id === groupId ? { ...g, payment_qrs: nextQrs } : g),
    }));

    // Persist to localDb immediately for instant resilience
    const storageMode = useAppSettingsStore.getState().storageMode;
    if (storageMode !== 'cloud') {
      const localDb = getLocalDb();
      const lg = await localDb.getGroup(groupId).catch(() => null);
      if (lg) {
        lg.payment_qrs = nextQrs;
        await localDb.saveGroup(lg).catch(() => {});
      }
    }

    await get().updateGroup(groupId, { payment_qrs: nextQrs });
  },

  clearCurrentGroup: () => set({ currentGroup: null }),
}));
