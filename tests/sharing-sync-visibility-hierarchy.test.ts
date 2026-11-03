import { describe, it, expect, beforeEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { setLocalDb } from '../src/lib/local-db';
import { MemoryStorageEngine } from '../src/lib/local-db/storage-engine';
import {
  aggregateGroupSummaries,
  mergeBillsForGroup,
  parseTimestampMs,
} from '../src/lib/common-data-model';
import { formatConciseRelativeTime } from '../src/lib/format';
import { useBillStore } from '../src/store/useBillStore';
import { useGroupStore } from '../src/store/useGroupStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { useAppSettingsStore } from '../src/store/useAppSettingsStore';
import type { BillPayload, BillGroupSummary, GroupBillOverview } from '../db/types';
import type { LocalBillRecord, LocalGroupRecord } from '../src/lib/local-db/types';

describe('Sharing Functions, Syncing Behaviour, Cross-Page Parity & Visibility Hierarchy', () => {
  let db: SqliteAdapter;
  let localEngine: MemoryStorageEngine;

  beforeEach(async () => {
    (globalThis as any).window = {
      location: { href: 'http://localhost/' },
      history: { replaceState: () => {} },
    };
    db = new SqliteAdapter(':memory:');
    await db.init();
    localEngine = new MemoryStorageEngine();
    await localEngine.init();
    setLocalDb(localEngine);

    useAuthStore.setState({
      user: { id: 'user_owner', email: 'owner@example.com', name: 'Owner Alice', avatar_url: null },
      isLoading: false,
    });
    useAppSettingsStore.setState({
      storageMode: 'local',
      defaultCurrency: 'VND',
    });
    useBillStore.getState().resetBill();
    useGroupStore.setState({
      groups: [],
      currentGroup: null,
      isLoading: false,
      error: null,
    });
  });

  describe('1. Visibility Hierarchy (local < restricted < public) Across Bills & Groups', () => {
    it('keeps local bills strictly local (visibility: local, isLocal: true) even inside a public group and hides them from non-owners', async () => {
      await db.upsertUser({ id: 'owner_1', email: 'owner1@test.com', name: 'Owner One', avatar_url: null });
      await db.upsertUser({ id: 'guest_1', email: 'guest1@test.com', name: 'Guest One', avatar_url: null });

      const group = await db.createGroup(
        'Public Trip',
        'owner_1',
        'Trip to Hue',
        'VND',
        'public'
      );
      const groupId = group.id;
      await db.updateGroup(
        groupId,
        {
          participants: [
            { id: 'p_guest', name: 'Guest One', email: 'guest1@test.com', userId: 'guest_1', sponsorAmount: 0, paidAmount: 0 },
          ],
        },
        'owner_1'
      );
      expect(group.visibility).toBe('public');

      // Save one shared bill (100,000) and one local unshared bill (50,000) in the public group
      const sharedBillData: BillPayload = {
        name: 'Shared Dinner',
        groupId,
        currency: 'VND',
        isShared: true,
        visibility: 'public',
        people: [{ id: 'p1_shared', name: 'Owner One', userId: 'owner_1', email: 'owner1@test.com', sponsorAmount: 0, paidAmount: 100000 }],
        items: [{ id: 'i1', name: 'Hotpot', price: 100000, quantity: 1, assignments: { p1_shared: 1 } }],
        globalCharges: [],
      };
      const localBillData: BillPayload = {
        name: 'Private Coffee',
        groupId,
        currency: 'VND',
        isShared: false,
        visibility: 'local',
        people: [{ id: 'p1_local', name: 'Owner One', userId: 'owner_1', email: 'owner1@test.com', sponsorAmount: 0, paidAmount: 50000 }],
        items: [{ id: 'i2', name: 'Espresso', price: 50000, quantity: 1, assignments: { p1_local: 1 } }],
        globalCharges: [],
      };

      await db.saveBill('bill_shared_1', sharedBillData, 'owner_1');
      await db.saveBill('bill_local_1', localBillData, 'owner_1');

      // 1) Owner fetching local bill gets visibility: 'local' (NOT overridden to 'public' by group)
      const ownerViewLocalBill = await db.getBill('bill_local_1', 'owner_1');
      expect(ownerViewLocalBill).not.toBeNull();
      expect(ownerViewLocalBill?.visibility).toBe('local');
      expect(ownerViewLocalBill?.isShared).toBe(false);

      // 2) Non-owner cannot read local bill even though group is public
      const guestViewLocalBill = await db.getBill('bill_local_1', 'guest_1');
      expect(guestViewLocalBill).toBeNull();

      // 3) Owner fetching group sees both bills, with isLocal: true on the local bill
      const ownerGroup = await db.getGroup(groupId, 'owner_1');
      expect(ownerGroup?.total_bills).toBe(2);
      expect(ownerGroup?.total_amount).toBe(150000);
      const localInOwnerGroup = ownerGroup?.bills.find((b) => b.id === 'bill_local_1') as any;
      expect(localInOwnerGroup?.isLocal).toBe(true);

      // 4) Non-owner fetching group only sees the shared bill (100,000), never the local bill
      const guestGroup = await db.getGroup(groupId, 'guest_1');
      expect(guestGroup?.total_bills).toBe(1);
      expect(guestGroup?.total_amount).toBe(100000);
      expect(guestGroup?.bills.map((b) => b.id)).toEqual(['bill_shared_1']);

      // 5) Search for non-owner does not leak local bill or inflate group total_amount
      const guestSearch = await db.search('Public Trip', 'guest_1');
      expect(guestSearch.groups.length).toBe(1);
      expect(guestSearch.groups[0].total_bills).toBe(1);
      expect(guestSearch.groups[0].total_amount).toBe(100000);

      const guestCoffeeSearch = await db.search('Private Coffee', 'guest_1');
      expect(guestCoffeeSearch.bills.length).toBe(0);
      expect(guestCoffeeSearch.items.length).toBe(0);
    });

    it('enforces restricted group access control and cascades visibility changes between public and restricted', async () => {
      await db.upsertUser({ id: 'owner_2', email: 'owner2@test.com', name: 'Owner Two', avatar_url: null });
      await db.upsertUser({ id: 'member_2', email: 'member2@test.com', name: 'Member Two', avatar_url: null });
      await db.upsertUser({ id: 'stranger_2', email: 'stranger2@test.com', name: 'Stranger Two', avatar_url: null });

      // Create restricted group with member_2 in group.participants (even before any bills exist)
      const createdGroup = await db.createGroup(
        'Roommates Restricted',
        'owner_2',
        'Restricted apartment ledger',
        'USD',
        'restricted'
      );
      const groupId = createdGroup.id;
      await db.updateGroup(
        groupId,
        {
          participants: [
            { id: 'p_mem', name: 'Member Two', email: 'MEMBER2@TEST.COM', sponsorAmount: 0, paidAmount: 0 },
          ],
        },
        'owner_2'
      );

      // 1) Stranger cannot access restricted group via getGroup, listGroups, or search
      const strangerGet = await db.getGroup(groupId, 'stranger_2');
      expect(strangerGet).toBeNull();
      const strangerList = await db.listGroups('stranger_2');
      expect(strangerList.length).toBe(0);

      // 2) Invited group participant (matched case-insensitively by email) CAN access via getGroup & listGroups
      const memberGet = await db.getGroup(groupId, 'member_2');
      expect(memberGet).not.toBeNull();
      expect(memberGet?.name).toBe('Roommates Restricted');

      const memberList = await db.listGroups('member_2');
      expect(memberList.length).toBe(1);
      expect(memberList[0].id).toBe(groupId);
      // Verify listGroups now properly parses and returns group.participants!
      expect(memberList[0].participants?.length).toBe(1);
      expect(memberList[0].participants?.[0].name).toBe('Member Two');

      // 3) Add a shared bill to the group, switch group to public, then back to restricted
      await db.saveBill(
        'bill_in_grp',
        {
          name: 'Internet Bill',
          groupId,
          currency: 'USD',
          isShared: true,
          visibility: 'restricted',
          people: [{ id: 'p1', name: 'Owner Two', userId: 'owner_2', sponsorAmount: 0, paidAmount: 60 }],
          items: [{ id: 'i1', name: 'Fiber', price: 60, quantity: 1, assignments: { p1: 1 } }],
          globalCharges: [],
        },
        'owner_2'
      );

      // Switch group to public -> linked shared bill becomes public & stranger can view group
      await db.updateGroup(groupId, { visibility: 'public' }, 'owner_2');
      const strangerGetPublic = await db.getGroup(groupId, 'stranger_2');
      expect(strangerGetPublic).not.toBeNull();
      expect(strangerGetPublic?.bills.length).toBe(1);

      // Switch group back to restricted -> linked shared bill without standalone token reverts to restricted & stranger is blocked
      await db.updateGroup(groupId, { visibility: 'restricted' }, 'owner_2');
      const strangerGetAfterRestrict = await db.getGroup(groupId, 'stranger_2');
      expect(strangerGetAfterRestrict).toBeNull();
      const strangerBillAfterRestrict = await db.getBill('bill_in_grp', 'stranger_2');
      expect(strangerBillAfterRestrict).toBeNull();
    });
  });

  describe('2. Sharing Lifecycle: Share Token Parity, Revocation & Re-Sharing', () => {
    it('clears revoked_at when a revoked bill is re-shared so it reappears in group, bill lists, and search', async () => {
      await db.upsertUser({ id: 'owner_3', email: 'owner3@test.com', name: 'Owner Three', avatar_url: null });
      await db.upsertUser({ id: 'part_3', email: 'part3@test.com', name: 'Participant Three', avatar_url: null });

      const group = await db.createGroup(
        'Reshare Group',
        'owner_3',
        null,
        'VND',
        'public'
      );
      const groupId = group.id;

      const billPayload: BillPayload = {
        name: 'BBQ Night',
        groupId,
        currency: 'VND',
        people: [
          { id: 'p_o', name: 'Owner Three', userId: 'owner_3', email: 'owner3@test.com', sponsorAmount: 0, paidAmount: 300000 },
          { id: 'p_p', name: 'Participant Three', userId: 'part_3', email: 'part3@test.com', sponsorAmount: 0, paidAmount: 0 },
        ],
        items: [{ id: 'i1', name: 'Ribs', price: 300000, quantity: 1, assignments: { p_o: 1, p_p: 1 } }],
        globalCharges: [],
      };

      // Step 1: Share bill
      await db.saveBill(
        'bill_reshare_1',
        {
          ...billPayload,
          isShared: true,
          visibility: 'public',
          shareToken: 'token_initial_123',
        },
        'owner_3'
      );
      expect((await db.listBills('part_3')).length).toBe(1);

      // Step 2: Revoke sharing
      await db.revokeBillShare('bill_reshare_1', 'owner_3');
      expect((await db.listBills('part_3')).length).toBe(0);
      expect((await db.getGroup(groupId, 'part_3'))?.total_bills).toBe(0);

      // Step 3: Re-share via saveBill with isShared: true
      await db.saveBill(
        'bill_reshare_1',
        {
          ...billPayload,
          isShared: true,
          visibility: 'public',
          shareToken: 'token_new_456',
        },
        'owner_3'
      );

      // Verify revoked_at was cleared and participant sees the bill again everywhere
      const partBills = await db.listBills('part_3');
      expect(partBills.length).toBe(1);
      expect(partBills[0].id).toBe('bill_reshare_1');
      expect(partBills[0].totalAmount).toBe(300000);

      const partGroup = await db.getGroup(groupId, 'part_3');
      expect(partGroup?.total_bills).toBe(1);
      expect(partGroup?.total_amount).toBe(300000);

      const tokenAccess = await db.getBill('bill_reshare_1', null, true, 'token_new_456');
      expect(tokenAccess).not.toBeNull();
      expect(tokenAccess?.shareToken).toBe('token_new_456');
    });

    it('synchronizes shareToken, billHistory, and group state across enableSharing, updateSharingVisibility, and disableSharing', async () => {
      const nowIso = new Date().toISOString();
      useBillStore.setState({
        currentBillId: 'bill_sync_token',
        billName: 'Token Parity Bill',
        currency: 'USD',
        people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 50 }],
        items: [{ id: 'i1', name: 'Steak', price: 50, quantity: 1, assignments: { p1: 1 } }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        billHistory: [
          {
            id: 'bill_sync_token',
            name: 'Token Parity Bill',
            created_at: nowIso,
            updated_at: nowIso,
            totalAmount: 50,
            currency: 'USD',
            sharingStatus: 'local',
            visibility: 'local',
            shareToken: null,
          },
        ],
      });

      const originalFetch = globalThis.fetch;
      let postedShareBody: any = null;
      try {
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/api/bills/bill_sync_token/share') && init?.method === 'POST') {
            postedShareBody = JSON.parse(String(init.body));
            return new Response(
              JSON.stringify({
                success: true,
                visibility: postedShareBody.visibility,
                shareToken: postedShareBody.shareToken || 'server_generated_token_999',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (url.includes('/api/bills/bill_sync_token?revoke=1') && init?.method === 'DELETE') {
            return new Response(JSON.stringify({ success: true, revoked: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }) as any;

        // 1) enableSharing('public') sends client shareToken + latest data and syncs state + billHistory + localDb
        await useBillStore.getState().enableSharing('public');
        const stateAfterEnable = useBillStore.getState();
        expect(stateAfterEnable.sharingStatus).toBe('shared');
        expect(stateAfterEnable.visibility).toBe('public');
        expect(stateAfterEnable.shareToken).toBeTruthy();
        expect(postedShareBody.shareToken).toBe(stateAfterEnable.shareToken);
        expect(postedShareBody.data?.name).toBe('Token Parity Bill');

        const historyItemAfterEnable = stateAfterEnable.billHistory.find((b) => b.id === 'bill_sync_token');
        expect(historyItemAfterEnable?.sharingStatus).toBe('shared');
        expect(historyItemAfterEnable?.visibility).toBe('public');
        expect(historyItemAfterEnable?.shareToken).toBe(stateAfterEnable.shareToken);

        const localAfterEnable = await localEngine.getBill('bill_sync_token');
        expect(localAfterEnable?.sharingStatus).toBe('shared');
        expect(localAfterEnable?.shareToken).toBe(stateAfterEnable.shareToken);

        // 2) updateSharingVisibility('restricted') updates visibility in store, billHistory & localDb
        await useBillStore.getState().updateSharingVisibility('restricted');
        const stateAfterRestrict = useBillStore.getState();
        expect(stateAfterRestrict.visibility).toBe('restricted');
        expect(stateAfterRestrict.billHistory.find((b) => b.id === 'bill_sync_token')?.visibility).toBe('restricted');
        expect((await localEngine.getBill('bill_sync_token'))?.visibility).toBe('restricted');

        // 3) updateSharingVisibility('public') receives token from server and updates store + localDb
        await useBillStore.getState().updateSharingVisibility('public');
        const stateAfterRePublic = useBillStore.getState();
        expect(stateAfterRePublic.visibility).toBe('public');
        expect(stateAfterRePublic.shareToken).toBe('server_generated_token_999');
        expect((await localEngine.getBill('bill_sync_token'))?.shareToken).toBe('server_generated_token_999');

        // 4) disableSharing() revokes cloud access and updates store, billHistory, and localDb to local
        await useBillStore.getState().disableSharing();
        const stateAfterDisable = useBillStore.getState();
        expect(stateAfterDisable.sharingStatus).toBe('local');
        expect(stateAfterDisable.visibility).toBe('local');
        expect(stateAfterDisable.shareToken).toBeNull();
        expect(stateAfterDisable.billHistory.find((b) => b.id === 'bill_sync_token')?.sharingStatus).toBe('local');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('3. Cross-Page Data Consistency & Syncing Behaviour', () => {
    it('accurately decreases outer group totals when a bill item is reduced, deleted, or unlinked locally (no stale cached total override)', () => {
      const serverGroup: BillGroupSummary = {
        id: 'grp_decrease',
        name: 'Weekend Getaway',
        description: null,
        currency: 'VND',
        visibility: 'public',
        owner_id: 'user_owner',
        created_at: '2026-10-01T10:00:00.000Z',
        updated_at: '2026-10-01T10:00:00.000Z',
        total_bills: 2,
        total_items: 2,
        total_amount: 500000,
        bill_ids: ['bill_1', 'bill_2'],
        bill_amounts: { bill_1: 300000, bill_2: 200000 },
        bill_item_counts: { bill_1: 1, bill_2: 1 },
        is_owner: true,
        participants: [],
      };

      // Stale cached local group record still has 500,000 from before the user reduced bill 1 and unlinked bill 2
      const staleLocalGroup: LocalGroupRecord = {
        id: 'grp_decrease',
        name: 'Weekend Getaway',
        description: null,
        currency: 'VND',
        visibility: 'public',
        ownerId: 'user_owner',
        participants: [],
        totalBills: 2,
        totalAmount: 500000,
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      };

      // Bill 1 was edited locally to 200,000 (down from 300,000) at 10:05
      const editedBill1: LocalBillRecord = {
        id: 'bill_1',
        name: 'Hotel',
        location: null,
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: 'grp_decrease',
        groupName: 'Weekend Getaway',
        ownerId: 'user_owner',
        people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 200000 }],
        items: [{ id: 'i1', name: 'Room', price: 200000, quantity: 1, assignments: { p1: 1 } }],
        globalCharges: [],
        sharingStatus: 'shared',
        visibility: 'public',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T10:05:00.000Z',
      };

      // Bill 2 was unlinked locally (groupId: null) at 10:06
      const unlinkedBill2: LocalBillRecord = {
        id: 'bill_2',
        name: 'Taxi',
        location: null,
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: 'user_owner',
        people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 200000 }],
        items: [{ id: 'i2', name: 'Airport Ride', price: 200000, quantity: 1, assignments: { p1: 1 } }],
        globalCharges: [],
        sharingStatus: 'shared',
        visibility: 'public',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-01T09:30:00.000Z',
        updatedAt: '2026-10-01T10:06:00.000Z',
      };

      // Inner Group Overview merge (server still has both old bills at 10:00)
      const serverBills: GroupBillOverview[] = [
        {
          id: 'bill_1',
          name: 'Hotel',
          created_at: '2026-10-01T09:00:00.000Z',
          updated_at: '2026-10-01T10:00:00.000Z',
          location: null,
          currency: 'VND',
          totalAmount: 300000,
          items: [{ id: 'i1', name: 'Room', price: 300000, quantity: 1, totalPrice: 300000 }],
          people: [],
        },
        {
          id: 'bill_2',
          name: 'Taxi',
          created_at: '2026-10-01T09:30:00.000Z',
          updated_at: '2026-10-01T10:00:00.000Z',
          location: null,
          currency: 'VND',
          totalAmount: 200000,
          items: [{ id: 'i2', name: 'Airport Ride', price: 200000, quantity: 1, totalPrice: 200000 }],
          people: [],
        },
      ];

      const innerMergedBills = mergeBillsForGroup(
        serverBills,
        [editedBill1, unlinkedBill2],
        'grp_decrease',
        []
      );
      const innerTotalBills = innerMergedBills.length;
      const innerTotalAmount = innerMergedBills.reduce((s, b) => s + b.totalAmount, 0);
      expect(innerTotalBills).toBe(1);
      expect(innerTotalAmount).toBe(200000);

      // Outer Landing Page group summary aggregation
      const outerGroups = aggregateGroupSummaries(
        [serverGroup],
        [staleLocalGroup],
        [editedBill1, unlinkedBill2]
      );
      expect(outerGroups.length).toBe(1);
      expect(outerGroups[0].total_bills).toBe(1);
      expect(outerGroups[0].total_amount).toBe(200000);
      // 100% parity between outer Landing Page and inner Group Overview!
      expect(outerGroups[0].total_amount).toBe(innerTotalAmount);
      expect(outerGroups[0].total_bills).toBe(innerTotalBills);
    });

    it('preserves original bill createdAt across multiple local saves so group bill ordering never jumps', async () => {
      const initialCreated = '2026-09-15T08:00:00.000Z';
      await localEngine.saveBill({
        id: 'bill_stable_order',
        name: 'First Save',
        location: null,
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: 'grp_1',
        groupName: 'Trip',
        ownerId: 'user_owner',
        people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 40000 }],
        items: [{ id: 'i1', name: 'Breakfast', price: 40000, quantity: 1, assignments: { p1: 1 } }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: initialCreated,
        updatedAt: initialCreated,
      });

      useBillStore.setState({
        currentBillId: 'bill_stable_order',
        billName: 'Second Save Later',
        currency: 'VND',
        groupId: 'grp_1',
        groupName: 'Trip',
        people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 65000 }],
        items: [{ id: 'i1', name: 'Breakfast Deluxe', price: 65000, quantity: 1, assignments: { p1: 1 } }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
      });

      await useBillStore.getState().saveToDb();
      const saved = await localEngine.getBill('bill_stable_order');
      expect(saved?.createdAt).toBe(initialCreated);
      expect(saved?.name).toBe('Second Save Later');
    });

    it('normalizes SQLite UTC timestamps without Z suffix so relative time and timestamp comparisons are accurate', () => {
      const sqliteUtc = '2026-10-15 14:30:00';
      const isoUtc = '2026-10-15T14:30:00Z';
      expect(parseTimestampMs(sqliteUtc)).toBe(parseTimestampMs(isoUtc));

      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
      expect(formatConciseRelativeTime(nowIso)).toBe('recent');
    });

    it('preserves local bills in currentGroup when updateGroup is called on the server', async () => {
      // Save a local-only bill in grp_edit_1
      await localEngine.saveBill({
        id: 'local_bill_in_grp',
        name: 'Local Street Food',
        location: null,
        currency: 'USD',
        hostId: null,
        qrCode: null,
        groupId: 'grp_edit_1',
        groupName: 'Old Group Name',
        ownerId: 'user_owner',
        people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 25 }],
        items: [{ id: 'i1', name: 'Tacos', price: 25, quantity: 1, assignments: { p1: 1 } }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-20T10:00:00.000Z',
      });

      useGroupStore.setState({
        currentGroup: {
          id: 'grp_edit_1',
          name: 'Old Group Name',
          description: null,
          currency: 'USD',
          visibility: 'public',
          owner_id: 'user_owner',
          created_at: '2026-10-20T09:00:00.000Z',
          updated_at: '2026-10-20T09:00:00.000Z',
          total_bills: 1,
          total_items: 1,
          total_amount: 25,
          is_owner: true,
          participants: [],
          bills: [],
        },
        groups: [],
      });

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/api/groups/grp_edit_1') && init?.method === 'PUT') {
            return new Response(
              JSON.stringify({
                id: 'grp_edit_1',
                name: 'Updated Group Name',
                description: 'New desc',
                currency: 'EUR',
                visibility: 'restricted',
                owner_id: 'user_owner',
                created_at: '2026-10-20T09:00:00.000Z',
                updated_at: '2026-10-20T11:00:00.000Z',
                total_bills: 0,
                total_items: 0,
                total_amount: 0,
                is_owner: true,
                participants: [],
                bills: [],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response('Not found', { status: 404 });
        }) as any;

        await useGroupStore.getState().updateGroup('grp_edit_1', {
          name: 'Updated Group Name',
          currency: 'EUR',
          visibility: 'restricted',
        });

        const currentGroup = useGroupStore.getState().currentGroup;
        expect(currentGroup).not.toBeNull();
        expect(currentGroup?.name).toBe('Updated Group Name');
        expect(currentGroup?.currency).toBe('EUR');
        expect(currentGroup?.visibility).toBe('restricted');
        // Local bill is preserved in currentGroup after updateGroup!
        expect(currentGroup?.total_bills).toBe(1);
        expect(currentGroup?.total_amount).toBe(25);
        expect(currentGroup?.bills[0].id).toBe('local_bill_in_grp');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('4. Storage Mode Semantics (Local vs Cloud Only vs Hybrid), Deduplication & Cross-Device Integrity', () => {
    it('switching from local to cloud mode preserves existing localDb data, syncs local bills/groups to cloud, and clears Local badges', async () => {
      // 1. User creates a group and a bill while in Local Only mode
      useAppSettingsStore.setState({ storageMode: 'local' });
      await localEngine.saveGroup({
        id: 'grp_da_lat_1',
        name: 'Da Lat Mong Mo',
        description: 'Weekend trip',
        currency: 'VND',
        visibility: 'public',
        ownerId: 'user_phone',
        participants: [{ id: 'p_quoc', name: 'Quoc Doan', sponsorAmount: 0, paidAmount: 0 }],
        createdAt: '2026-10-30T08:00:00.000Z',
        updatedAt: '2026-10-30T08:00:00.000Z',
      });
      await localEngine.saveBill({
        id: 'bill_banh_can',
        name: 'Banh Can Le',
        location: 'Da Lat',
        currency: 'VND',
        hostId: 'p_quoc',
        qrCode: null,
        groupId: 'grp_da_lat_1',
        groupName: 'Da Lat Mong Mo',
        ownerId: 'user_phone',
        people: [{ id: 'p_quoc', name: 'Quoc Doan', sponsorAmount: 0, paidAmount: 280000 }],
        items: [{ id: 'i_bc', name: 'Banh Can', price: 280000, quantity: 1, assignments: { p_quoc: 1 } }],
        globalCharges: [],
        sharingStatus: 'local',
        visibility: 'local',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-10-30T09:00:00.000Z',
        updatedAt: '2026-10-30T09:00:00.000Z',
      });

      const uploadedGroups: any[] = [];
      const uploadedBills: any[] = [];
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/api/groups') && init?.method === 'POST') {
            const body = JSON.parse(String(init.body));
            uploadedGroups.push(body);
            return new Response(
              JSON.stringify({ id: body.id, name: body.name, owner_id: 'user_phone' }),
              { status: 201, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (url.endsWith('/api/bills') && init?.method === 'POST') {
            const body = JSON.parse(String(init.body));
            uploadedBills.push(body);
            return new Response(
              JSON.stringify({ id: body.id, success: true }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(JSON.stringify([]), { status: 200 });
        }) as any;

        // 2. Switch to Cloud Only mode
        useAppSettingsStore.getState().setStorageMode('cloud');
        await new Promise((r) => setTimeout(r, 50));

        // Existing localDb data was NOT wiped
        const preservedGroup = await localEngine.getGroup('grp_da_lat_1');
        const preservedBill = await localEngine.getBill('bill_banh_can');
        expect(preservedGroup).not.toBeNull();
        expect(preservedBill).not.toBeNull();

        // Synced to cloud with isShared: true and non-local visibility
        expect(uploadedGroups.length).toBe(1);
        expect(uploadedGroups[0].id).toBe('grp_da_lat_1');
        expect(uploadedBills.length).toBe(1);
        expect(uploadedBills[0].id).toBe('bill_banh_can');
        expect(uploadedBills[0].isShared).toBe(true);
        expect(uploadedBills[0].visibility).toBe('restricted');

        // Local bill record updated to 'shared' so Local badge is cleared
        expect(preservedBill?.sharingStatus).toBe('shared');
        expect(preservedBill?.visibility).toBe('restricted');

        // Merged group view in cloud mode shows isLocal: false (no Local badge mismatch!)
        const merged = mergeBillsForGroup(
          [
            {
              id: 'bill_banh_can',
              name: 'Banh Can Le',
              location: 'Da Lat',
              currency: 'VND',
              totalAmount: 280000,
              created_at: '2026-10-30T09:00:00.000Z',
              updated_at: '2026-10-30T09:00:00.000Z',
              items: [{ id: 'i_bc', name: 'Banh Can', price: 280000, quantity: 1, totalPrice: 280000 }],
              isLocal: true, // even if an older server record had is_shared = 0
            },
          ],
          [preservedBill!],
          'grp_da_lat_1'
        );
        expect(merged.length).toBe(1);
        expect(merged[0].isLocal).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('in Cloud Only mode does NOT continue updating localDb on new edits while Hybrid mode updates both localDb and cloud', async () => {
      // Seed an existing local bill before entering Cloud Only mode
      await localEngine.saveBill({
        id: 'bill_existing_local',
        name: 'Pre-Existing Local Bill',
        location: null,
        currency: 'VND',
        hostId: null,
        qrCode: null,
        groupId: null,
        groupName: null,
        ownerId: 'user_1',
        people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 50000 }],
        items: [{ id: 'i1', name: 'Coffee', price: 50000, quantity: 1, assignments: { p1: 1 } }],
        globalCharges: [],
        sharingStatus: 'shared',
        visibility: 'restricted',
        shareToken: null,
        lastSyncedAt: '2026-10-30T08:00:00.000Z',
        syncError: null,
        createdAt: '2026-10-30T08:00:00.000Z',
        updatedAt: '2026-10-30T08:00:00.000Z',
      });

      const postedPayloads: any[] = [];
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/api/bills') && init?.method === 'POST') {
            const body = JSON.parse(String(init.body));
            postedPayloads.push(body);
            return new Response(
              JSON.stringify({ id: body.id, success: true }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(JSON.stringify({}), { status: 200 });
        }) as any;

        // A) Cloud Only mode: new bill saves to cloud & in-memory state, does NOT write to localDb, and does NOT wipe existing localDb
        useAppSettingsStore.setState({ storageMode: 'cloud' });
        useBillStore.setState({
          currentBillId: 'bill_cloud_only_new',
          billName: 'Cloud Only Dinner',
          people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 120000 }],
          items: [{ id: 'i2', name: 'Steak', price: 120000, quantity: 1, assignments: { p1: 1 } }],
          globalCharges: [],
          sharingStatus: 'local',
          visibility: 'local',
        });

        await useBillStore.getState().saveToDb();
        await new Promise((r) => setTimeout(r, 40));

        // 1) Pre-existing local bill is untouched (not wiped)
        expect(await localEngine.getBill('bill_existing_local')).not.toBeNull();
        // 2) New bill in Cloud Only mode was NOT written to localDb
        expect(await localEngine.getBill('bill_cloud_only_new')).toBeNull();
        // 3) Cloud received the bill with isShared: true and visibility: 'restricted'
        expect(postedPayloads.length).toBe(1);
        expect(postedPayloads[0].id).toBe('bill_cloud_only_new');
        expect(postedPayloads[0].isShared).toBe(true);
        expect(postedPayloads[0].visibility).toBe('restricted');
        expect(useBillStore.getState().sharingStatus).toBe('shared');

        // B) Hybrid mode: updates BOTH localDb and cloud
        useAppSettingsStore.setState({ storageMode: 'hybrid' });
        useBillStore.setState({
          currentBillId: 'bill_hybrid_new',
          billName: 'Hybrid Sync Lunch',
          people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 90000 }],
          items: [{ id: 'i3', name: 'Pho Special', price: 90000, quantity: 1, assignments: { p1: 1 } }],
          globalCharges: [],
          sharingStatus: 'local',
          visibility: 'local',
        });

        await useBillStore.getState().saveToDb();
        await new Promise((r) => setTimeout(r, 40));

        const hybridLocal = await localEngine.getBill('bill_hybrid_new');
        expect(hybridLocal).not.toBeNull();
        expect(hybridLocal?.name).toBe('Hybrid Sync Lunch');
        expect(hybridLocal?.sharingStatus).toBe('shared');
        expect(postedPayloads.length).toBe(2);
        expect(postedPayloads[1].id).toBe('bill_hybrid_new');
        expect(postedPayloads[1].isShared).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('deduplicates groups and bills in hybrid/cloud modes and guarantees 100% cross-device consistency', async () => {
      // 1. Test group & bill deduplication when local group/bill had a temporary offline ID
      useAppSettingsStore.setState({ storageMode: 'hybrid' });
      const serverGroups = [
        {
          id: 'srv_grp_dalat',
          name: 'Đà Lạt Mộng Mơ',
          description: null,
          owner_id: 'user_quoc',
          is_owner: true,
          currency: 'VND',
          visibility: 'public' as const,
          total_amount: 980000,
          total_bills: 2,
          total_items: 2,
          created_at: '2026-10-30T08:00:00.000Z',
          updated_at: '2026-10-30T10:00:00.000Z',
          participants: [{ id: 'p1', name: 'Quoc Doan', sponsorAmount: 0, paidAmount: 0 }],
          bill_ids: ['bill_mongo', 'bill_banh_can'],
          bill_amounts: { bill_mongo: 700000, bill_banh_can: 280000 },
          bill_item_counts: { bill_mongo: 1, bill_banh_can: 1 },
        },
      ];

      // Local has a duplicate group with a different ID but identical name & currency
      const localGroups = [
        {
          id: 'local_temp_grp_id',
          name: 'Đà Lạt Mộng Mơ',
          description: null,
          currency: 'VND',
          visibility: 'public' as const,
          ownerId: 'local',
          participants: [{ id: 'p1', name: 'Quoc Doan', sponsorAmount: 0, paidAmount: 0 }],
          createdAt: '2026-10-30T08:00:00.000Z',
          updatedAt: '2026-10-30T09:00:00.000Z',
        },
      ];

      // Local also has a bill linked to the old local group ID
      const localBills = [
        {
          id: 'bill_lau_bo',
          name: 'Lẩu Bò Ba Toa',
          location: 'Da Lat',
          currency: 'VND',
          hostId: 'p1',
          qrCode: null,
          groupId: 'local_temp_grp_id',
          groupName: 'Đà Lạt Mộng Mơ',
          ownerId: 'user_quoc',
          people: [{ id: 'p1', name: 'Quoc Doan', sponsorAmount: 0, paidAmount: 500000 }],
          items: [{ id: 'i_lb', name: 'Lau Bo', price: 500000, quantity: 1, assignments: { p1: 1 } }],
          globalCharges: [],
          sharingStatus: 'shared' as const,
          visibility: 'restricted' as const,
          shareToken: null,
          lastSyncedAt: null,
          syncError: null,
          createdAt: '2026-10-30T09:30:00.000Z',
          updatedAt: '2026-10-30T09:30:00.000Z',
        },
      ];

      const summaries = aggregateGroupSummaries(serverGroups, localGroups, localBills);
      // Must NOT duplicate the group! Only 1 unified group exists, and the bill from local_temp_grp_id is folded in
      expect(summaries.length).toBe(1);
      expect(summaries[0].id).toBe('srv_grp_dalat');
      expect(summaries[0].total_bills).toBe(3);
      expect(summaries[0].total_amount).toBe(1480000); // 700k + 280k + 500k

      // 2. Test cross-device database consistency: bills saved from Device A (phone) appear on Device B (web)
      await db.upsertUser({ id: 'user_phone_owner', email: 'phone@ledger.test', name: 'Phone User', avatar_url: null });
      const createdGrp = await db.createGroup(
        'Cross-Device Trip',
        'user_phone_owner',
        'Synced across phone and web',
        'VND',
        'public',
        'grp_custom_uuid_123'
      );
      expect(createdGrp.id).toBe('grp_custom_uuid_123');

      // Even if an older phone client uploaded a bill with isShared: false (not revoked),
      // the owner opening Device B sees all their non-revoked bills in listBills and getGroup
      await db.saveBill(
        'bill_from_phone_1',
        {
          name: 'Phone Entered Expense',
          groupId: createdGrp.id,
          currency: 'VND',
          isShared: false,
          visibility: 'local',
          people: [{ id: 'p_owner', name: 'Phone User', userId: 'user_phone_owner', sponsorAmount: 0, paidAmount: 450000 }],
          items: [{ id: 'i_exp', name: 'Hotel Booking', price: 450000, quantity: 1, assignments: { p_owner: 1 } }],
        },
        'user_phone_owner'
      );

      const webDeviceBills = await db.listBills('user_phone_owner');
      const foundOnWeb = webDeviceBills.find((b) => b.id === 'bill_from_phone_1');
      expect(foundOnWeb).toBeDefined();
      expect(foundOnWeb?.totalAmount).toBe(450000);
      expect(foundOnWeb?.sharingStatus).toBe('shared');
    });
  });
});
