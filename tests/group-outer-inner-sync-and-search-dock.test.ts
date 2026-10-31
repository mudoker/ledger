import { describe, expect, it } from 'bun:test';
import {
  aggregateGroupSummaries,
  mergeBillsForGroup,
  calculateBillTotals,
} from '@/lib/common-data-model';
import type { BillGroupSummary } from '@/../db/types';
import type { LocalBillRecord, LocalGroupRecord } from '@/lib/local-db/types';

describe('Group Outer-Inner Total Parity & Fixed Search Bar Dock', () => {
  it('guarantees 100% exact total and bill count parity between outer view and inner group detail', () => {
    // Scenario matching user's real database / device state:
    // Server has 3 bills in "Da Lat Mong Mo" with server-side totals:
    // - bill_banh_can: 280,000 VND
    // - bill_lamgfarm: 0 VND on server (items stored locally only)
    // - bill_mongo: 700,000 VND
    // Total on server: 980,000 VND, 3 bills.
    const serverGroups: BillGroupSummary[] = [
      {
        id: 'group_dalat_real',
        name: 'Da Lat Mong Mo',
        description: null,
        owner_id: 'user_quoc',
        is_owner: true,
        currency: 'VND',
        total_amount: 980000,
        total_bills: 3,
        total_items: 2,
        bill_ids: ['bill_banh_can', 'bill_lamgfarm', 'bill_mongo'],
        bill_amounts: {
          bill_banh_can: 280000,
          bill_lamgfarm: 0,
          bill_mongo: 700000,
        },
        bill_item_counts: {
          bill_banh_can: 1,
          bill_lamgfarm: 0,
          bill_mongo: 1,
        },
        created_at: '2026-10-26T00:00:00Z',
        updated_at: '2026-10-31T10:00:00Z',
        participants: [],
      },
    ];

    // On local device:
    // User has Lamgfarm Center populated with items (1,290,000 VND)
    // plus 6 additional local bills (Ga Nuong: 590k, Cafe Linh: 400k, Cafe Linh 2: 316k, Thi Tran: 480k, Banh Mi: 360k, Buffet: 900k)
    // Total for all 9 bills:
    // 280k + 1290k + 700k + 590k + 400k + 316k + 480k + 360k + 900k = 5,316,000 VND (or 5,186,000 VND depending on exact test items)
    const localBills: LocalBillRecord[] = [
      {
        id: 'bill_lamgfarm',
        name: 'Lamgfarm Center',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_dalat_real',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [{ id: 'p1', name: 'Quoc Doan', paidAmount: 1290000, sponsorAmount: 0 }],
        items: [{ id: 'i_lamg', name: 'Lamgfarm Items', price: 1290000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-31T00:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
      {
        id: 'bill_ga_nuong',
        name: 'Ga Nuong',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_dalat_real',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [{ id: 'p1', name: 'Quoc Doan', paidAmount: 590000, sponsorAmount: 0 }],
        items: [{ id: 'i_ga', name: 'Ga Nuong', price: 590000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-31T01:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
      {
        id: 'bill_cafe_linh_1',
        name: 'Cafe Linh',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_dalat_real',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [{ id: 'p1', name: 'Quoc Doan', paidAmount: 400000, sponsorAmount: 0 }],
        items: [{ id: 'i_cf1', name: 'Cafe', price: 400000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-31T02:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
      {
        id: 'bill_cafe_linh_2',
        name: 'Cafe Linh 2',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_dalat_real',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [{ id: 'p1', name: 'Quoc Doan', paidAmount: 316000, sponsorAmount: 0 }],
        items: [{ id: 'i_cf2', name: 'Cafe 2', price: 316000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-31T03:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
      {
        id: 'bill_buffet',
        name: 'Buffet Rau',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_dalat_real',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [{ id: 'p1', name: 'Quoc Doan', paidAmount: 900000, sponsorAmount: 0 }],
        items: [{ id: 'i_buf', name: 'Buffet', price: 900000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-31T04:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
      {
        id: 'bill_thi_tran',
        name: 'Thi Tran',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_dalat_real',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [{ id: 'p1', name: 'Quoc Doan', paidAmount: 480000, sponsorAmount: 0 }],
        items: [{ id: 'i_tt', name: 'Thi Tran Items', price: 480000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-31T05:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
      {
        id: 'bill_banh_mi',
        name: 'Banh Mi',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_dalat_real',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [{ id: 'p1', name: 'Quoc Doan', paidAmount: 360000, sponsorAmount: 0 }],
        items: [{ id: 'i_bm', name: 'Banh Mi', price: 360000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-31T06:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
      {
        id: 'bill_binh_minh',
        name: 'Binh Minh',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p1',
        qrCode: null,
        groupId: 'group_dalat_real',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        people: [{ id: 'p1', name: 'Quoc Doan', paidAmount: 150000, sponsorAmount: 0 }],
        items: [{ id: 'i_bminh', name: 'Drinks', price: 150000, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-31T07:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
    ];

    const localGroups: LocalGroupRecord[] = [];

    // 1. Calculate Inner Detail page merge
    const serverBills = [
      {
        id: 'bill_banh_can',
        name: 'Banh Can',
        location: null,
        currency: 'VND',
        totalAmount: 280000,
        host_id: null,
        host_name: null,
        created_at: '2026-10-26T00:00:00Z',
        updated_at: '2026-10-26T00:00:00Z',
        items: [{ id: 'i_bc', name: 'Banh Can', price: 280000, quantity: 1, assignments: {} }],
        people: [],
        globalCharges: [],
      },
      {
        id: 'bill_lamgfarm',
        name: 'Lamgfarm Center',
        location: null,
        currency: 'VND',
        totalAmount: 0, // Server has 0
        host_id: null,
        host_name: null,
        created_at: '2026-10-26T00:00:00Z',
        updated_at: '2026-10-26T00:00:00Z',
        items: [],
        people: [],
        globalCharges: [],
      },
      {
        id: 'bill_mongo',
        name: 'mongo land',
        location: null,
        currency: 'VND',
        totalAmount: 700000,
        host_id: null,
        host_name: null,
        created_at: '2026-10-26T00:00:00Z',
        updated_at: '2026-10-26T00:00:00Z',
        items: [{ id: 'i_mg', name: 'Tickets', price: 700000, quantity: 1, assignments: {} }],
        people: [],
        globalCharges: [],
      },
    ];

    const innerMergedBills = mergeBillsForGroup(serverBills as any, localBills, 'group_dalat_real');
    const innerTotalAmount = innerMergedBills.reduce((s, b) => s + b.totalAmount, 0);
    const innerTotalBills = innerMergedBills.length;

    // Total = 280k + 1290k + 700k + 590k + 400k + 316k + 900k + 480k + 360k + 150k = 5,466,000 VND, 10 bills
    expect(innerTotalBills).toBe(10);
    expect(innerTotalAmount).toBe(5466000);

    // 2. Calculate Outer View Group Summary
    const outerSummaries = aggregateGroupSummaries(serverGroups, localGroups, localBills);
    expect(outerSummaries.length).toBe(1);

    const outerGroup = outerSummaries[0];
    // Exact parity: total_bills and total_amount MUST MATCH EXACTLY
    expect(outerGroup.total_bills).toBe(innerTotalBills);
    expect(outerGroup.total_amount).toBe(innerTotalAmount);
  });

  it('guarantees fixed, stable bill ordering in group view even when bills are edited or updated', () => {
    // 3 bills created at sequential times:
    // Bill 1: Banh mi breakfast (created 9 hours ago)
    // Bill 2: Mongo Land afternoon (created 5 hours ago)
    // Bill 3: Ga Nuong dinner (created 1 hour ago)
    const t0 = new Date('2026-10-31T01:00:00Z').toISOString(); // 9h ago
    const t1 = new Date('2026-10-31T05:00:00Z').toISOString(); // 5h ago
    const t2 = new Date('2026-10-31T09:00:00Z').toISOString(); // 1h ago

    const localBills: LocalBillRecord[] = [
      {
        id: 'bill_1_banh_mi',
        name: "Banh mi xiu mai chen'",
        location: 'Da Lat',
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: 'grp_dalat',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        createdAt: t0,
        updatedAt: t0,
        items: [{ id: 'i1', name: 'Banh mi', price: 360000, quantity: 1, assignments: {} }],
        people: [],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
      },
      {
        id: 'bill_2_mongo',
        name: 'Mongo Land',
        location: 'Da Lat',
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: 'grp_dalat',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        createdAt: t1,
        updatedAt: t1,
        items: [{ id: 'i2', name: 'Ticket', price: 700000, quantity: 1, assignments: {} }],
        people: [],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
      },
      {
        id: 'bill_3_ga_nuong',
        name: 'Ga Nuong Com Lam',
        location: 'Da Lat',
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: 'grp_dalat',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_quoc',
        createdAt: t2,
        updatedAt: t2,
        items: [{ id: 'i3', name: 'Chicken', price: 590000, quantity: 1, assignments: {} }],
        people: [],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
      },
    ];

    // Initial order should be newest created first: Ga Nuong -> Mongo Land -> Banh mi
    const initialMerged = mergeBillsForGroup([], localBills, 'grp_dalat');
    expect(initialMerged.map(b => b.id)).toEqual([
      'bill_3_ga_nuong',
      'bill_2_mongo',
      'bill_1_banh_mi',
    ]);

    // Now user edits "Banh mi xiu mai chen'" at 10:00:00Z (after Ga Nuong)
    // In previous buggy version (ordering by updated_at DESC), Banh mi jumped to the top (#1).
    // In fixed version (ordering by created_at DESC), Banh mi remains at its fixed place (#3)!
    const tEdited = new Date('2026-10-31T10:00:00Z').toISOString();
    localBills[0].updatedAt = tEdited;

    const afterEditMerged = mergeBillsForGroup([], localBills, 'grp_dalat');
    expect(afterEditMerged.map(b => b.id)).toEqual([
      'bill_3_ga_nuong',
      'bill_2_mongo',
      'bill_1_banh_mi',
    ]);

    // Even if Mongo Land is also touched or edited later, the list order is completely fixed and stable
    localBills[1].updatedAt = new Date('2026-10-31T11:00:00Z').toISOString();
    const afterSecondEditMerged = mergeBillsForGroup([], localBills, 'grp_dalat');
    expect(afterSecondEditMerged.map(b => b.id)).toEqual([
      'bill_3_ga_nuong',
      'bill_2_mongo',
      'bill_1_banh_mi',
    ]);
  });
});
