import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchExchangeRate, convertCurrency } from '@/lib/currency';

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

    // Database actions
    saveToDb: () => Promise<string | null>;
    fetchBill: (id: string, isShare?: boolean) => Promise<void>;
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

            setGroupId: (groupId: string | null) => {
                set({ groupId });
                get().saveToDb();
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
            setLocation: (location) => set({ location: location }),
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
                    // User Request: On switch to new host, clear their upfront paid amount.
                    // This ensures they fall back to the "Pay Remaining" logic.
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
            })),

            loadState: (data, readonly) => set((state) => ({
                ...state,
                ...data,
                isReadOnly: readonly
            })),

            setHydrated: (val: boolean) => set({ isHydrated: val }),

            saveToDb: async () => {
                if (typeof window === 'undefined') return null;
                const state = get();
                if (state.isReadOnly) return null;

                // Don't save empty state
                if (state.people.length === 0 && state.items.length === 0) return null;

                set({ isSaving: true });
                try {
                    const response = await fetch('/api/bills', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: state.currentBillId,
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
                            }
                        })
                    });

                    const result = await response.json();
                    if (result.id) {
                        set({
                            currentBillId: result.id,
                            lastSaved: new Date().toISOString(),
                        });
                        get().fetchHistory();
                        return result.id;
                    }
                } catch (error) {
                    console.error("Failed to save to database:", error);
                } finally {
                    set({ isSaving: false });
                }
                return null;
            },

            fetchBill: async (id: string, isShare: boolean = false) => {
                try {
                    const url = isShare ? `/api/bills/${id}?share=1` : `/api/bills/${id}`;
                    const response = await fetch(url);
                    if (!response.ok) {
                        const err = await response.json().catch(() => ({}));
                        throw new Error(err.error || "Bill not found");
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
                    });
                } catch (error) {
                    console.error("Failed to fetch bill:", error);
                    throw error;
                }
            },

            fetchHistory: async () => {
                get().fetchDbStatus();
                try {
                    const response = await fetch('/api/bills');
                    if (!response.ok) throw new Error("Failed to fetch history");
                    const data = await response.json();
                    set({ billHistory: data });
                } catch (error) {
                    console.error("Failed to fetch history:", error);
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
            }),
            onRehydrateStorage: () => (state) => {
                if (state) state.setHydrated(true);
            },
        }
    )
);
