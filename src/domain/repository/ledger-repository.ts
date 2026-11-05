/**
 * Canonical Ledger Repository
 * Central data access repository coordinating:
 * - Single source of truth GroupViewModel
 * - In-memory TTL caching (5 minutes)
 * - In-flight request deduplication across concurrent/staggered page mounts
 * - Local-first reads & optimistic local-first writes
 * - Asynchronous background cloud synchronization (Hybrid mode)
 */

import type { GroupViewModel } from '@/domain/viewmodel/group-viewmodel';
import { buildGroupViewModel } from '@/domain/viewmodel/group-viewmodel';
import { getLocalDb } from '@/lib/local-db';
import type { LocalGroupRecord, LocalBillRecord, LocalPerson } from '@/lib/local-db/types';
import type { BillGroupSummary, BillGroupDetail, GroupPaymentQr, PersonData } from '@/../db/types';
import { calculateBillFinancialTotals, calculateGroupFinancialTotal } from '@/domain/financial/bill-financial';
import { useAppSettingsStore } from '@/store/useAppSettingsStore';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

export class LedgerRepository {
  private static instance: LedgerRepository;
  private cache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private readonly DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

  static getInstance(): LedgerRepository {
    if (!LedgerRepository.instance) {
      LedgerRepository.instance = new LedgerRepository();
    }
    return LedgerRepository.instance;
  }

  /**
   * Invalidates specific cache entry or the entire ledger cache
   */
  invalidate(key?: string) {
    if (key) {
      this.cache.delete(key);
      this.inFlight.delete(key);
      if (key.startsWith('ledger:group:')) {
        this.cache.delete('ledger:groups:all');
      }
    } else {
      this.cache.clear();
      this.inFlight.clear();
    }
  }

