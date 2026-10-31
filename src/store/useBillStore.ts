import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchExchangeRate, convertCurrency } from '@/lib/currency';
import { useGroupStore } from './useGroupStore';
import { useAppSettingsStore } from './useAppSettingsStore';
import { useAuthStore } from './useAuthStore';
import { getLocalDb } from '@/lib/local-db';
import { syncManager, syncCoordinator } from '@/lib/local-db/sync-manager';
import type { BillSharingStatus, BillVisibility, LocalBillRecord } from '@/lib/local-db/types';
import { calculateBillTotals } from '@/lib/common-data-model';

export interface Person {
    id: string;
    name: string;
    sponsorAmount: number;
    paidAmount: number;
    userId?: string | null;
    email?: string | null;
}

export interface Item {
    id: string;
    name: string;
    price: number;
    quantity: number;
    assignments: Record<string, number>; // personId -> quantity consumed
}

export interface GlobalCharge {
    id: string;
    name: string;
    amount: number;
    type: 'fixed' | 'percent';
}

export interface BillHistoryItem {
    id: string;
    created_at: string;
    updated_at: string;
    name?: string;
    location?: string;
    totalAmount?: number;
    owner_id?: string | null;
    group_id?: string | null;
    group_name?: string | null;
    role?: 'owner' | 'participant' | 'viewer';
    is_owner?: boolean;
    sharingStatus?: BillSharingStatus;
    visibility?: BillVisibility;
    shareToken?: string | null;
}

export interface DbStatus {
    configured: boolean;
    type: 'neon' | 'postgres' | 'sqlite';
    isFallback: boolean;
    fallbackReason: string | null;
    isOnline: boolean;
}

export type CurrencyCode = string;
export const VND_PER_USD = 25400;

interface BillState {
    people: Person[];
    items: Item[];
    globalCharges: GlobalCharge[];
    hostId: string | null;
    isReadOnly: boolean;
    isHydrated: boolean;
    currentBillId: string | null;
    lastSaved: string | null;
    isSaving: boolean;
    billHistory: BillHistoryItem[];
    isHistoryLoading: boolean;
    dbStatus: DbStatus;
    billName: string;
    location: string;
    qrCode: string | null;
    currency: CurrencyCode;
    groupId: string | null;
    groupName: string | null;
    sharingStatus: BillSharingStatus;
    visibility: BillVisibility;
    shareToken: string | null;
    syncError: string | null;

    // Actions
    setCurrency: (currency: CurrencyCode) => Promise<void>;
    setBillName: (name: string) => void;
    setLocation: (location: string) => void;
    setQrCode: (url: string) => void;
    setGroupId: (groupId: string | null, participantsToInherit?: Array<{ name: string; email?: string | null; userId?: string | null }>) => Promise<void>;
    transferBillOwnership: (newOwnerId: string) => Promise<boolean>;
    addPerson: (name: string, email?: string | null, userId?: string | null) => void;
    addPeople: (people: Array<{ name: string; email?: string | null; userId?: string | null }>) => void;
    updatePerson: (id: string, data: Partial<Person>) => void;
    removePerson: (id: string) => void;

    addItem: (name: string, price: number, quantity?: number) => void;
    updateItem: (id: string, data: Partial<Item>) => void;
    removeItem: (id: string) => void;

    addGlobalCharge: (charge: Omit<GlobalCharge, 'id'>) => void;
    updateGlobalCharge: (id: string, data: Partial<GlobalCharge>) => void;
    removeGlobalCharge: (id: string) => void;

    setHostId: (id: string) => void;
    resetBill: () => void;
    loadState: (data: Partial<BillState>, readonly: boolean) => void;
    setHydrated: (val: boolean) => void;

    // Persistence & Sharing Actions
    saveToLocal: () => Promise<string | null>;
    saveToDb: () => Promise<string | null>;
    deleteBill: (id?: string) => Promise<boolean>;
    enableSharing: (visibility: BillVisibility) => Promise<boolean>;
    disableSharing: () => Promise<boolean>;
    updateSharingVisibility: (visibility: BillVisibility) => Promise<boolean>;
    fetchBill: (id: string, isShare?: boolean, token?: string | null) => Promise<void>;
    fetchHistory: () => Promise<void>;
    fetchDbStatus: () => Promise<void>;
    loadSeedData: () => void;
}

