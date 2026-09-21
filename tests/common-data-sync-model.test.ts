import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  calculateBillTotals,
  normalizeLocalBillToOverview,
  mergeBillsForGroup,
  aggregateGroupSummaries,
  ensureGroupParticipantsSuperset,
} from '@/lib/common-data-model';
import { formatConciseRelativeTime } from '@/lib/format';
import { calculateGroupSettlement } from '@/lib/group-settlement';
import { useGroupStore } from '@/store/useGroupStore';
import { useBillStore } from '@/store/useBillStore';
import { getLocalDb } from '@/lib/local-db';
import type { LocalBillRecord, LocalGroupRecord } from '@/lib/local-db/types';
import type { GroupBillOverview, BillGroupSummary, BillGroupDetail } from '@/../db/types';

describe('Common Data Model & Cross-Page Data Sync Invariants', () => {
  beforeEach(() => {
    useGroupStore.setState({
      groups: [],
      currentGroup: null,
      isLoading: false,
      error: null,
    });
    useBillStore.setState({
      people: [],
      items: [],
      globalCharges: [],
      groupId: null,
      currentBillId: null,
      billHistory: [],
    });
  });

  describe('calculateBillTotals canonical computation', () => {
    it('computes subtotal and extras with 100% precision for unit items and multi-quantity items', () => {
      const bill = {
        items: [
          { name: 'Coffee', price: 35000, quantity: 2 }, // 70,000
          { name: 'Sandwich', price: 50000, quantity: 1 }, // 50,000
          { name: 'Water', price: 10000, quantity: 3 }, // 30,000
        ],
        globalCharges: [
          { type: 'percent', amount: 10 }, // 10% of 150,000 = 15,000
          { type: 'fixed', amount: 5000 }, // 5,000
        ],
      };

      const result = calculateBillTotals(bill);
      expect(result.subtotal).toBe(150000);
      expect(result.percentExtras).toBe(15000);
      expect(result.fixedExtras).toBe(5000);
      expect(result.totalExtras).toBe(20000);
      expect(result.totalAmount).toBe(170000);
      expect(result.itemCount).toBe(3);
    });

    it('respects pre-calculated totalPrice when present on items', () => {
      const bill = {
        items: [
          { name: 'Steak Platter', price: 200000, quantity: 2, totalPrice: 380000 }, // discount applied in totalPrice
        ],
        globalCharges: [],
      };

      const result = calculateBillTotals(bill);
      expect(result.subtotal).toBe(380000);
      expect(result.totalAmount).toBe(380000);
    });
  });

  describe('normalizeLocalBillToOverview data retention', () => {
    it('preserves people, assignments, globalCharges, and host_id when converting local bills', () => {
      const localBill: LocalBillRecord = {
        id: 'bill_local_1',
        name: 'Buffet Rau',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p_host',
        qrCode: null,
        groupId: 'grp_dalat',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [
          { id: 'p_host', name: 'Quoc Doan', paidAmount: 900000, sponsorAmount: 0 },
          { id: 'p_guest1', name: 'Qui', paidAmount: 0, sponsorAmount: 0 },
        ],
        items: [
          {
            id: 'i1',
            name: 'Buffet Rau Special',
            price: 900000,
            quantity: 1,
            assignments: { p_host: 1, p_guest1: 1 },
          },
        ],
        globalCharges: [{ id: 'c1', name: 'VAT', type: 'percent', amount: 10 }],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-30T10:00:00Z',
        updatedAt: '2026-10-30T10:00:00Z',
      };

      const overview = normalizeLocalBillToOverview(localBill);

      expect(overview.id).toBe('bill_local_1');
      expect(overview.name).toBe('Buffet Rau');
      expect(overview.isLocal).toBe(true);
      expect(overview.host_id).toBe('p_host');
      expect(overview.host_name).toBe('Quoc Doan');
      expect(overview.people?.length).toBe(2);
      expect(overview.globalCharges?.length).toBe(1);
      expect(overview.totalAmount).toBe(990000); // 900,000 + 10% VAT
      expect(overview.items[0]?.assignments?.['p_guest1']).toBe(1);
    });
  });

  describe('aggregateGroupSummaries outer-inner synchronization', () => {
    it('solves outer lacking data: merges server group with local-only bills', () => {
      // Server only knows 2 bills: mongo land (700k) + banh can (280k) = 980k
      const serverGroups: BillGroupSummary[] = [
        {
          id: 'grp_dalat',
          name: 'Da Lat Mong Mo',
          description: null,
          owner_id: 'user_quoc',
          is_owner: true,
          currency: 'VND',
          total_amount: 980000,
          total_bills: 2,
          total_items: 2,
          bill_ids: ['bill_mongo_700', 'bill_banh_can_280'],
          created_at: '2026-10-26T00:00:00Z',
          updated_at: '2026-10-30T00:00:00Z',
          participants: [],
        },
      ];

      // Local has Buffet Rau (900k) which is only on this device
      const localBills: LocalBillRecord[] = [
        {
          id: 'bill_buffet_rau_900',
          name: 'Buffet Rau',
          location: 'Da Lat',
          currency: 'VND',
          hostId: 'p_host',
          qrCode: null,
          groupId: 'grp_dalat',
          groupName: 'Da Lat Mong Mo',
          ownerId: 'user_quoc',
          people: [{ id: 'p_host', name: 'Quoc Doan', paidAmount: 900000, sponsorAmount: 0 }],
          items: [{ id: 'i1', name: 'Buffet', price: 900000, quantity: 1, assignments: {} }],
          globalCharges: [],
          sharingStatus: 'local',
          visibility: 'local',
          shareToken: null,
          lastSyncedAt: null,
          syncError: null,
          createdAt: '2026-10-30T10:00:00Z',
          updatedAt: '2026-10-30T10:00:00Z',
        },
      ];

      const localGroups: LocalGroupRecord[] = [];

      const summaries = aggregateGroupSummaries(serverGroups, localGroups, localBills);

      expect(summaries.length).toBe(1);
      // Total bills is 3 (2 server + 1 local)
      expect(summaries[0].total_bills).toBe(3);
      // Total amount is 1,880,000 VND (980k server + 900k local) - EXACT MATCH WITH INNER PAGE!
      expect(summaries[0].total_amount).toBe(1880000);
      expect(summaries[0].total_items).toBe(3);
    });
  });

  describe('Group Settlement and Total Expenses Integrity', () => {
    it('guarantees that calculateGroupSettlement.totalExpenses matches group.total_amount exactly', () => {
      const bills: GroupBillOverview[] = [
        {
          id: 'b1',
          name: 'mongo land',
          location: null,
          currency: 'VND',
          totalAmount: 700000,
          host_id: 'p_quoc_1',
          host_name: 'Quoc Doan',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          people: [{ id: 'p_quoc_1', name: 'Quoc Doan', paidAmount: 700000, sponsorAmount: 0 }],
          items: [{ id: 'i1', name: 'Ticket', price: 700000, quantity: 1, totalPrice: 700000, assignments: { p_quoc_1: 1 } }],
          globalCharges: [],
        },
        {
          id: 'b2',
          name: 'Banh Can Co Hoa',
          location: null,
          currency: 'VND',
          totalAmount: 280000,
          host_id: 'p_quoc_2',
          host_name: 'Quoc Doan',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          people: [
            { id: 'p_quoc_2', name: 'Quoc Doan', paidAmount: 280000, sponsorAmount: 0 },
            { id: 'p_qui_2', name: 'Qui', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p_lam_2', name: 'Lam', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p_luong_2', name: 'Luong', paidAmount: 0, sponsorAmount: 0 },
          ],
          items: [{
            id: 'i2',
            name: 'Banh Can Set',
            price: 280000,
            quantity: 1,
            totalPrice: 280000,
            assignments: { p_quoc_2: 1, p_qui_2: 1, p_lam_2: 1, p_luong_2: 1 },
          }],
          globalCharges: [],
        },
        {
          id: 'b3',
          name: 'Buffet Rau',
          location: null,
          currency: 'VND',
          totalAmount: 900000,
          host_id: 'p_quoc_3',
          host_name: 'Quoc Doan',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          people: [
            { id: 'p_quoc_3', name: 'Quoc Doan', paidAmount: 900000, sponsorAmount: 0 },
            { id: 'p_qui_3', name: 'Qui', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p_lam_3', name: 'Lam', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p_luong_3', name: 'Luong', paidAmount: 0, sponsorAmount: 0 },
          ],
          items: [{
            id: 'i3',
            name: 'Vegetable Buffet',
            price: 900000,
            quantity: 1,
            totalPrice: 900000,
            assignments: { p_quoc_3: 1, p_qui_3: 1, p_lam_3: 1, p_luong_3: 1 },
          }],
          globalCharges: [],
        },
        {
          id: 'b4',
          name: 'Cocktails',
          location: null,
          currency: 'VND',
          totalAmount: 300000, // 2 cocktails at 150k each = 300k
          host_id: 'p_quoc_4',
          host_name: 'Quoc Doan',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          people: [
            { id: 'p_quoc_4', name: 'Quoc Doan', paidAmount: 300000, sponsorAmount: 0 },
            { id: 'p_qui_4', name: 'Qui', paidAmount: 0, sponsorAmount: 0 },
          ],
          items: [{
            id: 'i4',
            name: 'Cocktail',
            price: 150000,
            quantity: 2,
            totalPrice: 300000,
            assignments: { p_quoc_4: 1, p_qui_4: 1 },
          }],
          globalCharges: [],
        },
      ];

      const expectedTotal = 700000 + 280000 + 900000 + 300000; // 2,180,000 VND
      const group: BillGroupDetail = {
        id: 'grp_dalat',
        name: 'Da Lat Mong Mo',
        description: null,
        owner_id: 'user_quoc',
        owner_name: 'Quoc Doan',
        owner_email: 'quoc@example.com',
        is_owner: true,
        currency: 'VND',
        total_amount: expectedTotal,
        total_bills: 4,
        total_items: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        bills,
      };

      const settlement = calculateGroupSettlement(group);

      // Total expenses in summary STRICTLY EQUALS group top card total
      expect(settlement.totalExpenses).toBe(expectedTotal);
      expect(settlement.totalExpenses).toBe(group.total_amount);
      expect(settlement.isBalanced).toBe(true);
      expect(settlement.uniqueParticipantsCount).toBe(4);

      // Debt transfers exist across the bills
      expect(settlement.transfers.length).toBeGreaterThan(0);
      const debtors = settlement.transfers.map(t => t.fromName);
      expect(debtors.includes('Qui')).toBe(true);
      expect(debtors.includes('Lam')).toBe(true);
      expect(debtors.includes('Luong')).toBe(true);
    });
  });

  describe('Real-time sync between useBillStore and useGroupStore', () => {
    it('syncGroupWithBills updates currentGroup and group summaries when a bill is saved', async () => {
      // Set up group in store
      useGroupStore.setState({
        groups: [
          {
            id: 'grp_sync',
            name: 'Sync Trip',
            description: null,
            owner_id: 'user_test',
            is_owner: true,
            currency: 'VND',
            total_amount: 100000,
            total_bills: 1,
            total_items: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            participants: [],
          },
        ],
      });

      // Save local group and local bill in localDb
      const localDb = getLocalDb();
      await localDb.saveGroup({
        id: 'grp_sync',
        name: 'Sync Trip',
        description: null,
        currency: 'VND',
        ownerId: 'user_test',
        participants: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await localDb.saveBill({
        id: 'b_new_local',
        name: 'Snack Bar',
        location: null,
        currency: 'VND',
        hostId: 'p_me',
        qrCode: null,
        groupId: 'grp_sync',
        groupName: 'Sync Trip',
        ownerId: 'user_test',
        people: [{ id: 'p_me', name: 'Me', paidAmount: 50000, sponsorAmount: 0 }],
        items: [{ id: 'i1', name: 'Snack', price: 50000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Mock fetch for groups
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/api/groups')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      await useGroupStore.getState().syncGroupWithBills('grp_sync');

      const updatedGroups = useGroupStore.getState().groups;
      const syncGroup = updatedGroups.find(g => g.id === 'grp_sync');
      expect(syncGroup).toBeDefined();
      expect(syncGroup?.total_bills).toBe(1);
      expect(syncGroup?.total_amount).toBe(50000);

      // Clean up localDb
      await localDb.deleteBill('b_new_local');
      await localDb.deleteGroup('grp_sync');
    });
  });

  describe('formatConciseRelativeTime formatting & single line card invariance', () => {
    it('uses "recent" for events under 60 seconds ago avoiding layout wrap', () => {
      const now = new Date();
      expect(formatConciseRelativeTime(now)).toBe('recent');
      expect(formatConciseRelativeTime(new Date(now.getTime() - 10000))).toBe('recent');
      expect(formatConciseRelativeTime(new Date(now.getTime() - 50000))).toBe('recent');
      expect(formatConciseRelativeTime(null)).toBe('recent');
    });

    it('formats minutes, hours, and days concisely', () => {
      const now = new Date();
      expect(formatConciseRelativeTime(new Date(now.getTime() - 2 * 60 * 1000))).toBe('2m ago');
      expect(formatConciseRelativeTime(new Date(now.getTime() - 5 * 3600 * 1000))).toBe('5h ago');
      expect(formatConciseRelativeTime(new Date(now.getTime() - 3 * 86400 * 1000))).toBe('3d ago');
    });

    it('handles boundary timestamps and clock skew safely', () => {
      const now = new Date();
      // 59 seconds ago -> recent
      expect(formatConciseRelativeTime(new Date(now.getTime() - 59 * 1000))).toBe('recent');
      // 60 seconds ago -> 1m ago
      expect(formatConciseRelativeTime(new Date(now.getTime() - 60 * 1000))).toBe('1m ago');
      // 23 hours ago -> 23h ago
      expect(formatConciseRelativeTime(new Date(now.getTime() - 23 * 3600 * 1000))).toBe('23h ago');
      // 24 hours ago -> 1d ago
      expect(formatConciseRelativeTime(new Date(now.getTime() - 24 * 3600 * 1000))).toBe('1d ago');
      // 14 days ago -> 2w ago
      expect(formatConciseRelativeTime(new Date(now.getTime() - 14 * 86400 * 1000))).toBe('2w ago');
      // Future timestamp (clock skew) -> recent
      expect(formatConciseRelativeTime(new Date(now.getTime() + 10000))).toBe('recent');
      // Invalid date string -> recent
      expect(formatConciseRelativeTime('invalid-date')).toBe('recent');
    });
  });

  describe('Group Participants Superset Invariant (Bill.participants ⊆ Group.participants)', () => {
    it('automatically unions all bill participants into group participants', () => {
      const groupParticipants = [
        { id: 'gp1', name: 'Qui', sponsorAmount: 0, paidAmount: 0 },
        { id: 'gp2', name: 'Lam', sponsorAmount: 0, paidAmount: 0 },
      ];

      const bills = [
        {
          people: [
            { id: 'bp1', name: 'Qui' },
            { id: 'bp2', name: 'Luong' }, // New participant on bill 1
          ],
        },
        {
          people: [
            { id: 'bp3', name: 'Quoc Doan', email: 'quoc@example.com' }, // New participant on bill 2
          ],
        },
      ];

      const superset = ensureGroupParticipantsSuperset(groupParticipants, bills as any);

      // Must have Qui, Lam, Luong, Quoc Doan
      expect(superset.length).toBe(4);
      expect(superset.some(p => p.name === 'Qui')).toBe(true);
      expect(superset.some(p => p.name === 'Lam')).toBe(true);
      expect(superset.some(p => p.name === 'Luong')).toBe(true);
      expect(superset.some(p => p.name === 'Quoc Doan')).toBe(true);
    });

    it('prevents duplicates when names match case-insensitively or by email', () => {
      const groupParticipants = [
        { id: 'gp1', name: 'Quoc Doan', email: 'quoc@test.com' },
      ];

      const bills = [
        {
          people: [
            { id: 'bp1', name: 'quoc doan' },
            { id: 'bp2', name: 'Other Name', email: 'QUOC@TEST.COM' },
          ],
        },
      ];

      const superset = ensureGroupParticipantsSuperset(groupParticipants, bills as any);
      expect(superset.length).toBe(1);
    });

    it('syncs dynamically added bill participants to group via addPerson and addPeople', async () => {
      useGroupStore.setState({
        groups: [
          {
            id: 'grp_dynamic',
            name: 'Weekend Trip',
            description: null,
            owner_id: 'user_1',
            is_owner: true,
            currency: 'VND',
            total_amount: 0,
            total_bills: 0,
            total_items: 0,
            participants: [{ id: 'p_host', name: 'Quoc Doan' }],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      useBillStore.setState({
        groupId: 'grp_dynamic',
        people: [{ id: 'p_host', name: 'Quoc Doan', sponsorAmount: 0, paidAmount: 0 }],
      });

      // Add a single person to the bill
      useBillStore.getState().addPerson('Qui', 'qui@test.com');
      expect(useBillStore.getState().people.some(p => p.name === 'Qui')).toBe(true);

      // Add multiple people in batch
      useBillStore.getState().addPeople([
        { name: 'Lam' },
        { name: 'Luong' },
      ]);

      const billPeople = useBillStore.getState().people;
      expect(billPeople.length).toBe(4); // Quoc Doan, Qui, Lam, Luong

      // Group store must have been called to maintain the superset
      const grp = useGroupStore.getState().groups.find(g => g.id === 'grp_dynamic');
      expect(grp?.participants?.some(p => p.name === 'Qui')).toBe(true);
      expect(grp?.participants?.some(p => p.name === 'Lam')).toBe(true);
      expect(grp?.participants?.some(p => p.name === 'Luong')).toBe(true);
    });
  });

  describe('Selective Participant Inheritance on Bill Join', () => {
    it('allows inheriting only a selected subset of group participants', async () => {
      useGroupStore.setState({
        groups: [
          {
            id: 'grp_dalat_full',
            name: 'Da Lat Mong Mo',
            description: null,
            owner_id: 'user_quoc',
            is_owner: true,
            currency: 'VND',
            total_amount: 100000,
            total_bills: 1,
            total_items: 1,
            participants: [
              { id: 'gp_quoc', name: 'Quoc Doan' },
              { id: 'gp_qui', name: 'Qui' },
              { id: 'gp_lam', name: 'Lam' },
              { id: 'gp_luong', name: 'Luong' },
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      useBillStore.setState({
        currentBillId: 'bill_test_select',
        people: [{ id: 'p_me', name: 'Quoc Doan', sponsorAmount: 0, paidAmount: 0 }],
      });

      // User selects only Qui and Lam (not Luong)
      await useBillStore.getState().setGroupId('grp_dalat_full', [
        { name: 'Qui' },
        { name: 'Lam' },
      ]);

      const people = useBillStore.getState().people;
      expect(people.some(p => p.name === 'Quoc Doan')).toBe(true);
      expect(people.some(p => p.name === 'Qui')).toBe(true);
      expect(people.some(p => p.name === 'Lam')).toBe(true);
      expect(people.some(p => p.name === 'Luong')).toBe(false); // Luong skipped!
    });

    it('respects "Skip" by keeping only the existing bill people when linking', async () => {
      useGroupStore.setState({
        groups: [
          {
            id: 'grp_skip_test',
            name: 'Solo Trip',
            description: null,
            owner_id: 'user_1',
            is_owner: true,
            currency: 'VND',
            total_amount: 0,
            total_bills: 0,
            total_items: 0,
            participants: [
              { id: 'gp_alice', name: 'Alice' },
              { id: 'gp_bob', name: 'Bob' },
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      useBillStore.setState({
        currentBillId: 'bill_skip_test',
        people: [{ id: 'p_host', name: 'Quoc Doan', sponsorAmount: 0, paidAmount: 0 }],
      });

      // Skip passed as empty array []
      await useBillStore.getState().setGroupId('grp_skip_test', []);

      const people = useBillStore.getState().people;
      expect(people.length).toBe(1);
      expect(people[0].name).toBe('Quoc Doan');
    });
  });

  describe('5-Bill Complete Group Settlement Invariance (Matching Real Screenshot Scenario)', () => {
    it('correctly simplifies debts across 5 bills with multiple payers and preserves zero-sum balance', () => {
      // 4 Participants across the trip
      const pQuoc = { id: 'p_quoc', name: 'Quoc Doan', userId: 'u_quoc' };
      const pQui = { id: 'p_qui', name: 'Qui', userId: 'u_qui' };
      const pLam = { id: 'p_lam', name: 'Lam', userId: 'u_lam' };
      const pLuong = { id: 'p_luong', name: 'Luong', userId: 'u_luong' };
      const allFour = [pQuoc, pQui, pLam, pLuong];

      // Bill 1: Banh Can Co Hoa (280,000 VND) - Paid by Quoc Doan
      const bill1: GroupBillOverview = {
        id: 'bill_1_banh_can',
        name: 'Banh Can Co Hoa',
        location: 'Da Lat',
        currency: 'VND',
        totalAmount: 280000,
        host_id: pQuoc.id,
        host_name: pQuoc.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        people: allFour,
        items: [
          { id: 'i1', name: 'Banh Can', price: 280000, quantity: 1, totalPrice: 280000, assignments: {} },
        ],
        globalCharges: [],
      };

      // Bill 2: mongo land (700,000 VND) - Paid by Quoc Doan
      const bill2: GroupBillOverview = {
        id: 'bill_2_mongo',
        name: 'mongo land',
        location: 'Da Lat',
        currency: 'VND',
        totalAmount: 700000,
        host_id: pQuoc.id,
        host_name: pQuoc.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        people: allFour,
        items: [
          { id: 'i2', name: 'Tickets', price: 700000, quantity: 1, totalPrice: 700000, assignments: {} },
        ],
        globalCharges: [],
      };

      // Bill 3: dau nanh (130,000 VND) - Paid by Quoc Doan
      const bill3: GroupBillOverview = {
        id: 'bill_3_dau_nanh',
        name: 'dau nanh',
        location: 'Da Lat',
        currency: 'VND',
        totalAmount: 130000,
        host_id: pQuoc.id,
        host_name: pQuoc.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        people: allFour,
        items: [
          { id: 'i3', name: 'Soya Milk', price: 130000, quantity: 1, totalPrice: 130000, assignments: {} },
        ],
        globalCharges: [],
      };

      // Bill 4: Binh Minh Oi (300,000 VND) - Paid by Lam
      const bill4: GroupBillOverview = {
        id: 'bill_4_binh_minh',
        name: 'Binh Minh Oi',
        location: 'Da Lat',
        currency: 'VND',
        totalAmount: 300000,
        host_id: pLam.id,
        host_name: pLam.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        people: allFour,
        items: [
          { id: 'i4', name: 'Breakfast', price: 300000, quantity: 1, totalPrice: 300000, assignments: {} },
        ],
        globalCharges: [],
      };

      // Bill 5: Buffet Rau (900,000 VND) - Paid by Qui
      const bill5: GroupBillOverview = {
        id: 'bill_5_buffet_rau',
        name: 'Buffet Rau',
        location: 'Da Lat',
        currency: 'VND',
        totalAmount: 900000,
        host_id: pQui.id,
        host_name: pQui.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        people: allFour,
        items: [
          { id: 'i5', name: 'Buffet', price: 900000, quantity: 1, totalPrice: 900000, assignments: {} },
        ],
        globalCharges: [],
      };

      const totalExpected = 280000 + 700000 + 130000 + 300000 + 900000; // 2,310,000 VND
      const group: BillGroupDetail = {
        id: 'grp_dalat_5bills',
        name: 'Da Lat Mong Mo',
        description: null,
        owner_id: 'u_quoc',
        is_owner: true,
        currency: 'VND',
        total_amount: totalExpected,
        total_bills: 5,
        total_items: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        bills: [bill1, bill2, bill3, bill4, bill5],
        participants: allFour,
      };

      const settlement = calculateGroupSettlement(group);

      // 1. Total expenses exact match
      expect(settlement.totalExpenses).toBe(2310000);
      expect(settlement.totalBills).toBe(5);
      expect(settlement.uniqueParticipantsCount).toBe(4);
      expect(settlement.isBalanced).toBe(true);

      // 2. Each person's equal share of 2,310,000 VND = 577,500 VND
      // Sum of net balances must be zero
      const sumNets = settlement.participants.reduce((sum, p) => sum + p.netBalance, 0);
      expect(Math.abs(sumNets)).toBeLessThanOrEqual(1);

      // 3. Quoc paid 280k + 700k + 130k = 1,110,000 VND (Creditor)
      const quoc = settlement.participants.find(p => p.name === 'Quoc Doan')!;
      expect(quoc.totalPaid).toBe(1110000);
      expect(quoc.netBalance).toBeGreaterThan(0);
      expect(quoc.status).toBe('receive');

      // 4. Qui paid 900,000 VND (Creditor)
      const qui = settlement.participants.find(p => p.name === 'Qui')!;
      expect(qui.totalPaid).toBe(900000);
      expect(qui.netBalance).toBeGreaterThan(0);
      expect(qui.status).toBe('receive');

      // 5. Luong paid 0 VND (Debtor)
      const luong = settlement.participants.find(p => p.name === 'Luong')!;
      expect(luong.totalPaid).toBe(0);
      expect(luong.netBalance).toBeLessThan(0);
      expect(luong.status).toBe('pay');

      // 6. Net transfers must not be empty and must eliminate Luong's debt
      expect(settlement.transfers.length).toBeGreaterThan(0);
      const luongTransfers = settlement.transfers.filter(t => t.fromName === 'Luong');
      expect(luongTransfers.length).toBeGreaterThan(0);
      const totalLuongPaid = luongTransfers.reduce((sum, t) => sum + t.amount, 0);
      expect(Math.abs(totalLuongPaid - Math.abs(luong.netBalance))).toBeLessThanOrEqual(2);
    });
  });
});
