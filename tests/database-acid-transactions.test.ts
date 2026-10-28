import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { DatabaseSync } from 'node:sqlite';
import { unlinkSync, existsSync } from 'node:fs';

describe('Database ACID Transactions & System Consistency', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();

    await adapter.upsertUser({
      id: 'user_alice',
      email: 'alice@example.com',
      name: 'Alice',
    });
    await adapter.upsertUser({
      id: 'user_bob',
      email: 'bob@example.com',
      name: 'Bob',
    });
    await adapter.upsertUser({
      id: 'user_charlie',
      email: 'charlie@example.com',
      name: 'Charlie',
    });
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('Atomicity (All-or-Nothing Execution)', () => {
    it('rolls back completely when saving a bill with invalid foreign key in assignments, preserving original state', async () => {
      // Step 1: Save initial valid bill
      await adapter.saveBill(
        'bill_atomic_1',
        {
          name: 'Original Feast',
          location: 'District 1',
          currency: 'VND',
          people: [
            { id: 'p1', name: 'Alice', userId: 'user_alice' },
            { id: 'p2', name: 'Bob', userId: 'user_bob' },
          ],
          items: [
            { id: 'i1', name: 'Wagyu Steak', price: 250000, quantity: 2, assignments: { p1: 1, p2: 1 } },
          ],
          charges: [
            { id: 'c1', name: 'VAT', type: 'percent', amount: 10 },
          ],
        },
        'user_alice'
      );

      const originalBill = await adapter.getBill('bill_atomic_1', 'user_alice');
      expect(originalBill).not.toBeNull();
      expect(originalBill?.data.name).toBe('Original Feast');
      expect(originalBill?.data.items.length).toBe(1);
      expect(originalBill?.data.items[0].name).toBe('Wagyu Steak');

      // Step 2: Attempt to update bill with an assignment to a non-existent person ID
      // This violates FOREIGN KEY constraint on item_assignments(person_id) -> people(id)
      let errorThrown = false;
      try {
        await adapter.saveBill(
          'bill_atomic_1',
          {
            name: 'Corrupted Update',
            location: 'Nowhere',
            currency: 'VND',
            people: [
              { id: 'p1', name: 'Alice', userId: 'user_alice' },
            ],
            items: [
              {
                id: 'i2',
                name: 'Truffle Pasta',
                price: 180000,
                quantity: 1,
                assignments: { non_existent_person_999: 1 }, // Foreign key violation!
              },
            ],
            charges: [],
          },
          'user_alice'
        );
      } catch (err: unknown) {
        errorThrown = true;
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).toContain('FOREIGN KEY');
      }

      expect(errorThrown).toBe(true);

      // Step 3: Verify the transaction rolled back completely: original bill, items, people, and charges must be intact
      const preservedBill = await adapter.getBill('bill_atomic_1', 'user_alice');
      expect(preservedBill).not.toBeNull();
      expect(preservedBill?.data.name).toBe('Original Feast');
      expect(preservedBill?.data.location).toBe('District 1');
      expect(preservedBill?.data.items.length).toBe(1);
      expect(preservedBill?.data.items[0].name).toBe('Wagyu Steak');
      expect(preservedBill?.data.items[0].assignments['p1']).toBe(1);
      expect(preservedBill?.data.people.length).toBe(2);
      expect(preservedBill?.data.globalCharges.length).toBe(1);
      expect(preservedBill?.data.globalCharges[0].name).toBe('VAT');
    });

    it('rolls back bill ownership transfer if target user does not exist without corrupting bill state', async () => {
      await adapter.saveBill(
        'bill_transfer_test',
        {
          name: 'Alice Private Bill',
          currency: 'VND',
          people: [{ id: 'p_al', name: 'Alice', userId: 'user_alice' }],
          items: [{ id: 'item_1', name: 'Coffee', price: 45000, quantity: 1, assignments: {} }],
        },
        'user_alice'
      );

      let transferFailed = false;
      try {
        await adapter.transferBillOwnership('bill_transfer_test', 'ghost_user_does_not_exist', 'user_alice');
      } catch (err: unknown) {
        transferFailed = true;
        expect((err as Error).message).toContain('New owner user not found');
      }

      expect(transferFailed).toBe(true);

      // Verify owner is still Alice
      const bill = await adapter.getBill('bill_transfer_test', 'user_alice');
      expect(bill?.owner_id).toBe('user_alice');
      expect(bill?.role).toBe('owner');
    });

    it('rolls back atomically when deleting a non-existent group or unauthorized user attempts group deletion', async () => {
      const group = await adapter.createGroup('Alice Secret Group', 'user_alice');

      // Bob tries to delete Alice's group
      let bobFailed = false;
      try {
        await adapter.deleteGroup(group.id, 'user_bob');
      } catch (err: unknown) {
        bobFailed = true;
        expect((err as Error).message).toContain('Forbidden');
      }
      expect(bobFailed).toBe(true);

      // Group must still exist and be intact
      const fetchedGroup = await adapter.getGroup(group.id, 'user_alice');
      expect(fetchedGroup).not.toBeNull();
      expect(fetchedGroup?.name).toBe('Alice Secret Group');
    });
  });

  describe('Consistency (Foreign Keys, Cascades & Schema Invariants)', () => {
    it('cascades deletion cleanly: deleting a bill removes all items, assignments, people, and charges', async () => {
      // Step 1: Create a bill with rich child records
      await adapter.saveBill(
        'bill_cascade_1',
        {
          name: 'Cascade Target Bill',
          location: 'Saigon Garden',
          currency: 'VND',
          people: [
            { id: 'p_cas_1', name: 'Alice', userId: 'user_alice' },
            { id: 'p_cas_2', name: 'Bob', userId: 'user_bob' },
          ],
          items: [
            { id: 'i_cas_1', name: 'Spring Rolls', price: 60000, quantity: 2, assignments: { p_cas_1: 1, p_cas_2: 1 } },
            { id: 'i_cas_2', name: 'Hot Pot', price: 300000, quantity: 1, assignments: { p_cas_1: 1 } },
          ],
          charges: [
            { id: 'c_cas_1', name: 'VAT 8%', type: 'percent', amount: 8 },
            { id: 'c_cas_2', name: 'Service', type: 'fixed', amount: 15000 },
          ],
        },
        'user_alice'
      );

      // Step 2: Delete bill
      const deleted = await adapter.deleteBill('bill_cascade_1', 'user_alice');
      expect(deleted).toBe(true);

      // Step 3: Verify bill itself is gone
      const billAfter = await adapter.getBill('bill_cascade_1', 'user_alice', true);
      expect(billAfter).toBeNull();

      // Step 4: Verify via direct low-level queries that child tables have 0 orphaned rows
      // We can inspect the underlying SQLite database directly
      const rawDb = (adapter as unknown as { db: DatabaseSync }).db;
      const remainingPeople = rawDb.prepare('SELECT COUNT(*) as count FROM people WHERE bill_id = ?').get('bill_cascade_1') as { count: number };
      const remainingItems = rawDb.prepare('SELECT COUNT(*) as count FROM items WHERE bill_id = ?').get('bill_cascade_1') as { count: number };
      const remainingCharges = rawDb.prepare('SELECT COUNT(*) as count FROM global_charges WHERE bill_id = ?').get('bill_cascade_1') as { count: number };
      const remainingAssignments = rawDb.prepare(
        'SELECT COUNT(*) as count FROM item_assignments WHERE item_id IN (\'i_cas_1\', \'i_cas_2\')'
      ).get() as { count: number };

      expect(remainingPeople.count).toBe(0);
      expect(remainingItems.count).toBe(0);
      expect(remainingCharges.count).toBe(0);
      expect(remainingAssignments.count).toBe(0);
    });

    it('preserves bills with group_id = NULL when a group is deleted (ON DELETE SET NULL invariant)', async () => {
      const group = await adapter.createGroup('Vacation Group', 'user_alice');

      await adapter.saveBill(
        'bill_in_group_1',
        {
          name: 'Beach Lunch',
          currency: 'VND',
          groupId: group.id,
          people: [{ id: 'p_1', name: 'Alice', userId: 'user_alice' }],
          items: [{ id: 'i_1', name: 'Seafood', price: 500000, quantity: 1, assignments: {} }],
        },
        'user_alice'
      );

      // Verify bill is linked to group
      const billBefore = await adapter.getBill('bill_in_group_1', 'user_alice');
      expect(billBefore?.group_id).toBe(group.id);

      // Delete group
      const deleteResult = await adapter.deleteGroup(group.id, 'user_alice');
      expect(deleteResult).toBe(true);

      // Group should be deleted
      const groupAfter = await adapter.getGroup(group.id, 'user_alice');
      expect(groupAfter).toBeNull();

      // Bill MUST NOT be deleted; its group_id should now be NULL
      const billAfter = await adapter.getBill('bill_in_group_1', 'user_alice');
      expect(billAfter).not.toBeNull();
      expect(billAfter?.group_id).toBeNull();
      expect(billAfter?.data.items.length).toBe(1);
      expect(billAfter?.data.items[0].name).toBe('Seafood');
    });

    it('enforces email uniqueness and auto-links participants when user signs up idempotently', async () => {
      // Step 1: Create a bill containing an unlinked participant with an email
      await adapter.saveBill(
        'bill_pre_registration',
        {
          name: 'Pre-Registration Dinner',
          currency: 'VND',
          people: [
            { id: 'p_david', name: 'David Unregistered', email: 'david@example.com', sponsorAmount: 0, paidAmount: 0 },
          ],
          items: [
            { id: 'i_david_1', name: 'Pizza', price: 120000, quantity: 1, assignments: { p_david: 1 } },
          ],
        },
        'user_alice'
      );

      // Participant initially has no user_id
      const rawDb = (adapter as unknown as { db: DatabaseSync }).db;
      const initialParticipant = rawDb.prepare('SELECT user_id, email FROM people WHERE id = ?').get('p_david') as { user_id: string | null; email: string };
      expect(initialParticipant.user_id).toBeNull();
      expect(initialParticipant.email).toBe('david@example.com');

      // Step 2: David signs up / logs in -> upsertUser called with matching email
      const davidUser = await adapter.upsertUser({
        email: 'David@Example.COM', // test case insensitivity
        name: 'David Verified',
        avatar_url: 'https://example.com/david.png',
      });

      expect(davidUser.id).toBeDefined();
      expect(davidUser.email).toBe('david@example.com');

      // Step 3: Verify the participant David on the previous bill was atomically auto-linked to davidUser.id
      const linkedParticipant = rawDb.prepare('SELECT user_id, email FROM people WHERE id = ?').get('p_david') as { user_id: string | null; email: string };
      expect(linkedParticipant.user_id).toBe(davidUser.id);

      // Step 4: Verify David can now list this bill as a participant
      const davidBills = await adapter.listBills(davidUser.id);
      expect(davidBills.some(b => b.id === 'bill_pre_registration')).toBe(true);

      // Step 5: Verify idempotency - upserting David again does not create a duplicate user
      const davidUpdated = await adapter.upsertUser({
        email: 'david@example.com',
        name: 'David Renovated',
      });
      expect(davidUpdated.id).toBe(davidUser.id);
      expect(davidUpdated.name).toBe('David Renovated');

      const allDavids = rawDb.prepare('SELECT COUNT(*) as count FROM users WHERE LOWER(email) = LOWER(?)').get('david@example.com') as { count: number };
      expect(allDavids.count).toBe(1);
    });
  });

  describe('Isolation & Concurrency Invariants', () => {
    it('handles rapid sequential updates to the same bill consistently without data corruption', async () => {
      await adapter.saveBill(
        'bill_seq_stress',
        {
          name: 'Iteration 0',
          currency: 'VND',
          people: [{ id: 'p1', name: 'Alice', userId: 'user_alice' }],
          items: [{ id: 'i1', name: 'Base Item', price: 10000, quantity: 1, assignments: {} }],
        },
        'user_alice'
      );

      // 10 sequential rapid updates
      for (let i = 1; i <= 10; i++) {
        await adapter.saveBill(
          'bill_seq_stress',
          {
            name: `Iteration ${i}`,
            currency: 'VND',
            people: [
              { id: 'p1', name: 'Alice', userId: 'user_alice' },
              { id: `p_extra_${i}`, name: `Guest ${i}`, sponsorAmount: i * 1000 },
            ],
            items: [
              { id: 'i1', name: 'Base Item', price: 10000 + i * 5000, quantity: i, assignments: { p1: 1 } },
            ],
          },
          'user_alice'
        );
      }

      const finalBill = await adapter.getBill('bill_seq_stress', 'user_alice');
      expect(finalBill?.data.name).toBe('Iteration 10');
      expect(finalBill?.data.people.length).toBe(2);
      expect(finalBill?.data.items[0].quantity).toBe(10);
      expect(finalBill?.data.items[0].price).toBe(60000); // 10000 + 10*5000
    });
  });

  describe('Durability (Physical Disk File Persistence)', () => {
    const tempDbPath = `/tmp/test_durability_${Date.now()}.sqlite`;

    afterEach(() => {
      if (existsSync(tempDbPath)) {
        try {
          unlinkSync(tempDbPath);
        } catch {
          // ignore cleanup errors
        }
      }
    });

    it('persists complete bill, group, participants, and items across connection restarts to disk', async () => {
      // Step 1: Open file-backed SQLite adapter and populate data
      const diskAdapter1 = new SqliteAdapter(tempDbPath);
      await diskAdapter1.init();

      await diskAdapter1.upsertUser({ id: 'user_disk_alice', email: 'alice_disk@example.com', name: 'Alice Disk' });
      const diskGroup = await diskAdapter1.createGroup('Durable Group Trip', 'user_disk_alice', 'Durability test', 'VND');

      await diskAdapter1.saveBill(
        'bill_durable_1',
        {
          name: 'Durable Seafood Feast',
          location: 'Vung Tau Harbor',
          currency: 'VND',
          groupId: diskGroup.id,
          people: [
            { id: 'p_d1', name: 'Alice Disk', userId: 'user_disk_alice', sponsorAmount: 200000, paidAmount: 1000000 },
            { id: 'p_d2', name: 'Bob Guest', sponsorAmount: 0, paidAmount: 0 },
          ],
          items: [
            { id: 'i_d1', name: 'Grilled Lobster', price: 400000, quantity: 2, assignments: { p_d1: 1, p_d2: 1 } },
            { id: 'i_d2', name: 'Coconut Drink', price: 25000, quantity: 4, assignments: { p_d1: 2, p_d2: 2 } },
          ],
          charges: [
            { id: 'c_d1', name: 'VAT 10%', type: 'percent', amount: 10 },
            { id: 'c_d2', name: 'Service Charge', type: 'fixed', amount: 50000 },
          ],
        },
        'user_disk_alice'
      );

      // Verify group total before closing
      const groupBefore = await diskAdapter1.getGroup(diskGroup.id, 'user_disk_alice');
      // Subtotal: (400,000 * 2) + (25,000 * 4) = 800,000 + 100,000 = 900,000
      // 10% VAT: 90,000
      // Fixed charge: 50,000
      // Total: 900,000 + 90,000 + 50,000 = 1,040,000
      expect(groupBefore?.total_amount).toBe(1040000);

      // Step 2: Close adapter connection to simulate process shutdown
      await diskAdapter1.close();

      // Step 3: Re-open brand new connection to the same file
      const diskAdapter2 = new SqliteAdapter(tempDbPath);
      await diskAdapter2.init();

      // Step 4: Verify everything was preserved durably
      const billRestored = await diskAdapter2.getBill('bill_durable_1', 'user_disk_alice');
      expect(billRestored).not.toBeNull();
      expect(billRestored?.data.name).toBe('Durable Seafood Feast');
      expect(billRestored?.data.location).toBe('Vung Tau Harbor');
      expect(billRestored?.group_id).toBe(diskGroup.id);
      expect(billRestored?.data.people.length).toBe(2);
      expect(billRestored?.data.people[0].sponsorAmount).toBe(200000);
      expect(billRestored?.data.people[0].paidAmount).toBe(1000000);
      expect(billRestored?.data.items.length).toBe(2);
      expect(billRestored?.data.items[0].assignments['p_d1']).toBe(1);
      expect(billRestored?.data.globalCharges.length).toBe(2);

      const groupRestored = await diskAdapter2.getGroup(diskGroup.id, 'user_disk_alice');
      expect(groupRestored).not.toBeNull();
      expect(groupRestored?.name).toBe('Durable Group Trip');
      expect(groupRestored?.total_amount).toBe(1040000);
      expect(groupRestored?.bills.length).toBe(1);

      await diskAdapter2.close();
    });
  });
});
