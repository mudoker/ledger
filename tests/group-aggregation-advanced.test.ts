import { describe, expect, it, beforeEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';

describe('Advanced Group Aggregation, Calculations & Security Invariants', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();

    await adapter.upsertUser({ id: 'user_alice', email: 'alice@example.com', name: 'Alice' });
    await adapter.upsertUser({ id: 'user_bob', email: 'bob@example.com', name: 'Bob' });
    await adapter.upsertUser({ id: 'user_charlie', email: 'charlie@example.com', name: 'Charlie' });
    await adapter.upsertUser({ id: 'user_stranger', email: 'stranger@example.com', name: 'Stranger' });
  });

  describe('Multi-Bill Complex Charge Calculations', () => {
    it('accurately calculates compound subtotals across multiple bills with mixed fixed and percentage charges', async () => {
      const group = await adapter.createGroup(
        'Grand Company Retreat',
        'user_alice',
        'Company trip to Da Nang',
        'VND'
      );

      // Bill 1: 3 items, +10% VAT, +20,000 fixed delivery
      // Raw items: (100k * 2) + 50k + (30k * 3) = 200k + 50k + 90k = 340,000
      // Percent charges: 10% of 340,000 = 34,000
      // Fixed charges: 20,000
      // Expected Bill 1 Subtotal: 340,000 + 34,000 + 20,000 = 394,000
      await adapter.saveBill(
        'bill_retreat_1',
        {
          name: 'Welcome Dinner',
          location: 'Seafood Harbor',
          currency: 'VND',
          groupId: group.id,
          people: [
            { id: 'p1', name: 'Alice', userId: 'user_alice', sponsorAmount: 150000, paidAmount: 0 },
            { id: 'p2', name: 'Bob', userId: 'user_bob', sponsorAmount: 0, paidAmount: 0 },
          ],
          items: [
            { id: 'i1_1', name: 'Tiger Prawns', price: 100000, quantity: 2, assignments: {} },
            { id: 'i1_2', name: 'Fried Rice', price: 50000, quantity: 1, assignments: {} },
            { id: 'i1_3', name: 'Mineral Water', price: 30000, quantity: 3, assignments: {} },
          ],
          charges: [
            { id: 'c1_1', name: 'VAT', type: 'percent', amount: 10 },
            { id: 'c1_2', name: 'Delivery / Packaging', type: 'fixed', amount: 20000 },
          ],
        },
        'user_alice'
      );

      // Bill 2: 2 items, +5% Service charge, +8% Gov tax, -15,000 voucher discount
      // Raw items: (120k * 1) + (80k * 2) = 120k + 160k = 280,000
      // Percent charges: 5% + 8% = 13% of 280,000 = 36,400
      // Fixed charges: -15,000
      // Expected Bill 2 Subtotal: 280,000 + 36,400 - 15,000 = 301,400
      await adapter.saveBill(
        'bill_retreat_2',
        {
          name: 'Team Cafe Lunch',
          location: 'Highlands Coffee',
          currency: 'VND',
          groupId: group.id,
          people: [
            { id: 'p3', name: 'Alice', userId: 'user_alice' },
            { id: 'p4', name: 'Charlie', userId: 'user_charlie' },
          ],
          items: [
            { id: 'i2_1', name: 'Freeze Green Tea', price: 120000, quantity: 1, assignments: {} },
            { id: 'i2_2', name: 'Banh Mi', price: 80000, quantity: 2, assignments: {} },
          ],
          charges: [
            { id: 'c2_1', name: 'Service', type: 'percent', amount: 5 },
            { id: 'c2_2', name: 'Gov Tax', type: 'percent', amount: 8 },
            { id: 'c2_3', name: 'Promo Voucher', type: 'fixed', amount: -15000 },
          ],
        },
        'user_alice'
      );

      // Bill 3: 1 item, no charges
      // Raw items: 75,000 * 2 = 150,000
      // Expected Bill 3 Subtotal: 150,000
      await adapter.saveBill(
        'bill_retreat_3',
        {
          name: 'Night Street Food',
          location: 'Son Tra Night Market',
          currency: 'VND',
          groupId: group.id,
          people: [{ id: 'p5', name: 'Alice', userId: 'user_alice' }],
          items: [
            { id: 'i3_1', name: 'Grilled Rice Paper', price: 75000, quantity: 2, assignments: {} },
          ],
          charges: [],
        },
        'user_alice'
      );

      // Fetch group detail
      const detail = await adapter.getGroup(group.id, 'user_alice');
      expect(detail).not.toBeNull();

      // Counts
      expect(detail!.total_bills).toBe(3);
      expect(detail!.total_items).toBe(6); // 3 items + 2 items + 1 item = 6 distinct items

      // Total group amount: 394,000 + 301,400 + 150,000 = 845,400
      expect(detail!.total_amount).toBe(845400);

      // Verify each bill subtotal
      const b1 = detail!.bills.find((b) => b.id === 'bill_retreat_1')!;
      expect(b1.totalAmount).toBe(394000);
      expect(b1.items.length).toBe(3);

      const b2 = detail!.bills.find((b) => b.id === 'bill_retreat_2')!;
      expect(b2.totalAmount).toBe(301400);
      expect(b2.items.length).toBe(2);

      const b3 = detail!.bills.find((b) => b.id === 'bill_retreat_3')!;
      expect(b3.totalAmount).toBe(150000);
      expect(b3.items.length).toBe(1);

      // Invariant: no sponsor details on bills or items in group overview
      expect((b1 as any).sponsorAmount).toBeUndefined();
      expect((b1 as any).paidAmount).toBeUndefined();
      for (const item of b1.items) {
        expect((item as any).sponsorAmount).toBeUndefined();
      }
    });
  });

  describe('Bill Reassignment Between Groups', () => {
    it('seamlessly updates both group totals when moving a bill between groups', async () => {
      const groupA = await adapter.createGroup('Group A', 'user_alice');
      const groupB = await adapter.createGroup('Group B', 'user_alice');

      // Create bill in Group A
      await adapter.saveBill(
        'bill_moveable',
        {
          name: 'Transferable Dinner',
          groupId: groupA.id,
          currency: 'VND',
          people: [],
          items: [{ id: 'item_t', name: 'Steak', price: 250000, quantity: 2, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      let detailA = await adapter.getGroup(groupA.id, 'user_alice');
      let detailB = await adapter.getGroup(groupB.id, 'user_alice');
      expect(detailA!.total_bills).toBe(1);
      expect(detailA!.total_amount).toBe(500000);
      expect(detailB!.total_bills).toBe(0);
      expect(detailB!.total_amount).toBe(0);

      // Move bill to Group B
      await adapter.linkBillToGroup('bill_moveable', groupB.id, 'user_alice');

      detailA = await adapter.getGroup(groupA.id, 'user_alice');
      detailB = await adapter.getGroup(groupB.id, 'user_alice');
      expect(detailA!.total_bills).toBe(0);
      expect(detailA!.total_amount).toBe(0);
      expect(detailB!.total_bills).toBe(1);
      expect(detailB!.total_amount).toBe(500000);

      // Unlink completely
      await adapter.linkBillToGroup('bill_moveable', null, 'user_alice');
      detailB = await adapter.getGroup(groupB.id, 'user_alice');
      expect(detailB!.total_bills).toBe(0);
      expect(detailB!.total_amount).toBe(0);

      const bill = await adapter.getBill('bill_moveable', 'user_alice');
      expect(bill!.group_id).toBeNull();
    });
  });

  describe('Security & RBAC Enforcement on Edit and Transfer', () => {
    it('forbids non-owner from updating group metadata', async () => {
      const group = await adapter.createGroup('Alice Only Group', 'user_alice');

      // Bob attempts to update group name
      expect(
        adapter.updateGroup(group.id, { name: 'Bob Hijack' }, 'user_bob')
      ).rejects.toThrow(/Forbidden/i);
    });

    it('forbids non-owner from deleting a group', async () => {
      const group = await adapter.createGroup('Alice Only Group', 'user_alice');

      // Bob attempts to delete Alice's group
      expect(
        adapter.deleteGroup(group.id, 'user_bob')
      ).rejects.toThrow(/Forbidden/i);
    });

    it('forbids non-owner from modifying a bill', async () => {
      await adapter.saveBill(
        'bill_alice_private',
        {
          name: 'Alice Meal',
          currency: 'VND',
          people: [{ id: 'p_a', name: 'Alice', userId: 'user_alice' }],
          items: [{ id: 'i_1', name: 'Salad', price: 60000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      // Bob attempts to edit Alice's bill
      expect(
        adapter.saveBill(
          'bill_alice_private',
          {
            name: 'Hacked Meal',
            people: [],
            items: [],
            charges: [],
          },
          'user_bob'
        )
      ).rejects.toThrow(/Forbidden/i);
    });

    it('strictly separates group owner permissions from bill owner permissions (single editor invariant)', async () => {
      // Alice owns the group
      const group = await adapter.createGroup('Trip 2026', 'user_alice');

      // Bob creates and owns a bill inside Alice\'s group
      await adapter.saveBill(
        'bill_bob_in_alice_group',
        {
          name: 'Bob Seafood Expense',
          currency: 'VND',
          groupId: group.id,
          people: [{ id: 'p_b', name: 'Bob', userId: 'user_bob' }],
          items: [{ id: 'i1', name: 'Lobster', price: 800000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_bob'
      );

      // 1. Group Owner (Alice) CAN update group metadata
      await adapter.updateGroup(group.id, { name: 'Trip 2026 - Updated by Alice' }, 'user_alice');
      const updatedGroup = await adapter.getGroup(group.id, 'user_alice');
      expect(updatedGroup!.name).toBe('Trip 2026 - Updated by Alice');

      // 2. Bill Owner (Bob) CANNOT update group metadata (Alice owns group)
      expect(
        adapter.updateGroup(group.id, { name: 'Bob Hacked Group' }, 'user_bob')
      ).rejects.toThrow(/Forbidden/i);

      // 3. Group Owner (Alice) CANNOT modify Bob\'s bill inside the group (Bob owns bill)
      expect(
        adapter.saveBill(
          'bill_bob_in_alice_group',
          {
            name: 'Alice Modified Bill',
            people: [],
            items: [],
            charges: [],
          },
          'user_alice'
        )
      ).rejects.toThrow(/Forbidden/i);

      // 4. Group Owner (Alice) CANNOT transfer Bob\'s bill
      expect(
        adapter.transferBillOwnership('bill_bob_in_alice_group', 'user_charlie', 'user_alice')
      ).rejects.toThrow(/Forbidden/i);

      // 5. Bill Owner (Bob) CAN modify his own bill
      await adapter.saveBill(
        'bill_bob_in_alice_group',
        {
          name: 'Bob Seafood Expense - Legit Update',
          people: [{ id: 'p_b', name: 'Bob', userId: 'user_bob' }],
          items: [{ id: 'i1', name: 'Lobster', price: 900000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_bob'
      );
      const bobBill = await adapter.getBill('bill_bob_in_alice_group', 'user_bob');
      expect(bobBill!.data.name).toBe('Bob Seafood Expense - Legit Update');
      expect(bobBill!.data.items[0].price).toBe(900000);
    });

    it('reassigns owner on bill transfer and maintains previous owner as participant', async () => {
      await adapter.saveBill(
        'bill_to_transfer',
        {
          name: 'Birthday Party',
          currency: 'VND',
          people: [
            { id: 'p_alice', name: 'Alice', userId: 'user_alice', paidAmount: 200000 },
            { id: 'p_bob', name: 'Bob', userId: 'user_bob' },
          ],
          items: [{ id: 'i_cake', name: 'Cake', price: 400000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      // Verify Alice is owner
      let bill = await adapter.getBill('bill_to_transfer', 'user_alice');
      expect(bill!.owner_id).toBe('user_alice');
      expect(bill!.role).toBe('owner');
      expect(bill!.isReadOnly).toBe(false);

      // Alice transfers ownership to Bob
      await adapter.transferBillOwnership('bill_to_transfer', 'user_bob', 'user_alice');

      // Bob is now owner
      const billForBob = await adapter.getBill('bill_to_transfer', 'user_bob');
      expect(billForBob!.owner_id).toBe('user_bob');
      expect(billForBob!.role).toBe('owner');
      expect(billForBob!.isReadOnly).toBe(false);

      // Alice is now participant with read-only access, but her paid amount is preserved
      const billForAlice = await adapter.getBill('bill_to_transfer', 'user_alice');
      expect(billForAlice!.owner_id).toBe('user_bob');
      expect(billForAlice!.role).toBe('participant');
      expect(billForAlice!.isReadOnly).toBe(true);

      const alicePerson = billForAlice!.data.people.find((p) => p.userId === 'user_alice');
      expect(alicePerson).toBeDefined();
      expect(alicePerson!.paidAmount).toBe(200000);
    });

    it('preserves individual bill ownership when group ownership is transferred', async () => {
      const group = await adapter.createGroup('Multi-Owner Trip', 'user_alice');

      // Bob creates a bill inside Alice's group
      await adapter.saveBill(
        'bill_bob_in_group',
        {
          name: 'Bob Car Rental',
          groupId: group.id,
          currency: 'VND',
          people: [{ id: 'pb', name: 'Bob', userId: 'user_bob' }],
          items: [{ id: 'ib', name: 'Rental', price: 1000000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_bob'
      );

      // Alice transfers the group ownership to Charlie
      await adapter.transferGroupOwnership(group.id, 'user_charlie', 'user_alice');

      const updatedGroup = await adapter.getGroup(group.id, 'user_charlie');
      expect(updatedGroup!.owner_id).toBe('user_charlie');

      // Bob's bill inside the group still belongs to Bob!
      const bobBill = await adapter.getBill('bill_bob_in_group', 'user_bob');
      expect(bobBill!.owner_id).toBe('user_bob');
      expect(bobBill!.role).toBe('owner');
    });
  });

  describe('Search Edge Cases and Access Isolation', () => {
    it('handles whitespace and empty search queries gracefully', async () => {
      const emptyResults = await adapter.search('', 'user_alice');
      expect(emptyResults.groups).toEqual([]);
      expect(emptyResults.bills).toEqual([]);
      expect(emptyResults.items).toEqual([]);

      const whitespaceResults = await adapter.search('    ', 'user_alice');
      expect(whitespaceResults.groups).toEqual([]);
      expect(whitespaceResults.bills).toEqual([]);
      expect(whitespaceResults.items).toEqual([]);
    });

    it('performs case-insensitive searches across description and location', async () => {
      const group = await adapter.createGroup(
        'Euro Trip',
        'user_alice',
        'Exploring the ALPS and Swiss Lakes'
      );

      await adapter.saveBill(
        'bill_swiss',
        {
          name: 'Fondue Feast',
          location: 'ZERMATT Village',
          groupId: group.id,
          currency: 'VND',
          people: [],
          items: [{ id: 'i_cheese', name: 'Gruyere Blend', price: 300000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      // Lowercase query matching uppercase in DB
      const searchAlps = await adapter.search('alps', 'user_alice');
      expect(searchAlps.groups.length).toBe(1);
      expect(searchAlps.groups[0].name).toBe('Euro Trip');

      // Mixed case query matching uppercase location
      const searchZermatt = await adapter.search('zErMaTt', 'user_alice');
      expect(searchZermatt.bills.length).toBe(1);
      expect(searchZermatt.bills[0].name).toBe('Fondue Feast');
    });

    it('isolates private bills and groups from unauthorized users in search results', async () => {
      // Alice creates a private group and bill
      const group = await adapter.createGroup('Alice Secret Group', 'user_alice');
      await adapter.saveBill(
        'bill_secret',
        {
          name: 'Confidential Dinner',
          location: 'Hidden Vault',
          groupId: group.id,
          currency: 'VND',
          people: [{ id: 'p_al', name: 'Alice', userId: 'user_alice' }],
          items: [{ id: 'i_s', name: 'Secret Item', price: 999999, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      // Stranger searches for "Secret" or "Confidential"
      const strangerSearch = await adapter.search('Secret', 'user_stranger');
      expect(strangerSearch.groups.length).toBe(0);
      expect(strangerSearch.bills.length).toBe(0);
      expect(strangerSearch.items.length).toBe(0);

      // Alice searches for "Secret" -> finds them
      const aliceSearch = await adapter.search('Secret', 'user_alice');
      expect(aliceSearch.groups.length).toBe(1);
      expect(aliceSearch.items.length).toBe(1);
    });
  });
});
