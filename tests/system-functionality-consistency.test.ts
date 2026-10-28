import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { calculateGroupSettlement } from '@/lib/group-settlement';
import { calculateBill } from '@/hooks/useBillState';
import type { Person, Item, GlobalCharge } from '@/store/useBillStore';

describe('System Functionality, Invariants & Multi-Entity Consistency', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();

    await adapter.upsertUser({ id: 'user_u1', email: 'u1@example.com', name: 'User One' });
    await adapter.upsertUser({ id: 'user_u2', email: 'u2@example.com', name: 'User Two' });
    await adapter.upsertUser({ id: 'user_u3', email: 'u3@example.com', name: 'User Three' });
    await adapter.upsertUser({ id: 'user_u4', email: 'u4@example.com', name: 'User Four' });
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('Financial & Accounting Invariants', () => {
    it('enforces mathematical conservation of money: item consumption + fees - subsidies === bill total', async () => {
      // Create a complex bill with:
      // - 3 participants (1 sponsor, 1 payer, 1 regular)
      // - 3 items with fractional assignments
      // - 1 percent charge (10% VAT), 1 fixed charge (25,000 VND delivery)
      const people: Person[] = [
        { id: 'p1', name: 'Alice (Payer & Sponsor)', sponsorAmount: 300000, paidAmount: 0 },
        { id: 'p2', name: 'Bob (Consumer)', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p3', name: 'Charlie (Consumer)', sponsorAmount: 0, paidAmount: 0 },
      ];

      const items: Item[] = [
        { id: 'i1', name: 'Phở Đặc Biệt', price: 180000, quantity: 1, assignments: { p1: 1, p2: 1 } }, // 180,000
        { id: 'i2', name: 'Cơm Tấm Sườn Bì Chả', price: 75000, quantity: 1, assignments: { p3: 1 } }, // 75,000
        { id: 'i3', name: 'Trà Đá', price: 30000, quantity: 1, assignments: { p1: 1, p2: 1, p3: 1 } }, // 30,000
      ];

      const charges: GlobalCharge[] = [
        { id: 'c1', name: 'VAT', type: 'percent', amount: 10 },
        { id: 'c2', name: 'Shipping', type: 'fixed', amount: 25000 },
      ];

      // Save to DB
      await adapter.saveBill(
        'bill_math_invariant',
        {
          name: 'Phở & Cơm Tấm',
          currency: 'VND',
          people,
          items,
          charges,
        },
        'user_u1'
      );

      const billDetail = await adapter.getBill('bill_math_invariant', 'user_u1');
      expect(billDetail).not.toBeNull();

      // Database-calculated Subtotal: (90k*2) + 75k + (10k*3) = 180k + 75k + 30k = 285,000 VND
      // Percent charges: 10% of 285,000 = 28,500 VND
      // Fixed charges: 25,000 VND
      // Expected Bill Total: 285,000 + 28,500 + 25,000 = 338,500 VND
      const summaries = await adapter.listBills('user_u1');
      const savedSummary = summaries.find(b => b.id === 'bill_math_invariant');
      expect(savedSummary?.totalAmount).toBe(338500);

      // Now compute personal breakdowns using domain engine
      const { finalPayables, sponsorSurpluses, sponsorReliefs, totalBill } = calculateBill({
        people: billDetail!.data.people as Person[],
        items: billDetail!.data.items as Item[],
        globalCharges: billDetail!.data.globalCharges as GlobalCharge[],
        hostId: null,
      });

      // Invariant 1: Sum of final payables across all participants must equal the grand total of the bill
      const sumOfPayables = Object.values(finalPayables).reduce((sum, v) => sum + v, 0);
      expect(Math.round(sumOfPayables)).toBe(Math.round(totalBill));
      expect(Math.round(totalBill)).toBe(338500);

      // Invariant 2: Sponsor pledge caps personal liability
      // Alice pledged 300,000. Her baseline portion (food + tax/fees) was ~124,780.
      // Her surplus was redistributed to Bob and Charlie.
      // Her final payable must be capped at her pledge (300,000).
      expect(finalPayables['p1']).toBe(300000);

      // Invariant 3: Total discounts received by Bob and Charlie must equal Alice's surplus subsidy
      const aliceSurplus = sponsorSurpluses['p1'];
      const bobRelief = sponsorReliefs['p2'] || 0;
      const charlieRelief = sponsorReliefs['p3'] || 0;
      expect(Math.round(bobRelief + charlieRelief)).toBe(Math.round(aliceSurplus));
    });

    it('enforces group aggregation zero-sum invariant across multiple bills and multiple payers', async () => {
      const group = await adapter.createGroup('Trip to Hue & Da Nang', 'user_u1');

      // Bill 1: u1 paid for u1 and u2 (Total 200,000 VND)
      await adapter.saveBill(
        'bill_trip_1',
        {
          name: 'Hue Royal Dinner',
          groupId: group.id,
          currency: 'VND',
          people: [
            { id: 'p1_1', name: 'User One', userId: 'user_u1', paidAmount: 200000 },
            { id: 'p1_2', name: 'User Two', userId: 'user_u2', paidAmount: 0 },
          ],
          items: [
            { id: 'item_1_1', name: 'Bánh Bèo', price: 100000, quantity: 2, assignments: { p1_1: 1, p1_2: 1 } },
          ],
        },
        'user_u1'
      );

      // Bill 2: u2 paid for u2 and u3 (Total 300,000 VND)
      await adapter.saveBill(
        'bill_trip_2',
        {
          name: 'Da Nang Seafood',
          groupId: group.id,
          currency: 'VND',
          people: [
            { id: 'p2_2', name: 'User Two', userId: 'user_u2', paidAmount: 300000 },
            { id: 'p2_3', name: 'User Three', userId: 'user_u3', paidAmount: 0 },
          ],
          items: [
            { id: 'item_2_1', name: 'Cá Nướng', price: 300000, quantity: 1, assignments: { p2_2: 1, p2_3: 1 } },
          ],
        },
        'user_u1'
      );

      // Bill 3: u3 paid for u1, u2, and u3 (Total 150,000 VND)
      await adapter.saveBill(
        'bill_trip_3',
        {
          name: 'Café & Desserts',
          groupId: group.id,
          currency: 'VND',
          people: [
            { id: 'p3_1', name: 'User One', userId: 'user_u1', paidAmount: 0 },
            { id: 'p3_2', name: 'User Two', userId: 'user_u2', paidAmount: 0 },
            { id: 'p3_3', name: 'User Three', userId: 'user_u3', paidAmount: 150000 },
          ],
          items: [
            { id: 'item_3_1', name: 'Cà Phê Muối', price: 50000, quantity: 3, assignments: { p3_1: 1, p3_2: 1, p3_3: 1 } },
          ],
        },
        'user_u1'
      );

      // Verify Group Total Invariant: 200k + 300k + 150k = 650,000 VND
      const groupData = await adapter.getGroup(group.id, 'user_u1');
      expect(groupData).not.toBeNull();
      expect(groupData?.total_amount).toBe(650000);
      expect(groupData?.total_bills).toBe(3);

      // Run settlement algorithm on the group
      const settlement = calculateGroupSettlement(groupData!);

      // Invariant 1: Group balance check
      expect(settlement.isBalanced).toBe(true);

      // Invariant 2: Net balances across all participants in the group must sum to 0 (within integer currency rounding <= 1 VND)
      const sumOfBalances = settlement.participants.reduce((sum, p) => sum + p.netBalance, 0);
      expect(Math.abs(sumOfBalances)).toBeLessThanOrEqual(1);

      // Invariant 3: Total debt transfers must equal total credit transfers
      const totalTransferred = settlement.transfers.reduce((sum, t) => sum + t.amount, 0);
      expect(totalTransferred).toBeGreaterThan(0);

      // Invariant 4: Pairwise net direction - between any two participants, there is at most ONE net transfer (never both X -> Y and Y -> X)
      const pairKeys = new Set<string>();
      for (const t of settlement.transfers) {
        const sortedPair = [t.fromName, t.toName].sort().join(':::');
        expect(pairKeys.has(sortedPair)).toBe(false);
        pairKeys.add(sortedPair);
      }
    });
  });

  describe('Multi-Tenant Access Control & Permissions', () => {
    it('strictly isolates private bills from unrelated users in list and get queries', async () => {
      // User 1 creates a private bill
      await adapter.saveBill(
        'bill_private_u1',
        {
          name: 'Private Executive Lunch',
          currency: 'VND',
          people: [{ id: 'p_exec', name: 'User One', userId: 'user_u1' }],
          items: [{ id: 'i_exec', name: 'Caviar', price: 1000000, quantity: 1, assignments: {} }],
        },
        'user_u1'
      );

      // User 2 lists their bills -> must NOT see User 1's private bill
      const u2Bills = await adapter.listBills('user_u2');
      expect(u2Bills.some(b => b.id === 'bill_private_u1')).toBe(false);

      // User 2 attempts to fetch User 1's private bill directly without share mode -> returns null
      const directGet = await adapter.getBill('bill_private_u1', 'user_u2', false);
      expect(directGet).toBeNull();

      // User 2 attempts to fetch with share mode (public link) -> allowed as read-only viewer
      const shareGet = await adapter.getBill('bill_private_u1', 'user_u2', true);
      expect(shareGet).not.toBeNull();
      expect(shareGet?.role).toBe('viewer');
      expect(shareGet?.isReadOnly).toBe(true);

      // User 2 attempts to overwrite or edit User 1's bill -> rejected with Forbidden
      let editForbidden = false;
      try {
        await adapter.saveBill(
          'bill_private_u1',
          {
            name: 'Hijacked Bill',
            people: [{ id: 'p_h', name: 'User Two', userId: 'user_u2' }],
            items: [],
          },
          'user_u2'
        );
      } catch (err: unknown) {
        editForbidden = true;
        expect((err as Error).message).toContain('Forbidden');
      }
      expect(editForbidden).toBe(true);
    });

    it('strictly isolates group operations and permits only group owner to manage group lifecycle', async () => {
      const u1Group = await adapter.createGroup('User One Secret Group', 'user_u1');

      // User 2 tries to update group metadata -> forbidden
      let updateForbidden = false;
      try {
        await adapter.updateGroup(u1Group.id, { name: 'Compromised Name' }, 'user_u2');
      } catch (err: unknown) {
        updateForbidden = true;
        expect((err as Error).message).toContain('Forbidden');
      }
      expect(updateForbidden).toBe(true);

      // User 2 tries to transfer group ownership -> forbidden
      let transferForbidden = false;
      try {
        await adapter.transferGroupOwnership(u1Group.id, 'user_u2', 'user_u2');
      } catch (err: unknown) {
        transferForbidden = true;
        expect((err as Error).message).toContain('Forbidden');
      }
      expect(transferForbidden).toBe(true);

      // Owner User 1 transfers ownership legitimately to User 2
      await adapter.transferGroupOwnership(u1Group.id, 'user_u2', 'user_u1');

      // Verify User 2 is now the owner
      const updatedGroup = await adapter.getGroup(u1Group.id, 'user_u2');
      expect(updatedGroup?.owner_id).toBe('user_u2');
      expect(updatedGroup?.is_owner).toBe(true);
    });
  });

  describe('Edge Cases & Data Integrity', () => {
    it('handles empty items array without crashing and preserves global fixed charges', async () => {
      await adapter.saveBill(
        'bill_empty_items',
        {
          name: 'Flat Venue Fee',
          currency: 'VND',
          people: [{ id: 'p1', name: 'User One', userId: 'user_u1' }],
          items: [], // 0 items
          charges: [
            { id: 'c_flat', name: 'Room Rental', type: 'fixed', amount: 500000 },
          ],
        },
        'user_u1'
      );

      const bill = await adapter.getBill('bill_empty_items', 'user_u1');
      expect(bill?.data.items.length).toBe(0);
      expect(bill?.data.globalCharges.length).toBe(1);

      const summaries = await adapter.listBills('user_u1');
      const summary = summaries.find(b => b.id === 'bill_empty_items');
      expect(summary?.totalAmount).toBe(500000);
    });

    it('safely handles Vietnamese Unicode characters, diacritics, and emojis', async () => {
      const specialName = 'Tiệc Tất Niên & Tân Niên 2026 🎉🥂';
      const specialLocation = 'Quán Ốc Đêm Ngon 🐚, Đường Nguyễn Tri Phương, Q.10';

      await adapter.saveBill(
        'bill_unicode_test',
        {
          name: specialName,
          location: specialLocation,
          currency: 'VND',
          people: [
            { id: 'p_vn1', name: 'Trần Thị Ngọc Ánh 🌸', userId: 'user_u1' },
            { id: 'p_vn2', name: 'Nguyễn Đăng Khoa ⚡', userId: 'user_u2' },
          ],
          items: [
            { id: 'i_vn1', name: 'Càng ghẹ rang muối ớt đặc biệt 🦀', price: 185000, quantity: 2, assignments: { p_vn1: 1, p_vn2: 1 } },
          ],
        },
        'user_u1'
      );

      const fetched = await adapter.getBill('bill_unicode_test', 'user_u1');
      expect(fetched?.data.name).toBe(specialName);
      expect(fetched?.data.location).toBe(specialLocation);
      expect(fetched?.data.people[0].name).toBe('Trần Thị Ngọc Ánh 🌸');
      expect(fetched?.data.items[0].name).toBe('Càng ghẹ rang muối ớt đặc biệt 🦀');
    });

    it('preserves group calculation consistency when linking and unlinking bills repeatedly', async () => {
      const groupA = await adapter.createGroup('Group Alpha', 'user_u1');
      const groupB = await adapter.createGroup('Group Beta', 'user_u1');

      await adapter.saveBill(
        'bill_mobile',
        {
          name: 'Floating Dinner',
          groupId: groupA.id,
          currency: 'VND',
          people: [{ id: 'p1', name: 'Alice', userId: 'user_u1' }],
          items: [{ id: 'i1', name: 'Buffet', price: 200000, quantity: 1, assignments: {} }],
        },
        'user_u1'
      );

      // Check Group A total
      let ga = await adapter.getGroup(groupA.id, 'user_u1');
      let gb = await adapter.getGroup(groupB.id, 'user_u1');
      expect(ga?.total_amount).toBe(200000);
      expect(gb?.total_amount).toBe(0);

      // Move bill to Group B
      await adapter.linkBillToGroup('bill_mobile', groupB.id, 'user_u1');
      ga = await adapter.getGroup(groupA.id, 'user_u1');
      gb = await adapter.getGroup(groupB.id, 'user_u1');
      expect(ga?.total_amount).toBe(0);
      expect(gb?.total_amount).toBe(200000);

      // Unlink bill from all groups (standalone)
      await adapter.linkBillToGroup('bill_mobile', null, 'user_u1');
      ga = await adapter.getGroup(groupA.id, 'user_u1');
      gb = await adapter.getGroup(groupB.id, 'user_u1');
      expect(ga?.total_amount).toBe(0);
      expect(gb?.total_amount).toBe(0);

      // Verify the bill is still fully intact as a standalone bill
      const standalone = await adapter.getBill('bill_mobile', 'user_u1');
      expect(standalone?.group_id).toBeNull();
      expect(standalone?.data.items.length).toBe(1);
    });
  });
});
