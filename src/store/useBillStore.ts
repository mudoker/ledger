import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchExchangeRate, convertCurrency } from '@/lib/currency';
import { useGroupStore } from './useGroupStore';
import { useAppSettingsStore } from './useAppSettingsStore';
import { useAuthStore } from './useAuthStore';
import { getLocalDb } from '@/lib/local-db';
import { syncManager, syncCoordinator } from '@/lib/local-db/sync-manager';
import type { BillSharingStatus, BillVisibility, LocalBillRecord } from '@/lib/local-db/types';
import { calculateBillTotals, parseTimestampMs } from '@/lib/common-data-model';

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
    currency?: CurrencyCode;
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

                // Only notify server of group assignment/unassignment if cloud sync is enabled or bill is explicitly shared
                const storageMode = useAppSettingsStore.getState().storageMode;
                const shouldCloudSync =
                    storageMode === 'cloud' ||
                    storageMode === 'hybrid' ||
                    get().sharingStatus === 'shared';

                if (shouldCloudSync) {
                    const effectiveVis = !get().visibility || get().visibility === 'local' ? 'restricted' : get().visibility;
                    set({
                        sharingStatus: 'shared',
                        visibility: effectiveVis,
                    });
                }

                // Save locally immediately (except in cloud-only mode where local data is not updated on edits)
                if (storageMode !== 'cloud') {
                    await get().saveToLocal();
                }

                const billId = get().currentBillId;
                if (billId && shouldCloudSync) {
                    const effectiveVis = !get().visibility || get().visibility === 'local' ? 'restricted' : get().visibility;
                    try {
                        await fetch('/api/bills', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: billId,
                                isShared: true,
                                visibility: effectiveVis,
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
                                    visibility: effectiveVis,
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
                set((state) => {
                    const prevCount = state.people.length;
                    const updatedItems = state.items.map((item) => {
                        const assignments = item.assignments || {};
                        const assignedIds = Object.keys(assignments).filter((k) => assignments[k] > 0);
                        const wasSplitForAll =
                            prevCount === 0 ||
                            (prevCount > 0 &&
                                assignedIds.length === prevCount &&
                                state.people.every((p) => assignments[p.id] === 1));
                        if (wasSplitForAll && assignedIds.length > 0) {
                            return {
                                ...item,
                                assignments: { ...assignments, [newPerson.id]: 1 },
                            };
                        }
                        if (prevCount === 0 && assignedIds.length === 0) {
                            return {
                                ...item,
                                assignments: { [newPerson.id]: 1 },
                            };
                        }
                        return item;
                    });
                    return {
                        people: [...state.people, newPerson],
                        items: updatedItems,
                    };
                });
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
                set((state) => {
                    const prevCount = state.people.length;
                    const updatedItems = state.items.map((item) => {
                        const assignments = item.assignments || {};
                        const assignedIds = Object.keys(assignments).filter((k) => assignments[k] > 0);
                        const wasSplitForAll =
                            prevCount === 0 ||
                            (prevCount > 0 &&
                                assignedIds.length === prevCount &&
                                state.people.every((p) => assignments[p.id] === 1));
                        if ((wasSplitForAll && assignedIds.length > 0) || (prevCount === 0 && assignedIds.length === 0)) {
                            const nextAssignments = { ...assignments };
                            for (const cp of created) {
                                nextAssignments[cp.id] = 1;
                            }
                            return {
                                ...item,
                                assignments: nextAssignments,
                            };
                        }
                        return item;
                    });
                    return {
                        people: [...state.people, ...created],
                        items: updatedItems,
                    };
                });
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
                set((state) => {
                    const defaultAssignments: Record<string, number> = {};
                    state.people.forEach((p) => {
                        defaultAssignments[p.id] = 1;
                    });
                    return {
                        items: [
                            ...state.items,
                            {
                                id: crypto.randomUUID(),
                                name,
                                price,
                                quantity,
                                assignments: defaultAssignments,
                            },
                        ],
                    };
                }),

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

            resetBill: () => {
                const storageMode = useAppSettingsStore.getState().storageMode;
                const isAutoCloud = storageMode === 'cloud' || storageMode === 'hybrid';
                return set((state) => ({
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
                    sharingStatus: isAutoCloud ? 'shared' : 'local',
                    visibility: isAutoCloud ? 'restricted' : 'local',
                    shareToken: null,
                    syncError: null,
                }));
            },

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

                try {
                    const db = getLocalDb();
                    const existingLocal = await db.getBill(billId).catch(() => null);
                    const existingHistory = state.billHistory.find(b => b.id === billId);
                    const nowIso = new Date().toISOString();

                    const localBill: LocalBillRecord = {
                        id: billId,
                        name: state.billName,
                        location: state.location,
                        currency: state.currency,
                        hostId: state.hostId,
                        qrCode: state.qrCode,
                        groupId: state.groupId,
                        groupName: state.groupName,
                        ownerId: existingLocal?.ownerId || useAuthStore.getState().user?.id || null,
                        people: state.people,
                        items: state.items,
                        globalCharges: state.globalCharges,
                        sharingStatus: state.sharingStatus,
                        visibility: state.visibility,
                        shareToken: state.shareToken,
                        lastSyncedAt: state.lastSaved,
                        syncError: state.syncError,
                        createdAt: existingLocal?.createdAt || existingHistory?.created_at || state.lastSaved || nowIso,
                        updatedAt: nowIso,
                    };

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

                const storageMode = useAppSettingsStore.getState().storageMode;
                const shouldCloudSync =
                    storageMode === 'cloud' ||
                    storageMode === 'hybrid' ||
                    state.sharingStatus === 'shared';

                const effectiveSharingStatus = shouldCloudSync ? 'shared' : (state.sharingStatus || 'local');
                const effectiveVisibility = shouldCloudSync
                    ? (!state.visibility || state.visibility === 'local' ? 'restricted' : state.visibility)
                    : (state.visibility || 'local');

                if (state.sharingStatus !== effectiveSharingStatus || state.visibility !== effectiveVisibility) {
                    set({
                        sharingStatus: effectiveSharingStatus,
                        visibility: effectiveVisibility,
                    });
                }

                // 1. Persist to local IndexedDB in 'local' and 'hybrid' modes.
                // In 'cloud' (Cloud Only) mode, do NOT continue updating localDb (while keeping existing localDb data intact).
                let billId: string | null = null;
                const nowIso = new Date().toISOString();
                if (storageMode !== 'cloud') {
                    billId = (await get().saveToLocal()) || state.currentBillId;
                } else {
                    billId = state.currentBillId || crypto.randomUUID();
                    set({
                        currentBillId: billId,
                        lastSaved: nowIso,
                    });
                    if (state.groupId) {
                        useGroupStore.getState().syncGroupWithBills(state.groupId);
                    }
                }
                if (!billId) return null;

                // Optimistically update in-memory bill history immediately without waiting for server
                const currentState = get();
                const totals = calculateBillTotals({ items: currentState.items, globalCharges: currentState.globalCharges });
                const updatedAt = currentState.lastSaved || nowIso;
                set((s) => {
                    const existingIndex = s.billHistory.findIndex((b) => b.id === billId);
                    const existingItem = existingIndex >= 0 ? s.billHistory[existingIndex] : undefined;
                    const historyItem: BillHistoryItem = {
                        id: billId,
                        name: s.billName,
                        location: s.location || undefined,
                        currency: s.currency || 'VND',
                        created_at: existingItem?.created_at || s.lastSaved || updatedAt,
                        updated_at: updatedAt,
                        totalAmount: totals.totalAmount,
                        group_id: s.groupId,
                        group_name: s.groupName,
                        role: 'owner',
                        is_owner: true,
                        sharingStatus: effectiveSharingStatus,
                        visibility: effectiveVisibility,
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

                // In "Local Only" mode, do not transmit to server unless the bill has been explicitly shared
                if (!shouldCloudSync) {
                    return billId;
                }

                // Capture snapshot for cloud upload (used when storageMode === 'cloud' or if active bill changes)
                const capturedSnapshot: LocalBillRecord = {
                    id: billId,
                    name: currentState.billName,
                    location: currentState.location,
                    currency: currentState.currency,
                    hostId: currentState.hostId,
                    qrCode: currentState.qrCode,
                    groupId: currentState.groupId,
                    groupName: currentState.groupName,
                    ownerId: useAuthStore.getState().user?.id || null,
                    people: currentState.people,
                    items: currentState.items,
                    globalCharges: currentState.globalCharges,
                    sharingStatus: 'shared',
                    visibility: effectiveVisibility,
                    shareToken: currentState.shareToken,
                    lastSyncedAt: currentState.lastSaved,
                    syncError: null,
                    createdAt: currentState.lastSaved || nowIso,
                    updatedAt: updatedAt,
                };

                // 3. Serialized background asynchronous cloud sync (non-blocking, 0ms freeze, zero race conditions)
                syncCoordinator.scheduleSync(billId, async () => {
                    const db = getLocalDb();
                    const modeNow = useAppSettingsStore.getState().storageMode;
                    let latestBill: LocalBillRecord | null = null;
                    if (modeNow !== 'cloud') {
                        latestBill = await db.getBill(billId);
                    }
                    if (!latestBill) {
                        const live = get();
                        latestBill = live.currentBillId === billId
                            ? {
                                id: billId,
                                name: live.billName,
                                location: live.location,
                                currency: live.currency,
                                hostId: live.hostId,
                                qrCode: live.qrCode,
                                groupId: live.groupId,
                                groupName: live.groupName,
                                ownerId: useAuthStore.getState().user?.id || null,
                                people: live.people,
                                items: live.items,
                                globalCharges: live.globalCharges,
                                sharingStatus: 'shared',
                                visibility: !live.visibility || live.visibility === 'local' ? 'restricted' : live.visibility,
                                shareToken: live.shareToken,
                                lastSyncedAt: live.lastSaved,
                                syncError: live.syncError,
                                createdAt: capturedSnapshot.createdAt,
                                updatedAt: live.lastSaved || new Date().toISOString(),
                            }
                            : capturedSnapshot;
                    }

                    const uploadVisibility = !latestBill.visibility || latestBill.visibility === 'local'
                        ? 'restricted'
                        : latestBill.visibility;

                    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
                    if (isOffline) {
                        const errMsg = 'Offline: changes saved locally, queued for sync';
                        latestBill.syncError = errMsg;
                        if (modeNow !== 'cloud') {
                            await db.saveBill(latestBill);
                        }
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
                                isShared: true,
                                visibility: uploadVisibility,
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
                                    visibility: uploadVisibility,
                                    shareToken: latestBill.shareToken,
                                }
                            })
                        });

                        if (response.ok) {
                            const result = await response.json();
                            const syncedAt = new Date().toISOString();
                            latestBill.sharingStatus = 'shared';
                            latestBill.visibility = uploadVisibility;
                            latestBill.lastSyncedAt = syncedAt;
                            latestBill.syncError = null;
                            if (modeNow !== 'cloud') {
                                await db.saveBill(latestBill);
                            }

                            // Clear any obsolete pending update ops for this bill in localDb
                            const pendingOps = await db.getPendingOps();
                            for (const op of pendingOps) {
                                if (op.billId === billId && (op.type === 'upload' || op.type === 'update')) {
                                    await db.removePendingOp(op.id);
                                }
                            }

                            set((s) => ({
                                currentBillId: result.id || s.currentBillId,
                                sharingStatus: s.currentBillId === billId ? 'shared' : s.sharingStatus,
                                visibility: s.currentBillId === billId ? uploadVisibility : s.visibility,
                                syncError: null,
                                billHistory: s.billHistory.map((b) =>
                                    b.id === billId
                                        ? { ...b, sharingStatus: 'shared', visibility: uploadVisibility }
                                        : b
                                ),
                            }));

                            if (result.id) {
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
                            if (modeNow !== 'cloud') {
                                await db.saveBill(latestBill);
                            }
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
                        if (modeNow !== 'cloud') {
                            await db.saveBill(latestBill);
                        }
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
                const storageMode = useAppSettingsStore.getState().storageMode;
                let billId = state.currentBillId;
                if (!billId) {
                    if (storageMode !== 'cloud') {
                        billId = await get().saveToLocal();
                    } else {
                        billId = crypto.randomUUID();
                        set({ currentBillId: billId });
                    }
                }
                if (!billId) return false;

                let shareToken = state.shareToken || crypto.randomUUID().replace(/-/g, '');
                set({
                    sharingStatus: 'uploading',
                    visibility,
                    shareToken,
                    syncError: null,
                });

                const currentPayloadData = {
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
                };

                try {
                    const response = await fetch(`/api/bills/${billId}/share`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            visibility,
                            regenerateToken: !state.shareToken,
                            shareToken,
                            data: currentPayloadData,
                        }),
                    });

                    // If share endpoint returned 404, upload via POST /api/bills
                    if (!response.ok && response.status === 404) {
                        const uploadRes = await fetch('/api/bills', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: billId,
                                isShared: true,
                                visibility,
                                shareToken,
                                data: currentPayloadData,
                            })
                        });
                        if (!uploadRes.ok) {
                            throw new Error('Failed to upload bill for sharing');
                        }
                    } else if (response.ok) {
                        const resJson = await response.json().catch(() => null);
                        if (resJson && typeof resJson.shareToken === 'string' && resJson.shareToken.length > 0) {
                            shareToken = resJson.shareToken;
                        }
                    } else {
                        throw new Error('Server rejected sharing request');
                    }

                    const nowIso = new Date().toISOString();
                    set((s) => ({
                        sharingStatus: 'shared',
                        visibility,
                        shareToken,
                        lastSaved: nowIso,
                        billHistory: s.billHistory.map(b =>
                            b.id === billId
                                ? { ...b, sharingStatus: 'shared', visibility, shareToken, updated_at: nowIso }
                                : b
                        ),
                    }));
                    if (useAppSettingsStore.getState().storageMode !== 'cloud') {
                        await get().saveToLocal();
                    }
                    await get().fetchHistory();
                    if (state.groupId) {
                        await useGroupStore.getState().syncGroupWithBills(state.groupId);
                    }
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
                if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    set((s) => ({
                        sharingStatus: 'revocation_pending',
                        syncError: 'Offline: Revocation will complete once reconnected',
                        billHistory: s.billHistory.map(b =>
                            b.id === billId
                                ? { ...b, sharingStatus: 'revocation_pending' }
                                : b
                        ),
                    }));
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
                        set((s) => ({
                            sharingStatus: 'local',
                            visibility: 'local',
                            shareToken: null,
                            syncError: null,
                            billHistory: s.billHistory.map(b =>
                                b.id === billId
                                    ? { ...b, sharingStatus: 'local', visibility: 'local', shareToken: null }
                                    : b
                            ),
                        }));
                        await get().saveToLocal();
                        await get().fetchHistory();
                        if (state.groupId) {
                            await useGroupStore.getState().syncGroupWithBills(state.groupId);
                        }
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
                        const resJson = await res.json().catch(() => null);
                        const updatedToken = (resJson && typeof resJson.shareToken === 'string' && resJson.shareToken.length > 0)
                            ? resJson.shareToken
                            : get().shareToken;

                        set((s) => ({
                            visibility: newVisibility,
                            shareToken: updatedToken,
                            billHistory: s.billHistory.map(b =>
                                b.id === billId
                                    ? { ...b, visibility: newVisibility, shareToken: updatedToken }
                                    : b
                            ),
                        }));
                        if (useAppSettingsStore.getState().storageMode !== 'cloud') {
                            await get().saveToLocal();
                        }
                        if (state.groupId) {
                            await useGroupStore.getState().syncGroupWithBills(state.groupId);
                        }
                        return true;
                    }
                } catch (e) {
                    console.error('Failed to update sharing visibility:', e);
                }
                return false;
            },

            fetchBill: async (id: string, isShare: boolean = false, token?: string | null) => {
                let localBill: LocalBillRecord | null = null;
                const storageMode = useAppSettingsStore.getState().storageMode;
                const isAutoSyncMode = storageMode === 'cloud' || storageMode === 'hybrid';
                // 1. Try local storage first for instant rendering
                if (!isShare) {
                    try {
                        const localDb = getLocalDb();
                        localBill = await localDb.getBill(id);
                        if (localBill) {
                            const localSharing = isAutoSyncMode && localBill.sharingStatus !== 'revocation_pending'
                                ? 'shared'
                                : (localBill.sharingStatus || 'local');
                            const localVis = localSharing === 'shared' && (!localBill.visibility || localBill.visibility === 'local')
                                ? 'restricted'
                                : (localBill.visibility || 'local');
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
                                sharingStatus: localSharing,
                                visibility: localVis,
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
                        url += `${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
                    }
                    const activeGroupId = get().groupId || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('groupId') : null);
                    if (activeGroupId) {
                        url += `${url.includes('?') ? '&' : '?'}groupId=${encodeURIComponent(activeGroupId)}`;
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
                    const serverTime = parseTimestampMs(result.updated_at);
                    const localTime = localBill ? parseTimestampMs(localBill.updatedAt) : 0;

                    // Check if local has pending unsynced operations
                    let hasPendingSync = false;
                    try {
                        const db = getLocalDb();
                        const pendingOps = await db.getPendingOps();
                        hasPendingSync = pendingOps.some(op => op.billId === id && op.type !== 'revoke');
                    } catch {}

                    const isLocallySyncing = syncCoordinator.isSyncing(id);

                    // Update in-memory state if:
                    // 1) We have no local bill cached, OR
                    // 2) There are NO local unsynced pending operations AND (storageMode is 'cloud' OR server is newer/equal)
                    const currentMode = useAppSettingsStore.getState().storageMode;
                    const isAutoCloud = currentMode === 'cloud' || currentMode === 'hybrid';
                    const isServerAuthoritative = currentMode === 'cloud' || serverTime >= localTime;
                    if (!localBill || (!hasPendingSync && !isLocallySyncing && isServerAuthoritative)) {
                        const resolvedSharing = isAutoCloud || result.isShared !== false ? 'shared' : 'local';
                        const resolvedVis = resolvedSharing === 'shared' && (!result.visibility || result.visibility === 'local')
                            ? 'restricted'
                            : (result.visibility || 'restricted');
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
                            sharingStatus: resolvedSharing,
                            visibility: resolvedVis,
                            shareToken: result.shareToken || null,
                        });

                        // Save downloaded authoritative bill snapshot directly to local storage preserving server updated_at
                        if (!isShare && currentMode !== 'cloud') {
                            const localDb = getLocalDb();
                            const serverSnapshot: LocalBillRecord = {
                                id: result.id,
                                name: result.data?.name || result.name || '',
                                location: result.data?.location || result.location || null,
                                currency: result.data?.currency || result.currency || 'VND',
                                hostId: result.data?.hostId || result.host_id || null,
                                qrCode: result.data?.qrCode || result.qr_code || null,
                                groupId: result.group_id || result.data?.groupId || null,
                                groupName: result.group_name || result.data?.groupName || null,
                                ownerId: result.owner_id || useAuthStore.getState().user?.id || null,
                                people: (result.data?.people || []).map((p: any) => ({
                                    id: p.id,
                                    name: p.name,
                                    sponsorAmount: p.sponsorAmount ?? 0,
                                    paidAmount: p.paidAmount ?? 0,
                                    userId: p.userId || null,
                                    email: p.email || null,
                                })),
                                items: (result.data?.items || []).map((it: any) => ({
                                    id: it.id,
                                    name: it.name,
                                    price: Number(it.price || 0),
                                    quantity: Number(it.quantity || 1),
                                    assignments: it.assignments || {},
                                })),
                                globalCharges: (result.data?.globalCharges || []).map((gc: any) => ({
                                    id: gc.id,
                                    name: gc.name,
                                    type: gc.type as any,
                                    amount: Number(gc.amount || 0),
                                })),
                                sharingStatus: resolvedSharing,
                                visibility: resolvedVis,
                                shareToken: result.shareToken || null,
                                lastSyncedAt: result.updated_at,
                                syncError: null,
                                createdAt: result.created_at || localBill?.createdAt || new Date().toISOString(),
                                updatedAt: result.updated_at,
                            };
                            await localDb.saveBill(serverSnapshot).catch(() => {});
                        }
                    } else if (hasPendingSync || localTime > serverTime) {
                        // Local has newer unsynced edits: trigger background push to sync up to cloud!
                        get().saveToDb().catch(() => {});
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
                const storageMode = useAppSettingsStore.getState().storageMode;
                const isAutoSyncMode = storageMode === 'cloud' || storageMode === 'hybrid';
                const historyMap = new Map<string, BillHistoryItem>();

                // 1. Load local bills first
                const pendingDeleteIds = new Set<string>();
                const pendingUpdateIds = new Set<string>();
                const pendingRevokeIds = new Set<string>();
                let localBills: LocalBillRecord[] = [];
                try {
                    const localDb = getLocalDb();
                    const pendingOps = await localDb.getPendingOps();
                    for (const op of pendingOps) {
                        if (op.type === 'delete') {
                            pendingDeleteIds.add(op.billId);
                        } else if (op.type === 'upload' || op.type === 'update') {
                            pendingUpdateIds.add(op.billId);
                        } else if (op.type === 'revoke') {
                            pendingRevokeIds.add(op.billId);
                        }
                    }

                    localBills = await localDb.listBills();
                    for (const b of localBills) {
                        if (pendingDeleteIds.has(b.id)) continue;
                        const total = calculateBillTotals(b).totalAmount;
                        const isPendingRevoke = pendingRevokeIds.has(b.id) || b.sharingStatus === 'revocation_pending';
                        const resolvedSharing = isPendingRevoke
                            ? b.sharingStatus
                            : (isAutoSyncMode ? 'shared' : b.sharingStatus);
                        const resolvedVis = isPendingRevoke
                            ? 'local'
                            : (resolvedSharing === 'shared' && (!b.visibility || b.visibility === 'local') ? 'restricted' : b.visibility);

                        historyMap.set(b.id, {
                            id: b.id,
                            name: b.name,
                            location: b.location || undefined,
                            currency: b.currency || 'VND',
                            created_at: b.createdAt,
                            updated_at: b.updatedAt,
                            totalAmount: total,
                            group_id: b.groupId,
                            group_name: b.groupName,
                            role: 'owner',
                            is_owner: true,
                            sharingStatus: resolvedSharing,
                            visibility: resolvedVis,
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

                // 2. Fetch server bills and merge (bypassing stale HTTP cache)
                try {
                    const response = await fetch('/api/bills', { cache: 'no-store' });
                    if (response.ok) {
                        const serverData: BillHistoryItem[] = await response.json();
                        const serverIdSet = new Set(serverData.map(sb => sb.id));
                        for (const sb of serverData) {
                            if (pendingDeleteIds.has(sb.id)) continue;

                            const existing = historyMap.get(sb.id);
                            if (existing) {
                                const localTime = parseTimestampMs(existing.updated_at);
                                const serverTime = parseTimestampMs(sb.updated_at);
                                const hasPendingUpdate = pendingUpdateIds.has(sb.id) || syncCoordinator.isSyncing(sb.id);
                                const isPendingRevoke = pendingRevokeIds.has(sb.id) || existing.sharingStatus === 'revocation_pending';
                                const isLocalNewer = storageMode === 'cloud'
                                    ? hasPendingUpdate
                                    : (hasPendingUpdate || localTime > serverTime);

                                if (storageMode !== 'cloud' && !hasPendingUpdate && serverTime >= localTime) {
                                    const localDb = getLocalDb();
                                    const rawLocal = await localDb.getBill(sb.id).catch(() => null);
                                    if (rawLocal && parseTimestampMs(rawLocal.updatedAt) < serverTime) {
                                        rawLocal.name = sb.name || rawLocal.name;
                                        rawLocal.location = sb.location !== undefined ? sb.location : rawLocal.location;
                                        rawLocal.currency = sb.currency || rawLocal.currency;
                                        rawLocal.groupId = sb.group_id !== undefined ? sb.group_id : rawLocal.groupId;
                                        rawLocal.groupName = sb.group_name !== undefined ? sb.group_name : rawLocal.groupName;
                                        rawLocal.updatedAt = sb.updated_at;
                                        rawLocal.lastSyncedAt = sb.updated_at;
                                        await localDb.saveBill(rawLocal).catch(() => {});
                                    }
                                } else if (hasPendingUpdate) {
                                    syncManager.processPendingOperations().catch(() => {});
                                }

                                const mergedVisRaw = isLocalNewer
                                    ? (existing.visibility && existing.visibility !== 'local' ? existing.visibility : sb.visibility)
                                    : (sb.visibility && sb.visibility !== 'local' ? sb.visibility : existing.visibility);

                                historyMap.set(sb.id, {
                                    ...sb,
                                    name: isLocalNewer ? (existing.name || sb.name) : (sb.name || existing.name),
                                    location: isLocalNewer ? (existing.location || sb.location) : (sb.location || existing.location),
                                    currency: isLocalNewer ? (existing.currency || sb.currency || 'VND') : (sb.currency || existing.currency || 'VND'),
                                    totalAmount: isLocalNewer ? existing.totalAmount : (sb.totalAmount ?? existing.totalAmount),
                                    group_id: isLocalNewer ? existing.group_id : (sb.group_id ?? existing.group_id),
                                    group_name: isLocalNewer ? existing.group_name : (sb.group_name ?? existing.group_name),
                                    sharingStatus: isPendingRevoke ? existing.sharingStatus : 'shared',
                                    visibility: isPendingRevoke ? 'local' : (mergedVisRaw || 'restricted'),
                                    shareToken: isPendingRevoke
                                        ? null
                                        : (existing.shareToken || sb.shareToken || null),
                                });
                            } else {
                                // Deduplicate any local-only bill that matches this server bill's signature
                                const sbNameNorm = (sb.name || '').trim().toLowerCase();
                                const sbTime = new Date(sb.created_at || sb.updated_at || 0).getTime();
                                for (const [candId, cand] of historyMap.entries()) {
                                    if (!serverIdSet.has(candId)) {
                                        const candNameNorm = (cand.name || '').trim().toLowerCase();
                                        const candTime = new Date(cand.created_at || cand.updated_at || 0).getTime();
                                        if (
                                            candNameNorm === sbNameNorm &&
                                            (cand.group_id || null) === (sb.group_id || null) &&
                                            (cand.currency || 'VND') === (sb.currency || 'VND') &&
                                            cand.totalAmount === sb.totalAmount &&
                                            Math.abs(candTime - sbTime) < 60000
                                        ) {
                                            historyMap.delete(candId);
                                        }
                                    }
                                }

                                historyMap.set(sb.id, {
                                    ...sb,
                                    currency: sb.currency || 'VND',
                                    sharingStatus: 'shared',
                                    visibility: sb.visibility && sb.visibility !== 'local' ? sb.visibility : 'restricted',
                                    shareToken: sb.shareToken || null,
                                });
                            }
                        }

                        // Reconcile cloud deletions: Prune any locally-cached bill that was deleted on the server
                        if (isAutoSyncMode && serverData.length > 0) {
                            const localDb = getLocalDb();
                            for (const lb of localBills) {
                                if (
                                    !serverIdSet.has(lb.id) &&
                                    !pendingDeleteIds.has(lb.id) &&
                                    !pendingUpdateIds.has(lb.id) &&
                                    lb.sharingStatus === 'shared'
                                ) {
                                    historyMap.delete(lb.id);
                                    localDb.deleteBill(lb.id).catch(() => {});
                                }
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