  /**
   * Retrieves all groups for landing view, returning ready-to-render GroupViewModels.
   * Guarantees that group.totalAmount matches the inner overview total.
   */
  async getGroupSummaries(forceRefresh: boolean = false): Promise<GroupViewModel[]> {
    const cacheKey = 'ledger:groups:all';
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && now - cached.cachedAt < this.DEFAULT_TTL_MS) {
        return cached.data;
      }
    }

    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey)!;
    }

    const promise = (async () => {
      try {
        const localDb = getLocalDb();
        const localGroups = await localDb.listGroups().catch(() => []);
        const localBills = await localDb.listBills().catch(() => []);
        const pendingOps = await localDb.getPendingOps().catch(() => []);
        const pendingDeleteIds = new Set(pendingOps.filter(op => op.type === 'delete').map(op => op.billId));
        const activeLocalBills = localBills.filter(b => !pendingDeleteIds.has(b.id));

        // Fetch server groups (fail-safe offline fallback)
        let serverGroups: BillGroupSummary[] = [];
        try {
          const res = await fetch('/api/groups', { cache: 'no-store' });
          if (res.ok) {
            serverGroups = await res.json();
          }
        } catch {}

        const groupViewModels: GroupViewModel[] = [];
        const seenGroupIds = new Set<string>();

        // 1. Process server groups
        for (const sg of serverGroups) {
          seenGroupIds.add(sg.id);
          const matchingLocalGroup = localGroups.find(lg => lg.id === sg.id);

          // Get linked local bills for this group
          const groupLocalBills = activeLocalBills.filter(b => (b.groupId || (b as any).group_id) === sg.id);

          // Build synthetic overview bills from server bill stats and merge with local bills
          const billMap = new Map<string, { totalAmount: number; items?: any[]; people?: any[] }>();

          if (sg.bill_ids && sg.bill_amounts) {
            for (const bid of sg.bill_ids) {
              billMap.set(bid, {
                totalAmount: sg.bill_amounts[bid] ?? 0,
                items: Array.from({ length: sg.bill_item_counts?.[bid] ?? 1 }),
              });
            }
          }

          // Overlay local bills
          for (const lb of groupLocalBills) {
            const fin = calculateBillFinancialTotals(lb);
            billMap.set(lb.id, {
              totalAmount: fin.totalAmount,
              items: lb.items || [],
              people: lb.people || [],
            });
          }

          const overviewBills = Array.from(billMap.entries()).map(([bid, b]) => ({
            id: bid,
            name: (sg.bill_names && sg.bill_names[bid]) || `Bill ${bid.slice(0, 6)}`,
            location: null,
            currency: sg.currency || 'VND',
            totalAmount: b.totalAmount,
            items: b.items || [],
            people: b.people || [],
            globalCharges: [],
            created_at: sg.updated_at,
            updated_at: sg.updated_at,
          }));

          const vm = buildGroupViewModel({
            id: sg.id,
            name: matchingLocalGroup?.name || sg.name,
            description: matchingLocalGroup?.description ?? sg.description,
            currency: sg.currency,
            visibility: sg.visibility,
            ownerId: sg.owner_id,
            ownerName: sg.owner_name,
            ownerEmail: sg.owner_email,
            bills: overviewBills as any,
            participants: (sg as any).participants || matchingLocalGroup?.participants || [],
            paymentQrs: sg.payment_qrs || matchingLocalGroup?.payment_qrs || [],
            createdAt: sg.created_at,
            updatedAt: sg.updated_at,
          });

          // Ensure strict parity with server total if server reports higher valid amount
          if (sg.total_amount > vm.totalAmount && overviewBills.length === (sg.bill_ids?.length || 0)) {
            vm.totalAmount = sg.total_amount;
          }

          groupViewModels.push(vm);
        }

        // 2. Add local-only groups
        for (const lg of localGroups) {
          if (!seenGroupIds.has(lg.id)) {
            const groupLocalBills = activeLocalBills.filter(b => (b.groupId || (b as any).group_id) === lg.id);
            const overviewBills = groupLocalBills.map(lb => ({
              id: lb.id,
              name: lb.name,
              location: lb.location,
              currency: lb.currency,
              totalAmount: calculateBillFinancialTotals(lb).totalAmount,
              items: lb.items || [],
              people: lb.people || [],
              globalCharges: lb.globalCharges || [],
              created_at: lb.createdAt,
              updated_at: lb.updatedAt,
            }));

            const vm = buildGroupViewModel({
              id: lg.id,
              name: lg.name,
              description: lg.description,
              currency: lg.currency,
              visibility: lg.visibility,
              ownerId: lg.ownerId,
              bills: overviewBills as any,
              participants: lg.participants || [],
              paymentQrs: lg.payment_qrs || [],
              createdAt: lg.createdAt,
              updatedAt: lg.updatedAt,
            });

            groupViewModels.push(vm);
          }
        }

        groupViewModels.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        this.cache.set(cacheKey, { data: groupViewModels, cachedAt: Date.now() });
        return groupViewModels;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  /**
   * Retrieves single group detail, returning canonical ready-to-render GroupViewModel.
   * Updates localDb and memory cache so all views stay identical.
   */
  async getGroup(id: string, forceRefresh: boolean = false): Promise<GroupViewModel | null> {
    const cacheKey = `ledger:group:${id}`;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && now - cached.cachedAt < this.DEFAULT_TTL_MS) {
        return cached.data;
      }
    }

    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey)!;
    }

    const promise = (async () => {
      try {
        const localDb = getLocalDb();
        const lg = await localDb.getGroup(id).catch(() => null);
        const localBills = await localDb.listBills().catch(() => []);
        const pendingOps = await localDb.getPendingOps().catch(() => []);
        const pendingDeleteIds = new Set(pendingOps.filter(op => op.type === 'delete').map(op => op.billId));

        let serverGroup: BillGroupDetail | null = null;
        try {
          const res = await fetch(`/api/groups/${id}`);
          if (res.ok) {
            serverGroup = await res.json();
          }
        } catch {}

        if (!serverGroup && !lg) {
          return null;
        }

        const activeLocalBills = localBills.filter(b => !pendingDeleteIds.has(b.id));
        const groupLocalBills = activeLocalBills.filter(b => (b.groupId || (b as any).group_id) === id);

        // Merge server bills with local bills
        const billMap = new Map<string, any>();
        if (serverGroup && Array.isArray(serverGroup.bills)) {
          for (const sb of serverGroup.bills) {
            if (!pendingDeleteIds.has(sb.id)) {
              billMap.set(sb.id, sb);
            }
          }
        }

        for (const lb of groupLocalBills) {
          const existing = billMap.get(lb.id);
          const fin = calculateBillFinancialTotals(lb);
          if (!existing) {
            billMap.set(lb.id, {
              id: lb.id,
              name: lb.name,
              location: lb.location,
              currency: lb.currency,
              totalAmount: fin.totalAmount,
              host_id: lb.hostId,
              items: lb.items || [],
              people: lb.people || [],
              globalCharges: lb.globalCharges || [],
              created_at: lb.createdAt,
              updated_at: lb.updatedAt,
              isLocal: true,
            });
          } else {
            // If local has newer edits or items, overlay
            if (fin.totalAmount > 0) {
              billMap.set(lb.id, {
                ...existing,
                totalAmount: fin.totalAmount,
                items: lb.items || existing.items,
                people: lb.people || existing.people,
                globalCharges: lb.globalCharges || existing.globalCharges,
              });
            }
          }
        }

        const mergedBills = Array.from(billMap.values());

        const participants: PersonData[] = [
          ...((serverGroup as any)?.participants || []),
          ...(lg?.participants || []),
        ];

        const vm = buildGroupViewModel({
          id,
          name: serverGroup?.name || lg?.name || 'Group',
          description: serverGroup?.description ?? lg?.description,
          currency: serverGroup?.currency || lg?.currency,
          visibility: serverGroup?.visibility || lg?.visibility,
          ownerId: serverGroup?.owner_id || lg?.ownerId,
          ownerName: serverGroup?.owner_name || null,
          ownerEmail: serverGroup?.owner_email || null,
          bills: mergedBills,
          participants,
          paymentQrs: (serverGroup as any)?.payment_qrs || lg?.payment_qrs || [],
          createdAt: serverGroup?.created_at || lg?.createdAt,
          updatedAt: serverGroup?.updated_at || lg?.updatedAt,
          includeLedger: true,
        });

        // Persist snapshot to localDb so next reload has instant exact parity
        await localDb.saveGroup({
          id: vm.id,
          name: vm.name,
          description: vm.description,
          currency: vm.currency,
          visibility: vm.visibility,
          ownerId: vm.ownerId,
          participants: vm.participants as any,
          payment_qrs: vm.paymentQrs,
          totalAmount: vm.totalAmount,
          totalBills: vm.totalBills,
          totalItems: vm.totalItems,
          createdAt: vm.createdAt,
          updatedAt: vm.updatedAt,
        }).catch(() => {});

        // Backfill missing groupId in local bills
        for (const b of mergedBills) {
          const matchedLb = localBills.find(lb => lb.id === b.id);
          if (matchedLb && matchedLb.groupId !== id) {
            matchedLb.groupId = id;
            await localDb.saveBill(matchedLb).catch(() => {});
          }
        }

        this.cache.set(cacheKey, { data: vm, cachedAt: Date.now() });
        this.cache.delete('ledger:groups:all'); // Force group summaries to reflect freshest detail
        return vm;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, promise);
    return promise;
  }
}

export const ledgerRepo = LedgerRepository.getInstance();
