import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchExchangeRate, convertCurrency } from '@/lib/currency';
import { useGroupStore } from './useGroupStore';
import { useAppSettingsStore } from './useAppSettingsStore';
import { getLocalDb } from '@/lib/local-db';
import { syncManager } from '@/lib/local-db/sync-manager';
import type { BillSharingStatus, BillVisibility, LocalBillRecord } from '@/lib/local-db/types';

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
    setGroupId: (groupId: string | null) => void;
    transferBillOwnership: (newOwnerId: string) => Promise<boolean>;
    addPerson: (name: string, email?: string | null, userId?: string | null) => void;
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

            setGroupId: async (groupId: string | null) => {
                const groupStore = useGroupStore.getState();
                const matchedGroup = groupId ? groupStore.groups.find(g => g.id === groupId) : null;
                const oldGroupId = get().groupId;

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

                await get().saveToDb();

                await groupStore.fetchGroups();
                if (groupId) {
                    await groupStore.fetchGroup(groupId);
                }
                if (oldGroupId && oldGroupId !== groupId) {
                    await groupStore.fetchGroup(oldGroupId);
                }
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

            addPerson: (name, email = null, userId = null) =>
                set((state) => ({
                    people: [
                        ...state.people,
                        {
                            id: crypto.randomUUID(),
                            name,
                            sponsorAmount: 0,
                            paidAmount: 0,
                            userId: userId || null,
                            email: email || null,
                        },
                    ],
                })),

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
                    ownerId: null,
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

                // 1. Always persist to local IndexedDB first
                const billId = (await get().saveToLocal()) || state.currentBillId;
                if (!billId) return null;

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

                // 3. Upload to cloud
                set({ isSaving: true });
                try {
                    const response = await fetch('/api/bills', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: billId,
                            isShared: state.sharingStatus === 'shared',
                            visibility: state.visibility,
                            shareToken: state.shareToken,
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
                                visibility: state.visibility,
                                shareToken: state.shareToken,
                            }
                        })
                    });

                    const result = await response.json();
                    if (result.id) {
                        set({
                            currentBillId: result.id,
                            lastSaved: new Date().toISOString(),
                            syncError: null,
                        });
                        get().fetchHistory();
                        if (typeof window !== 'undefined') {
                            const url = new URL(window.location.href);
                            if (url.searchParams.get('id') !== result.id) {
                                url.searchParams.set('id', result.id);
                                if (state.groupId) {
                                    url.searchParams.set('groupId', state.groupId);
                                }
                                window.history.replaceState({}, '', url.toString());
                            }
                        }
                        return result.id;
                    }
                } catch (error: any) {
                    console.error("Failed to save to database:", error);
                    set({ syncError: error.message || 'Cloud sync failed' });
                } finally {
                    set({ isSaving: false });
                }
                return billId;
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
                // 1. Try local storage first if not in explicit share mode
                if (!isShare) {
                    try {
                        const localDb = getLocalDb();
                        const localBill = await localDb.getBill(id);
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
                            return;
                        }
                    } catch (e) {
                        console.warn('Local bill lookup failed, falling back to server:', e);
                    }
                }

                // 2. Fetch from server API
                try {
                    let url = isShare ? `/api/bills/${id}?share=1` : `/api/bills/${id}`;
                    if (token) {
                        url += `&token=${encodeURIComponent(token)}`;
                    }
                    const response = await fetch(url);
                    if (!response.ok) {
                        const err = await response.json().catch(() => ({}));
                        const errorMsg = err.error || "Bill not found or share link has been revoked";
                        const customError: any = new Error(errorMsg);
                        customError.status = response.status;
                        customError.isForbidden = response.status === 403 || errorMsg.toLowerCase().includes('forbidden') || errorMsg.toLowerCase().includes('restricted');
                        throw customError;
                    }

                    const result = await response.json();
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

                    // Save downloaded bill to local storage
                    await get().saveToLocal();
                } catch (error) {
                    console.error("Failed to fetch bill:", error);
                    throw error;
                }
            },

            fetchHistory: async () => {
                get().fetchDbStatus();
                const historyMap = new Map<string, BillHistoryItem>();

                // 1. Load local bills first
                try {
                    const localDb = getLocalDb();
                    const localBills = await localDb.listBills();
                    for (const b of localBills) {
                        const rawSubtotal = b.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                        let total = rawSubtotal;
                        for (const ch of b.globalCharges) {
                            if (ch.type === 'percent') {
                                total += (rawSubtotal * ch.amount) / 100;
                            } else {
                                total += ch.amount;
                            }
                        }

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
                } catch (e) {
                    console.warn('Failed to load local bills for history:', e);
                }

                // 2. Fetch server bills and merge
                try {
                    const response = await fetch('/api/bills');
                    if (response.ok) {
                        const serverData: BillHistoryItem[] = await response.json();
                        for (const sb of serverData) {
                            const existing = historyMap.get(sb.id);
                            historyMap.set(sb.id, {
                                ...sb,
                                sharingStatus: existing?.sharingStatus || 'shared',
                                visibility: existing?.visibility || sb.visibility || 'restricted',
                                shareToken: existing?.shareToken || sb.shareToken || null,
                            });
                        }
                    }
                } catch {
                    // Offline or server unavailable: local bills will still display!
                }

                const sorted = Array.from(historyMap.values()).sort(
                    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                );
                set({ billHistory: sorted });
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
