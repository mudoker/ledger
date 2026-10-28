import { describe, expect, it, beforeEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import Fuse from 'fuse.js';

describe('Bill Groups, Aggregation, and Search Feature', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    // In-memory sqlite instance for each test
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();

    // Create test users
    await adapter.upsertUser({
      id: 'user_alice',
      email: 'alice@example.com',
      name: 'Alice',
      avatar_url: null,
    });
    await adapter.upsertUser({
      id: 'user_bob',
      email: 'bob@example.com',
      name: 'Bob',
      avatar_url: null,
    });
    await adapter.upsertUser({
      id: 'user_charlie',
      email: 'charlie@example.com',
      name: 'Charlie',
      avatar_url: null,
    });
  });

  describe('Group Creation and Retrieval', () => {
    it('creates a bill group and retrieves it with empty bills', async () => {
      const group = await adapter.createGroup(
        'Summer Trip 2026',
        'user_alice',
        'Expenses for vacation',
        'VND'
      );

      expect(group.id).toBeDefined();
      expect(group.name).toBe('Summer Trip 2026');
      expect(group.owner_id).toBe('user_alice');
      expect(group.owner_name).toBe('Alice');
      expect(group.total_amount).toBe(0);
      expect(group.total_bills).toBe(0);
      expect(group.bills).toEqual([]);
    });

    it('lists groups owned or participated in', async () => {
      await adapter.createGroup('Alice Group 1', 'user_alice');
      await adapter.createGroup('Bob Group 1', 'user_bob');

      const aliceGroups = await adapter.listGroups('user_alice');
      expect(aliceGroups.length).toBe(1);
      expect(aliceGroups[0].name).toBe('Alice Group 1');

      const bobGroups = await adapter.listGroups('user_bob');
      expect(bobGroups.length).toBe(1);
      expect(bobGroups[0].name).toBe('Bob Group 1');
    });
  });

  describe('Aggregation & Hierarchy: Group -> Bills -> Items', () => {
    it('aggregates bill subtotals and displays line items without sponsor clutter', async () => {
      // 1. Create a group
      const group = await adapter.createGroup(
        'Tokyo Trip',
        'user_alice',
        null,
        'VND'
      );

      // 2. Create Bill 1 linked to group
      await adapter.saveBill(
        'bill_1',
        {
          name: 'Day 1 Ramen',
          location: 'Shinjuku',
          currency: 'VND',
          group_id: group.id,
          people: [
            { id: 'p1', name: 'Alice', sponsorAmount: 100000, paidAmount: 0 },
            { id: 'p2', name: 'Bob', sponsorAmount: 0, paidAmount: 0 },
          ],
          items: [
            { id: 'item_1', name: 'Tonkotsu Ramen', price: 120000, quantity: 2, assignments: {} },
            { id: 'item_2', name: 'Gyoza', price: 60000, quantity: 1, assignments: {} },
          ],
          charges: [
            { id: 'c1', name: 'VAT', type: 'percent', amount: 10 },
          ],
        },
        'user_alice'
      );

      // 3. Create Bill 2 linked to group
      await adapter.saveBill(
        'bill_2',
        {
          name: 'Day 2 Coffee',
          location: 'Shibuya',
          currency: 'VND',
          group_id: group.id,
          people: [
            { id: 'p3', name: 'Alice', sponsorAmount: 0, paidAmount: 0 },
          ],
          items: [
            { id: 'item_3', name: 'Matcha Latte', price: 75000, quantity: 2, assignments: {} },
          ],
          charges: [],
        },
        'user_alice'
      );

      // 4. Retrieve Group Details
      const groupDetail = await adapter.getGroup(group.id, 'user_alice');
      expect(groupDetail).not.toBeNull();
      expect(groupDetail!.total_bills).toBe(2);

      // Bill 1 subtotal: (120000 * 2) + 60000 = 300,000. Plus 10% VAT = 330,000.
      // Bill 2 subtotal: (75000 * 2) = 150,000.
      // Total group amount: 330,000 + 150,000 = 480,000.
      expect(groupDetail!.total_amount).toBe(480000);

      // Inspect bills in group
      expect(groupDetail!.bills.length).toBe(2);
      const ramenBill = groupDetail!.bills.find((b) => b.id === 'bill_1')!;
      expect(ramenBill).toBeDefined();
      expect(ramenBill.name).toBe('Day 1 Ramen');
      expect(ramenBill.location).toBe('Shinjuku');
      expect(ramenBill.totalAmount).toBe(330000);

      // Inspect items inside Ramen bill
      expect(ramenBill.items.length).toBe(2);
      expect(ramenBill.items[0].id).toBe('item_1');
      expect(ramenBill.items[0].name).toBe('Tonkotsu Ramen');
      expect(ramenBill.items[0].price).toBe(120000);
      expect(ramenBill.items[0].quantity).toBe(2);
      expect(ramenBill.items[0].totalPrice).toBe(240000);

      // Overview invariant: no sponsor details exposed on group overview items/bills
      expect((ramenBill as any).sponsorAmount).toBeUndefined();
      expect((ramenBill.items[0] as any).sponsorAmount).toBeUndefined();
    });

    it('allows linking and unlinking an existing bill to/from a group', async () => {
      const group = await adapter.createGroup('Project Team Dinner', 'user_alice');

      // Create an unlinked bill
      await adapter.saveBill(
        'bill_standalone',
        {
          name: 'Quick Snack',
          currency: 'VND',
          people: [],
          items: [{ id: 'item_s', name: 'Snack', price: 50000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      // Initially not in group
      let groupDetail = await adapter.getGroup(group.id, 'user_alice');
      expect(groupDetail!.total_bills).toBe(0);

      // Link to group
      await adapter.linkBillToGroup('bill_standalone', group.id, 'user_alice');
      groupDetail = await adapter.getGroup(group.id, 'user_alice');
      expect(groupDetail!.total_bills).toBe(1);
      expect(groupDetail!.bills[0].id).toBe('bill_standalone');

      // Unlink from group
      await adapter.linkBillToGroup('bill_standalone', null, 'user_alice');
      groupDetail = await adapter.getGroup(group.id, 'user_alice');
      expect(groupDetail!.total_bills).toBe(0);
    });

    it('persistently retains group link across repeated saves, edits, and list operations', async () => {
      const groupA = await adapter.createGroup('Vacation Group A', 'user_alice');
      const groupB = await adapter.createGroup('Vacation Group B', 'user_alice');

      // 1. Initial save of bill linked to Group A
      await adapter.saveBill(
        'bill_persistent',
        {
          name: 'Resort Booking',
          currency: 'VND',
          groupId: groupA.id,
          people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 500000 }],
          items: [{ id: 'item_1', name: 'Night 1', price: 500000, quantity: 1, assignments: {} }],
        },
        'user_alice'
      );

      // Verify bill has group_id in getBill
      const bill = await adapter.getBill('bill_persistent', 'user_alice');
      expect(bill?.group_id).toBe(groupA.id);
      expect(bill?.data.groupId).toBe(groupA.id);
      expect(bill?.group_name).toBe('Vacation Group A');

      // Verify group detail has bill
      let detailA = await adapter.getGroup(groupA.id, 'user_alice');
      expect(detailA?.total_bills).toBe(1);
      expect(detailA?.bills[0].id).toBe('bill_persistent');

      // 2. Perform repeated save/edit (like debounced auto-save)
      await adapter.saveBill(
        'bill_persistent',
        {
          name: 'Resort Booking Updated',
          currency: 'VND',
          groupId: bill?.data.groupId,
          people: bill?.data.people,
          items: [
            { id: 'item_1', name: 'Night 1', price: 500000, quantity: 1, assignments: {} },
            { id: 'item_2', name: 'Night 2', price: 500000, quantity: 1, assignments: {} },
          ],
        },
        'user_alice'
      );

      // Verify group link is still persistent
      detailA = await adapter.getGroup(groupA.id, 'user_alice');
      expect(detailA?.total_bills).toBe(1);
      expect(detailA?.total_amount).toBe(1000000);

      // Verify listBills retains group_id and group_name
      const bills = await adapter.listBills('user_alice');
      const listedBill = bills.find(b => b.id === 'bill_persistent');
      expect(listedBill?.group_id).toBe(groupA.id);
      expect(listedBill?.group_name).toBe('Vacation Group A');

      // 3. Reassign to Group B
      await adapter.saveBill(
        'bill_persistent',
        {
          name: 'Resort Booking Moved',
          currency: 'VND',
          groupId: groupB.id,
          people: bill?.data.people,
          items: [
            { id: 'item_1', name: 'Night 1', price: 500000, quantity: 1, assignments: {} },
          ],
        },
        'user_alice'
      );

      // Group A now has 0 bills, Group B has 1 bill
      detailA = await adapter.getGroup(groupA.id, 'user_alice');
      expect(detailA?.total_bills).toBe(0);

      const detailB = await adapter.getGroup(groupB.id, 'user_alice');
      expect(detailB?.total_bills).toBe(1);
      expect(detailB?.bills[0].id).toBe('bill_persistent');
    });

    it('preserves bills when a group is deleted (ON DELETE SET NULL)', async () => {
      const group = await adapter.createGroup('Temporary Group', 'user_alice');

      await adapter.saveBill(
        'bill_survivor',
        {
          name: 'Persistent Bill',
          group_id: group.id,
          currency: 'VND',
          people: [],
          items: [{ id: 'item_p', name: 'Lunch', price: 80000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      // Delete group
      await adapter.deleteGroup(group.id, 'user_alice');

      // Group should be null
      const deletedGroup = await adapter.getGroup(group.id, 'user_alice');
      expect(deletedGroup).toBeNull();

      // Bill should still exist with group_id = null
      const bill = await adapter.getBill('bill_survivor', 'user_alice');
      expect(bill).not.toBeNull();
      expect(bill!.group_id).toBeNull();
    });
  });

  describe('Owner-Only Administration & Transferable Ownership', () => {
    it('allows group owner to transfer ownership to another user', async () => {
      const group = await adapter.createGroup('Alice Group', 'user_alice');

      expect(group.owner_id).toBe('user_alice');

      // Transfer ownership to Bob
      await adapter.transferGroupOwnership(group.id, 'user_bob', 'user_alice');

      const updatedGroup = await adapter.getGroup(group.id, 'user_bob');
      expect(updatedGroup!.owner_id).toBe('user_bob');
      expect(updatedGroup!.owner_name).toBe('Bob');
      expect(updatedGroup!.is_owner).toBe(true);
    });

    it('prevents non-owners from transferring group ownership', async () => {
      const group = await adapter.createGroup('Alice Group', 'user_alice');

      // Bob tries to transfer Alice's group to Charlie
      expect(
        adapter.transferGroupOwnership(group.id, 'user_charlie', 'user_bob')
      ).rejects.toThrow();
    });

    it('allows bill owner to transfer bill ownership to another user', async () => {
      await adapter.saveBill(
        'bill_owned_by_alice',
        {
          name: 'Team Outing',
          currency: 'VND',
          people: [
            { id: 'p_alice', name: 'Alice', userId: 'user_alice' },
            { id: 'p_bob', name: 'Bob', userId: 'user_bob' },
          ],
          items: [{ id: 'i1', name: 'Team Pizza', price: 200000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      const billBefore = await adapter.getBill('bill_owned_by_alice', 'user_alice');
      expect(billBefore!.owner_id).toBe('user_alice');

      // Alice transfers ownership to Bob
      await adapter.transferBillOwnership('bill_owned_by_alice', 'user_bob', 'user_alice');

      const billAfter = await adapter.getBill('bill_owned_by_alice', 'user_bob');
      expect(billAfter!.owner_id).toBe('user_bob');
    });

    it('prevents non-owners from transferring bill ownership', async () => {
      await adapter.saveBill(
        'bill_exclusive_to_alice',
        {
          name: 'Alice Solo Dinner',
          currency: 'VND',
          people: [{ id: 'p_a', name: 'Alice', userId: 'user_alice' }],
          items: [{ id: 'i1', name: 'Steak', price: 300000, quantity: 1, assignments: {} }],
          charges: [],
        },
        'user_alice'
      );

      // Charlie tries to transfer bill ownership
      expect(
        adapter.transferBillOwnership('bill_exclusive_to_alice', 'user_charlie', 'user_charlie')
      ).rejects.toThrow();
    });
  });

  describe('Fuzzy Search Across Groups, Bills, and Items', () => {
    it('returns search results matching query across groups, bills, and items', async () => {
      const group = await adapter.createGroup(
        'Danang Summer Beach',
        'user_alice',
        'Coastal trip with friends'
      );

      await adapter.saveBill(
        'bill_seafood',
        {
          name: 'Seafood Banquet',
          location: 'My Khe Beach Restaurant',
          group_id: group.id,
          currency: 'VND',
          people: [],
          items: [
            { id: 'item_crab', name: 'Steamed King Crab', price: 500000, quantity: 2, assignments: {} },
            { id: 'item_squid', name: 'Grilled Squid', price: 180000, quantity: 1, assignments: {} },
          ],
          charges: [],
        },
        'user_alice'
      );

      // Search for group
      const groupSearch = await adapter.search('Danang', 'user_alice');
      expect(groupSearch.groups.length).toBeGreaterThanOrEqual(1);
      expect(groupSearch.groups[0].name).toBe('Danang Summer Beach');

      // Search for bill location or title
      const billSearch = await adapter.search('Banquet', 'user_alice');
      expect(billSearch.bills.length).toBeGreaterThanOrEqual(1);
      expect(billSearch.bills[0].name).toBe('Seafood Banquet');

      // Search for item
      const itemSearch = await adapter.search('Crab', 'user_alice');
      expect(itemSearch.items.length).toBeGreaterThanOrEqual(1);
      expect(itemSearch.items[0].name).toBe('Steamed King Crab');
      expect(itemSearch.items[0].bill_id).toBe('bill_seafood');
    });

    it('supports client-side Fuse.js fuzzy search with minor typos', () => {
      const sampleItems = [
        { id: '1', name: 'Tonkotsu Ramen', bill_id: 'b1', bill_name: 'Dinner' },
        { id: '2', name: 'Steamed King Crab', bill_id: 'b2', bill_name: 'Seafood' },
        { id: '3', name: 'Matcha Latte', bill_id: 'b3', bill_name: 'Cafe' },
      ];

      const fuse = new Fuse(sampleItems, {
        keys: ['name', 'bill_name'],
        threshold: 0.4,
      });

      // Search with typo "Tonkatsu"
      const results = fuse.search('Tonkatsu');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.name).toBe('Tonkotsu Ramen');

      // Search with typo "Matche"
      const matchaResults = fuse.search('Matche');
      expect(matchaResults.length).toBeGreaterThan(0);
      expect(matchaResults[0].item.name).toBe('Matcha Latte');
    });
  });
});