export const useBillStore = create<BillState>()(
    persist(
        (set, get) => ({
            people: [],
            items: [],
            globalCharges: [],
            hostId: null,
            isReadOnly: false,
            isHydrated: false,
            currentBillId: null,
            lastSaved: null,
            isSaving: false,
            billHistory: [],
            isHistoryLoading: true,
            dbStatus: {
                configured: false,
                type: 'sqlite',
                isFallback: false,
                fallbackReason: null,
                isOnline: true,
            },
            billName: '',
            location: '',
            qrCode: null,
            currency: 'VND',
            groupId: null,
            groupName: null,
            sharingStatus: 'local',
            visibility: 'local',
            shareToken: null,
            syncError: null,

            setGroupId: async (groupId: string | null, participantsToInherit?: Array<{ name: string; email?: string | null; userId?: string | null }>) => {
                const groupStore = useGroupStore.getState();
                const matchedGroup = groupId ? groupStore.groups.find(g => g.id === groupId) : null;
                const oldGroupId = get().groupId;

                // If participantsToInherit was explicitly specified, add those selected participants
                if (groupId && participantsToInherit !== undefined) {
                    if (participantsToInherit.length > 0) {
                        const currentPeople = [...get().people];
                        let addedAny = false;
                        for (const gp of participantsToInherit) {
                            const exists = currentPeople.some(p =>
                                (p.email && gp.email && p.email.toLowerCase() === gp.email.toLowerCase()) ||
                                p.name.trim().toLowerCase() === gp.name.trim().toLowerCase()
                            );
                            if (!exists) {
                                currentPeople.push({
                                    id: crypto.randomUUID(),
                                    name: gp.name,
                                    sponsorAmount: 0,
                                    paidAmount: 0,
                                    userId: gp.userId || null,
                                    email: gp.email || null,
                                });
                                addedAny = true;
                            }
                        }
                        if (addedAny) {
                            set({ people: currentPeople });
                        }
                    }
                } else if (groupId) {
                    // Fallback when participantsToInherit is omitted
                    let groupParticipants = matchedGroup?.participants;
                    if (!groupParticipants || groupParticipants.length === 0) {
                        try {
                            const gd = await groupStore.fetchGroup(groupId);
                            if (gd && (gd as any).participants?.length) {
                                groupParticipants = (gd as any).participants;
                            }
                        } catch {}
                    }

                    if (groupParticipants && groupParticipants.length > 0) {
                        const currentPeople = [...get().people];
                        let addedAny = false;
                        for (const gp of groupParticipants) {
                            const exists = currentPeople.some(p =>
                                (p.email && gp.email && p.email.toLowerCase() === gp.email.toLowerCase()) ||
                                p.name.trim().toLowerCase() === gp.name.trim().toLowerCase()
                            );
                            if (!exists) {
                                currentPeople.push({
                                    id: crypto.randomUUID(),
                                    name: gp.name,
                                    sponsorAmount: 0,
                                    paidAmount: 0,
                                    userId: gp.userId || null,
                                    email: gp.email || null,
                                });
                                addedAny = true;
                            }
                        }
                        if (addedAny) {
                            set({ people: currentPeople });
                        }
                    }
                }

                // Invariant: Bill.participants ⊆ Group.participants
                // Ensure all existing people on this bill are registered into the target group
                if (groupId) {
                    for (const p of get().people) {
                        if (p.name && p.name.trim()) {
                            groupStore.addGroupParticipant(groupId, p.name.trim(), p.email || null).catch(() => {});
                        }
                    }
                }

                set({
                    groupId,
                    groupName: matchedGroup?.name || null
                });

                if (groupId && !matchedGroup) {
                    groupStore.fetchGroup(groupId).then((g) => {
                        if (g && get().groupId === groupId) {
                            set({ groupName: g.name });
                        }
                    }).catch(() => {});
                }

                if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    if (groupId) {
                        url.searchParams.set('groupId', groupId);
                    } else {
                        url.searchParams.delete('groupId');
                    }
                    window.history.replaceState({}, '', url.toString());
                }

                // Save locally immediately
                await get().saveToLocal();

                // Also notify server of group assignment/unassignment if bill has an ID
                const billId = get().currentBillId;
                if (billId) {
                    try {
                        await fetch('/api/bills', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: billId,
                                isShared: get().sharingStatus === 'shared',
                                visibility: get().visibility,
                                shareToken: get().shareToken,
                                data: {
                                    name: get().billName,
                                    location: get().location,
                                    people: get().people,
                                    items: get().items,
                                    globalCharges: get().globalCharges,
                                    hostId: get().hostId,
                                    qrCode: get().qrCode,
                                    currency: get().currency,
                                    groupId: groupId || null,
                                    group_id: groupId || null,
                                    visibility: get().visibility,
                                    shareToken: get().shareToken,
                                }
                            })
                        });
                    } catch {}
                }

                await groupStore.fetchGroups();
                if (groupId) {
                    await groupStore.fetchGroup(groupId);
                }
                if (oldGroupId && oldGroupId !== groupId) {
                    await groupStore.fetchGroup(oldGroupId);
                }
                await get().fetchHistory();
            },

            transferBillOwnership: async (newOwnerId: string) => {
                const billId = get().currentBillId;
                if (!billId) return false;
                try {
                    const res = await fetch(`/api/bills/${billId}/transfer`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ new_owner_id: newOwnerId }),
                    });
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error || 'Failed to transfer bill ownership');
                    }
                    await get().fetchBill(billId);
                    await get().fetchHistory();
                    return true;
                } catch (e) {
                    console.error('Transfer bill ownership error:', e);
                    throw e;
                }
            },

            setCurrency: async (newCurrency) => {
                const currentCurrency = get().currency;
                if (currentCurrency === newCurrency) return;

                if (get().items.length === 0 && get().people.length === 0) {
                    set({ currency: newCurrency });
                    await get().saveToDb();
                    return;
                }

                try {
                    const rate = await fetchExchangeRate(currentCurrency, newCurrency);
                    set((state) => ({
                        currency: newCurrency,
                        items: state.items.map((item) => ({
                            ...item,
                            price: convertCurrency(item.price, currentCurrency, newCurrency, rate),
                        })),
                        people: state.people.map((p) => ({
                            ...p,
                            paidAmount: convertCurrency(p.paidAmount || 0, currentCurrency, newCurrency, rate),
                            sponsorAmount: convertCurrency(p.sponsorAmount || 0, currentCurrency, newCurrency, rate),
                        })),
                        globalCharges: state.globalCharges.map((ch) =>
                            ch.type === 'fixed'
                                ? { ...ch, amount: convertCurrency(ch.amount, currentCurrency, newCurrency, rate) }
                                : ch
                        ),
                    }));

                    await get().saveToDb();
                } catch (err) {
                    console.error('[Store] Failed to convert currency:', err);
                    set({ currency: newCurrency });
                    await get().saveToDb();
                }
            },

            setBillName: (name) => set({ billName: name }),
            setLocation: (location) => set({ location }),
            setQrCode: (url) => set({ qrCode: url }),

            addPerson: (name, email = null, userId = null) => {
                const newPerson = {
                    id: crypto.randomUUID(),
                    name,
                    sponsorAmount: 0,
                    paidAmount: 0,
                    userId: userId || null,
                    email: email || null,
                };
                set((state) => ({
                    people: [...state.people, newPerson],
                }));
                // Ensure group superset invariant
                const currentGroupId = get().groupId;
                if (currentGroupId && name.trim()) {
                    useGroupStore.getState().addGroupParticipant(currentGroupId, name.trim(), email || null).catch(() => {});
                }
            },

            addPeople: (newPeople) => {
                const created: Person[] = [];
                for (const p of newPeople) {
                    if (!p.name?.trim()) continue;
                    created.push({
                        id: crypto.randomUUID(),
                        name: p.name.trim(),
                        sponsorAmount: 0,
                        paidAmount: 0,
                        userId: p.userId || null,
                        email: p.email || null,
                    });
                }
                if (created.length === 0) return;
                set((state) => ({
                    people: [...state.people, ...created],
                }));
                // Ensure group superset invariant
                const currentGroupId = get().groupId;
                if (currentGroupId) {
                    for (const cp of created) {
                        useGroupStore.getState().addGroupParticipant(currentGroupId, cp.name, cp.email || null).catch(() => {});
                    }
                }
            },

            updatePerson: (id, data) =>
                set((state) => ({
                    people: state.people.map((p) =>
                        p.id === id ? { ...p, ...data } : p
                    ),
                })),

            removePerson: (id) =>
                set((state) => ({
                    people: state.people.filter((p) => p.id !== id),
                    items: state.items.map((item) => {
                        const assignments = item.assignments || {};
                        const newAssignments = { ...assignments };
                        delete newAssignments[id];
                        return {
                            ...item,
                            assignments: newAssignments,
                        };
                    }),
                    hostId: state.hostId === id ? null : state.hostId,
                })),

            addItem: (name, price, quantity = 1) =>
                set((state) => ({
                    items: [
                        ...state.items,
                        { id: crypto.randomUUID(), name, price, quantity, assignments: {} },
                    ],
                })),

            updateItem: (id, data) =>
                set((state) => ({
                    items: state.items.map((item) =>
                        item.id === id ? { ...item, ...data } : item
                    ),
                })),

            removeItem: (id) =>
                set((state) => ({
                    items: state.items.filter((item) => item.id !== id),
                })),

            addGlobalCharge: (charge) =>
                set((state) => ({
                    globalCharges: [...state.globalCharges, { ...charge, id: crypto.randomUUID() }]
                })),

            updateGlobalCharge: (id, data) =>
                set((state) => ({
                    globalCharges: state.globalCharges.map(charge =>
                        charge.id === id ? { ...charge, ...data } : charge
                    )
                })),

            removeGlobalCharge: (id) =>
                set((state) => ({
                    globalCharges: state.globalCharges.filter(charge => charge.id !== id)
                })),

            setHostId: (id) => {
                set((state) => ({
                    hostId: id,
                    people: state.people.map(p =>
                        p.id === id ? { ...p, paidAmount: 0 } : p
                    )
                }));
                get().saveToDb();
            },

            resetBill: () => set((state) => ({
                people: [],
                items: [],
                globalCharges: [],
                hostId: null,
                isReadOnly: false,
                isHydrated: true,
                currentBillId: null,
                lastSaved: null,
                isSaving: false,
                billHistory: state.billHistory,
                billName: '',
                location: '',
                qrCode: null,
                groupId: null,
                groupName: null,
                sharingStatus: 'local',
                visibility: 'local',
                shareToken: null,
                syncError: null,
            })),

            loadState: (data, readonly) => set((state) => ({
                ...state,
                ...data,
                isReadOnly: readonly
            })),

            setHydrated: (val: boolean) => set({ isHydrated: val }),

            saveToLocal: async () => {
                const state = get();
                const billId = state.currentBillId || crypto.randomUUID();
                if (!state.currentBillId) {
                    set({ currentBillId: billId });
                }

                const localBill: LocalBillRecord = {
                    id: billId,
                    name: state.billName,
                    location: state.location,
                    currency: state.currency,
                    hostId: state.hostId,
                    qrCode: state.qrCode,
                    groupId: state.groupId,
                    groupName: state.groupName,
                    ownerId: useAuthStore.getState().user?.id || null,
                    people: state.people,
                    items: state.items,
                    globalCharges: state.globalCharges,
                    sharingStatus: state.sharingStatus,
                    visibility: state.visibility,
                    shareToken: state.shareToken,
                    lastSyncedAt: state.lastSaved,
                    syncError: state.syncError,
                    createdAt: state.lastSaved || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                try {
                    const db = getLocalDb();
                    await db.saveBill(localBill);
                    set({ lastSaved: localBill.updatedAt });
                    if (localBill.groupId) {
                        useGroupStore.getState().syncGroupWithBills(localBill.groupId);
                    }
                    return billId;
                } catch (e) {
                    console.error('Failed to save bill locally:', e);
                    return null;
                }
            },

            saveToDb: async () => {
                if (typeof window === 'undefined') return null;
                const state = get();
                if (state.isReadOnly) return null;
                if (state.people.length === 0 && state.items.length === 0) return null;

                // 1. Always persist to local IndexedDB first (instant & reliable)
                const billId = (await get().saveToLocal()) || state.currentBillId;
                if (!billId) return null;

                // Optimistically update in-memory bill history immediately without waiting for server
                const totals = calculateBillTotals({ items: state.items, globalCharges: state.globalCharges });
                const updatedAt = new Date().toISOString();
                set((s) => {
                    const existingIndex = s.billHistory.findIndex((b) => b.id === billId);
                    const historyItem: BillHistoryItem = {
                        id: billId,
                        name: s.billName,
                        location: s.location || undefined,
                        created_at: s.lastSaved || updatedAt,
                        updated_at: updatedAt,
                        totalAmount: totals.totalAmount,
                        group_id: s.groupId,
                        group_name: s.groupName,
                        role: 'owner',
                        is_owner: true,
                        sharingStatus: s.sharingStatus || 'local',
                        visibility: s.visibility || 'local',
                        shareToken: s.shareToken,
                    };
                    const newHistory = existingIndex >= 0
                        ? s.billHistory.map((b, i) => i === existingIndex ? { ...b, ...historyItem } : b)
                        : [historyItem, ...s.billHistory];
                    return {
                        billHistory: newHistory,
                        lastSaved: updatedAt,
                    };
                });

                // 2. Check storage mode configuration
                const storageMode = useAppSettingsStore.getState().storageMode;
                const shouldCloudSync =
                    storageMode === 'cloud' ||
                    storageMode === 'hybrid' ||
                    state.sharingStatus === 'shared';

                // In "Local Only" mode, do not transmit to server unless the bill has been explicitly shared
                if (!shouldCloudSync) {
                    return billId;
                }

                // 3. Serialized background asynchronous cloud sync (non-blocking, 0ms freeze, zero race conditions)
                syncCoordinator.scheduleSync(billId, async () => {
                    const db = getLocalDb();
                    // Always read freshest snapshot from local storage to prevent stale writes
                    const latestBill = await db.getBill(billId);
                    if (!latestBill) return;

                    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
                    if (isOffline) {
                        const errMsg = 'Offline: changes saved locally, queued for sync';
                        latestBill.syncError = errMsg;
                        await db.saveBill(latestBill);
                        set({ syncError: errMsg });
                        await syncManager.enqueueOperation({
                            billId,
                            type: 'update',
                        });
                        return;
                    }

                    try {
                        const response = await fetch('/api/bills', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: latestBill.id,
                                isShared: latestBill.sharingStatus === 'shared',
                                visibility: latestBill.visibility,
                                shareToken: latestBill.shareToken,
                                data: {
                                    name: latestBill.name,
                                    location: latestBill.location,
                                    people: latestBill.people,
                                    items: latestBill.items,
                                    globalCharges: latestBill.globalCharges,
                                    hostId: latestBill.hostId,
                                    qrCode: latestBill.qrCode,
                                    currency: latestBill.currency,
                                    groupId: latestBill.groupId,
                                    visibility: latestBill.visibility,
                                    shareToken: latestBill.shareToken,
                                }
                            })
                        });

                        if (response.ok) {
                            const result = await response.json();
                            const syncedAt = new Date().toISOString();
                            latestBill.lastSyncedAt = syncedAt;
                            latestBill.syncError = null;
                            await db.saveBill(latestBill);

                            // Clear any obsolete pending update ops for this bill in localDb
                            const pendingOps = await db.getPendingOps();
                            for (const op of pendingOps) {
                                if (op.billId === billId && (op.type === 'upload' || op.type === 'update')) {
                                    await db.removePendingOp(op.id);
                                }
                            }

                            if (result.id) {
                                set({
                                    currentBillId: result.id,
                                    syncError: null,
                                });
                                if (typeof window !== 'undefined') {
                                    const url = new URL(window.location.href);
                                    if (url.searchParams.get('id') !== result.id && url.searchParams.get('view') !== 'landing') {
                                        url.searchParams.set('id', result.id);
                                        if (latestBill.groupId) {
                                            url.searchParams.set('groupId', latestBill.groupId);
                                        }
                                        window.history.replaceState({}, '', url.toString());
                                    }
                                }
                            }
                        } else {
                            const errBody = await response.json().catch(() => ({}));
                            const errMsg = errBody.error || `Server responded with ${response.status}`;
                            latestBill.syncError = errMsg;
                            await db.saveBill(latestBill);
                            set({ syncError: errMsg });
                            await syncManager.enqueueOperation({
                                billId,
                                type: 'update',
                            });
                        }
                    } catch (error: any) {
                        const errMsg = error.message || 'Cloud sync network failure';
                        console.warn("Background cloud sync deferred:", error);
                        latestBill.syncError = errMsg;
                        await db.saveBill(latestBill);
                        set({ syncError: errMsg });
                        await syncManager.enqueueOperation({
                            billId,
                            type: 'update',
                        });
                    }
                });

                return billId;
            },

            deleteBill: async (id?: string) => {
                const billId = id || get().currentBillId;
                if (!billId) return false;

                // 1. Delete from local DB & clear pending upload/update ops
                try {
                    const localDb = getLocalDb();
                    await localDb.deleteBill(billId);
                    const pendingOps = await localDb.getPendingOps();
                    for (const op of pendingOps) {
                        if (op.billId === billId && (op.type === 'upload' || op.type === 'update')) {
                            await localDb.removePendingOp(op.id);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to delete bill locally:', e);
                }

                // 2. Delete from server API (with offline queue fallback)
                const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
                if (isOffline) {
                    await syncManager.enqueueOperation({
                        billId,
                        type: 'delete',
                    });
                } else {
                    try {
                        const res = await fetch(`/api/bills/${billId}`, { method: 'DELETE' });
                        if (!res.ok && res.status !== 404) {
                            await syncManager.enqueueOperation({
                                billId,
                                type: 'delete',
                            });
                        }
                    } catch (e) {
                        console.warn('Failed to delete bill on server:', e);
                        await syncManager.enqueueOperation({
                            billId,
                            type: 'delete',
                        });
                    }
                }

                // 3. Reset active bill if currently loaded
                if (get().currentBillId === billId) {
                    get().resetBill();
                }

                // 4. Update billHistory state immediately
                set((state) => ({
                    billHistory: state.billHistory.filter((b) => b.id !== billId),
                }));

                // 5. Refresh groups and history
                await get().fetchHistory();
                await useGroupStore.getState().fetchGroups();
                const curGroup = useGroupStore.getState().currentGroup;
                if (curGroup) {
                    await useGroupStore.getState().fetchGroup(curGroup.id);
                }

                return true;
            },

            enableSharing: async (visibility: BillVisibility) => {
                const state = get();
                const billId = state.currentBillId || (await get().saveToLocal());
                if (!billId) return false;

                const shareToken = crypto.randomUUID().replace(/-/g, '');
                set({
                    sharingStatus: 'uploading',
                    visibility,
                    shareToken,
                    syncError: null,
                });

                try {
                    const response = await fetch(`/api/bills/${billId}/share`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            visibility,
                            regenerateToken: true,
                        }),
                    });

                    // If share endpoint returned 404, upload via POST /api/bills
                    if (!response.ok && response.status === 404) {
                        await fetch('/api/bills', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: billId,
                                isShared: true,
                                visibility,
                                shareToken,
                                data: {
                                    name: state.billName,
                                    location: state.location,
                                    people: state.people,
                                    items: state.items,
                                    globalCharges: state.globalCharges,
                                    hostId: state.hostId,
                                    qrCode: state.qrCode,
                                    currency: state.currency,
                                    groupId: state.groupId,
                                    visibility,
                                    shareToken,
                                }
                            })
                        });
                    }

                    set({
                        sharingStatus: 'shared',
                        visibility,
                        shareToken,
                        lastSaved: new Date().toISOString(),
                    });
                    await get().saveToLocal();
                    await get().fetchHistory();
                    return true;
                } catch (err: any) {
                    console.error('Failed to enable cloud sharing:', err);
                    set({
                        sharingStatus: 'sync_error',
                        syncError: err.message || 'Failed to upload bill for sharing',
                    });
                    return false;
                }
            },

            disableSharing: async () => {
                const state = get();
                const billId = state.currentBillId;
                if (!billId) return false;

                // Check offline status
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    set({
                        sharingStatus: 'revocation_pending',
                        syncError: 'Offline: Revocation will complete once reconnected',
                    });
                    await get().saveToLocal();
                    await syncManager.enqueueOperation({
                        billId,
                        type: 'revoke',
                    });
                    return true;
                }

                set({ sharingStatus: 'revoking' });
                try {
                    const res = await fetch(`/api/bills/${billId}?revoke=1`, {
                        method: 'DELETE',
                    });

                    if (res.ok || res.status === 404) {
                        set({
                            sharingStatus: 'local',
                            visibility: 'local',
                            shareToken: null,
                            syncError: null,
                        });
                        await get().saveToLocal();
                        await get().fetchHistory();
                        return true;
                    } else {
                        throw new Error('Server failed to revoke sharing');
                    }
                } catch (err: any) {
                    console.error('Failed to disable sharing:', err);
                    set({
                        sharingStatus: 'revocation_pending',
                        syncError: 'Failed to revoke cloud copy. Queued for retry.',
                    });
                    await syncManager.enqueueOperation({
                        billId,
                        type: 'revoke',
                    });
                    return false;
                }
            },

            updateSharingVisibility: async (newVisibility: BillVisibility) => {
                const state = get();
                const billId = state.currentBillId;
                if (!billId) return false;

                try {
                    const res = await fetch(`/api/bills/${billId}/share`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            visibility: newVisibility,
                        }),
                    });

                    if (res.ok) {
                        set({ visibility: newVisibility });
                        await get().saveToLocal();
                        return true;
                    }
                } catch (e) {
                    console.error('Failed to update sharing visibility:', e);
                }
                return false;
            },

            fetchBill: async (id: string, isShare: boolean = false, token?: string | null) => {
                let localBill: LocalBillRecord | null = null;
                // 1. Try local storage first for instant rendering
                if (!isShare) {
                    try {
                        const localDb = getLocalDb();
                        localBill = await localDb.getBill(id);
                        if (localBill) {
                            set({
                                billName: localBill.name || '',
                                location: localBill.location || '',
                                qrCode: localBill.qrCode || null,
                                currency: localBill.currency || 'VND',
                                groupId: localBill.groupId || null,
                                groupName: localBill.groupName || null,
                                currentBillId: localBill.id,
                                people: localBill.people || [],
                                items: localBill.items || [],
                                globalCharges: localBill.globalCharges || [],
                                hostId: localBill.hostId || null,
                                sharingStatus: localBill.sharingStatus || 'local',
                                visibility: localBill.visibility || 'local',
                                shareToken: localBill.shareToken || null,
                                lastSaved: localBill.updatedAt,
                                isReadOnly: false,
                            });
                        }
                    } catch (e) {
                        console.warn('Local bill lookup failed, falling back to server:', e);
                    }
                }

                // If offline and we already loaded a local copy, we can stop here
                const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
                if (isOffline && localBill) {
                    return;
                }

                // 2. Background Revalidate / Fetch from server API
                try {
                    let url = isShare ? `/api/bills/${id}?share=1` : `/api/bills/${id}`;
                    if (token) {
                        url += `&token=${encodeURIComponent(token)}`;
                    }
                    const response = await fetch(url);
                    if (!response.ok) {
                        // If we already loaded a valid local bill, gracefully retain it on network error
                        if (localBill) return;
                        const err = await response.json().catch(() => ({}));
                        const errorMsg = err.error || "Bill not found or share link has been revoked";
                        const customError: any = new Error(errorMsg);
                        customError.status = response.status;
                        customError.isForbidden = response.status === 403 || errorMsg.toLowerCase().includes('forbidden') || errorMsg.toLowerCase().includes('restricted');
                        throw customError;
                    }

                    const result = await response.json();
                    const serverTime = new Date(result.updated_at).getTime();
                    const localTime = localBill ? new Date(localBill.updatedAt).getTime() : 0;

                    // Check if local has pending unsynced operations
                    let hasPendingSync = false;
                    try {
                        const db = getLocalDb();
                        const pendingOps = await db.getPendingOps();
                        hasPendingSync = pendingOps.some(op => op.billId === id && op.type !== 'revoke');
                    } catch {}

                    const isLocallySyncing = syncCoordinator.isSyncing(id);

                    // Only update in-memory state if:
                    // 1) We have no local bill cached, OR
                    // 2) There are NO local unsynced pending operations AND server is strictly newer
                    const isStrictlyNewer = serverTime > (localTime + 1000);
                    if (!localBill || (!hasPendingSync && !isLocallySyncing && isStrictlyNewer)) {
                        set({
                            ...result.data,
                            billName: result.data.name || '',
                            location: result.data.location || '',
                            qrCode: result.data.qrCode || null,
                            currency: result.data.currency || 'VND',
                            groupId: result.group_id || result.data.groupId || null,
                            groupName: result.group_name || result.data.groupName || null,
                            currentBillId: result.id,
                            lastSaved: result.updated_at,
                            isReadOnly: Boolean(isShare || result.isReadOnly),
                            sharingStatus: result.isShared !== false ? 'shared' : 'local',
                            visibility: result.visibility || 'restricted',
                            shareToken: result.shareToken || null,
                        });

                        // Save downloaded bill to local storage in background
                        get().saveToLocal().catch(() => {});
                    } else if (hasPendingSync) {
                        // Local has newer unsynced edits: trigger background push to sync up to cloud!
                        syncManager.processPendingOperations().catch(() => {});
                    }
                } catch (error) {
                    if (localBill) {
                        // Suppress network error if local copy is already serving the user
                        return;
                    }
                    console.error("Failed to fetch bill:", error);
                    throw error;
                }
            },

            fetchHistory: async () => {
                set({ isHistoryLoading: true });
                get().fetchDbStatus();
                const historyMap = new Map<string, BillHistoryItem>();

                // 1. Load local bills first
                const pendingDeleteIds = new Set<string>();
                try {
                    const localDb = getLocalDb();
                    const pendingOps = await localDb.getPendingOps();
                    for (const op of pendingOps) {
                        if (op.type === 'delete') {
                            pendingDeleteIds.add(op.billId);
                        }
                    }

                    const localBills = await localDb.listBills();
                    for (const b of localBills) {
                        if (pendingDeleteIds.has(b.id)) continue;
                        const total = calculateBillTotals(b).totalAmount;

                        historyMap.set(b.id, {
                            id: b.id,
                            name: b.name,
                            location: b.location || undefined,
                            created_at: b.createdAt,
                            updated_at: b.updatedAt,
                            totalAmount: total,
                            group_id: b.groupId,
                            group_name: b.groupName,
                            role: 'owner',
                            is_owner: true,
                            sharingStatus: b.sharingStatus,
                            visibility: b.visibility,
                            shareToken: b.shareToken,
                        });
                    }

                    // Fast initial display: if local bills exist, populate immediately
                    if (historyMap.size > 0) {
                        const localSorted = Array.from(historyMap.values()).sort((a, b) => {
                            const timeA = new Date(a.created_at || a.updated_at || 0).getTime();
                            const timeB = new Date(b.created_at || b.updated_at || 0).getTime();
                            return timeB !== timeA ? timeB - timeA : a.id.localeCompare(b.id);
                        });
                        set({ billHistory: localSorted });
                    }
                } catch (e) {
                    console.warn('Failed to load local bills for history:', e);
                }

                // 2. Fetch server bills and merge
                try {
                    const response = await fetch('/api/bills');
                    if (response.ok) {
                        const serverData: BillHistoryItem[] = await response.json();
                        for (const sb of serverData) {
                            if (pendingDeleteIds.has(sb.id)) continue;

                            const existing = historyMap.get(sb.id);
                            if (existing) {
                                const localTime = new Date(existing.updated_at).getTime();
                                const serverTime = new Date(sb.updated_at).getTime();
                                const isLocalNewer = localTime >= serverTime;

                                historyMap.set(sb.id, {
                                    ...sb,
                                    name: isLocalNewer ? (existing.name || sb.name) : (sb.name || existing.name),
                                    location: isLocalNewer ? (existing.location || sb.location) : (sb.location || existing.location),
                                    totalAmount: isLocalNewer ? existing.totalAmount : (sb.totalAmount ?? existing.totalAmount),
                                    group_id: isLocalNewer ? existing.group_id : (sb.group_id ?? existing.group_id),
                                    group_name: isLocalNewer ? existing.group_name : (sb.group_name ?? existing.group_name),
                                    sharingStatus: existing.sharingStatus || 'shared',
                                    visibility: existing.visibility || sb.visibility || 'restricted',
                                    shareToken: existing.shareToken || sb.shareToken || null,
                                });
                            } else {
                                historyMap.set(sb.id, {
                                    ...sb,
                                    sharingStatus: 'shared',
                                    visibility: sb.visibility || 'restricted',
                                    shareToken: sb.shareToken || null,
                                });
                            }
                        }
                    }
                } catch {
                    // Offline or server unavailable: local bills will still display!
                } finally {
                    const sorted = Array.from(historyMap.values()).sort((a, b) => {
                        const timeA = new Date(a.created_at || a.updated_at || 0).getTime();
                        const timeB = new Date(b.created_at || b.updated_at || 0).getTime();
                        return timeB !== timeA ? timeB - timeA : a.id.localeCompare(b.id);
                    });
                    set({ billHistory: sorted, isHistoryLoading: false });
                }
            },

            fetchDbStatus: async () => {
                try {
                    const response = await fetch('/api/health');
                    if (!response.ok) throw new Error("Health check failed");
                    const data = await response.json();
                    set({
                        dbStatus: {
                            ...data.database,
                            isOnline: true,
                        }
                    });
                } catch {
                    set((state) => ({
                        dbStatus: {
                            ...state.dbStatus,
                            isOnline: false,
                        }
                    }));
                }
            },

            loadSeedData: () => {
                const alexId = crypto.randomUUID();
                const bobId = crypto.randomUUID();
                const charlieId = crypto.randomUUID();
                const davidId = crypto.randomUUID();
                const eveId = crypto.randomUUID();

                const isUSD = get().currency === 'USD';
                const conv = (v: number) => isUSD ? Number((v / VND_PER_USD).toFixed(2)) : v;

                set({
                    billName: "Friday Night BBQ @ Gyu-Kaku",
                    location: "District 1, HCMC",
                    hostId: alexId,
                    qrCode: null,
                    sharingStatus: 'local',
                    visibility: 'local',
                    shareToken: null,
                    people: [
                        { id: alexId, name: "Alex", sponsorAmount: 0, paidAmount: conv(1800000) },
                        { id: bobId, name: "Bob", sponsorAmount: 0, paidAmount: conv(200000) },
                        { id: charlieId, name: "Charlie", sponsorAmount: conv(500000), paidAmount: 0 },
                        { id: davidId, name: "David", sponsorAmount: 0, paidAmount: 0 },
                        { id: eveId, name: "Eve", sponsorAmount: 0, paidAmount: 0 },
                    ],
                    items: [
                        {
                            id: crypto.randomUUID(),
                            name: "Wagyu Party Set",
                            price: conv(1200000),
                            quantity: 1,
                            assignments: { [alexId]: 1, [bobId]: 1, [charlieId]: 1, [davidId]: 1, [eveId]: 1 }
                        },
                        {
                            id: crypto.randomUUID(),
                            name: "Tiger Beer Tower",
                            price: conv(450000),
                            quantity: 1,
                            assignments: { [alexId]: 1, [bobId]: 1, [davidId]: 1 }
                        },
                        {
                            id: crypto.randomUUID(),
                            name: "Grilled Corn",
                            price: conv(120000),
                            quantity: 3,
                            assignments: { [eveId]: 2, [davidId]: 1 }
                        },
                        {
                            id: crypto.randomUUID(),
                            name: "Special Kimchi",
                            price: conv(80000),
                            quantity: 2,
                            assignments: { [charlieId]: 1, [eveId]: 1 }
                        },
                        {
                            id: crypto.randomUUID(),
                            name: "Mineral Water",
                            price: conv(60000),
                            quantity: 3,
                            assignments: { [bobId]: 1, [alexId]: 1, [charlieId]: 1 }
                        }
                    ],
                    globalCharges: [
                        { id: crypto.randomUUID(), name: "VAT", amount: 10, type: 'percent' },
                        { id: crypto.randomUUID(), name: "Service Charge", amount: 5, type: 'percent' },
                        { id: crypto.randomUUID(), name: "Evening Discount", amount: conv(100000), type: 'fixed' }
                    ]
                });
            }

        }),
        {
            name: 'bill-storage',
            partialize: (state) => ({
                people: state.people,
                items: state.items,
                globalCharges: state.globalCharges,
                hostId: state.hostId,
                currentBillId: state.currentBillId,
                billName: state.billName,
                location: state.location,
                qrCode: state.qrCode,
                currency: state.currency,
                groupId: state.groupId,
                groupName: state.groupName,
                sharingStatus: state.sharingStatus,
                visibility: state.visibility,
                shareToken: state.shareToken,
            }),
            onRehydrateStorage: () => (state) => {
                if (state) state.setHydrated(true);
            },
        }
    )
);
