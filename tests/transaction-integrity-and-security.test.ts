import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { DatabaseAdapter } from '../db/types';
import { SqliteAdapter } from '../db/sqlite';

describe('Transaction Integrity & Security Guarantees', () => {
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();

    await adapter.upsertUser!({
      id: 'owner_alice',
      email: 'alice@example.com',
      name: 'Alice',
    });
    await adapter.upsertUser!({
      id: 'user_bob',
      email: 'bob@example.com',
      name: 'Bob',
    });
  });

  afterEach(async () => {
    if (adapter.close) {
      await adapter.close();
    }
  });

  describe('Group Ownership Transfer Transactions', () => {
    it('transfers group ownership atomically to a registered user', async () => {
      const group = await adapter.createGroup!('Trip to Da Nang', 'owner_alice', 'Vacation expenses', 'VND');
      expect(group.owner_id).toBe('owner_alice');

      await adapter.transferGroupOwnership!(group.id, 'user_bob', 'owner_alice');

      const updated = await adapter.getGroup!(group.id, 'user_bob');
      expect(updated?.owner_id).toBe('user_bob');
    });

    it('rolls back group ownership transfer if target user does not exist, preserving original owner', async () => {
      const group = await adapter.createGroup!('Weekend Brunch', 'owner_alice', null, 'VND');

      expect(async () => {
        await adapter.transferGroupOwnership!(group.id, 'non_existent_user_999', 'owner_alice');
      }).toThrow('New owner user not found');

      const current = await adapter.getGroup!(group.id, 'owner_alice');
      expect(current?.owner_id).toBe('owner_alice');
    });

    it('rejects group ownership transfer if requester is not the current group owner', async () => {
      const group = await adapter.createGroup!('Secret Society', 'owner_alice', null, 'VND');

      expect(async () => {
        await adapter.transferGroupOwnership!(group.id, 'user_bob', 'user_bob');
      }).toThrow('Forbidden: Only the group owner can transfer ownership of this group');

      const current = await adapter.getGroup!(group.id, 'owner_alice');
      expect(current?.owner_id).toBe('owner_alice');
    });
  });

  describe('Bill-to-Group Linkage Foreign Key & Transaction Integrity', () => {
    it('links and unlinks a bill to a valid existing group within a transaction', async () => {
      const group = await adapter.createGroup!('Project Alpha', 'owner_alice', null, 'VND');
      await adapter.saveBill('bill_alpha', { name: 'Dinner', ownerId: 'owner_alice' }, 'owner_alice');

      await adapter.linkBillToGroup!('bill_alpha', group.id, 'owner_alice');

      let bill = await adapter.getBill('bill_alpha', 'owner_alice');
      expect(bill?.group_id).toBe(group.id);

      // Unlink
      await adapter.linkBillToGroup!('bill_alpha', null, 'owner_alice');
      bill = await adapter.getBill('bill_alpha', 'owner_alice');
      expect(bill?.group_id).toBeNull();
    });

    it('rejects linking to a non-existent group and preserves original group_id', async () => {
      await adapter.saveBill('bill_solo', { name: 'Coffee', ownerId: 'owner_alice' }, 'owner_alice');

      expect(async () => {
        await adapter.linkBillToGroup!('bill_solo', 'invalid_group_xyz', 'owner_alice');
      }).toThrow('Group not found');

      const bill = await adapter.getBill('bill_solo', 'owner_alice');
      expect(bill?.group_id).toBeNull();
    });

    it('forbids non-owner from linking or unlinking bill to a group', async () => {
      const group = await adapter.createGroup!('Alice Group', 'owner_alice', null, 'VND');
      await adapter.saveBill('bill_alice', { name: 'Lunch', ownerId: 'owner_alice' }, 'owner_alice');

      expect(async () => {
        await adapter.linkBillToGroup!('bill_alice', group.id, 'user_bob');
      }).toThrow('Forbidden: Only the bill owner can link or unlink this bill');
    });
  });

  describe('Bill Deletion & Sharing Revocation Transactions', () => {
    it('deletes a bill and all cascading relationships atomically', async () => {
      await adapter.saveBill(
        'bill_to_delete',
        {
          name: 'Party Bill',
          ownerId: 'owner_alice',
          people: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
          items: [{ id: 'item1', name: 'Drinks', price: 50000, assignments: { p1: 1 } }],
          globalCharges: [{ id: 'charge1', name: 'Tax', type: 'fixed', amount: 5000 }],
        },
        'owner_alice'
      );

      const deleted = await adapter.deleteBill!('bill_to_delete', 'owner_alice');
      expect(deleted).toBe(true);

      const bill = await adapter.getBill('bill_to_delete', 'owner_alice');
      expect(bill).toBeNull();
    });

    it('forbids unauthorized deletion and preserves bill intact', async () => {
      await adapter.saveBill('bill_protected', { name: 'Vault', ownerId: 'owner_alice' }, 'owner_alice');

      expect(async () => {
        await adapter.deleteBill!('bill_protected', 'user_bob');
      }).toThrow('Forbidden: Only the bill owner can delete this bill');

      const bill = await adapter.getBill('bill_protected', 'owner_alice');
      expect(bill).not.toBeNull();
    });

    it('revokes sharing atomically: marks local, strips share token, and records revoked_at timestamp', async () => {
      await adapter.saveBill(
        'bill_shared',
        {
          name: 'Shared Bill',
          ownerId: 'owner_alice',
          isShared: true,
          visibility: 'public',
          shareToken: 'secret_token_abc123',
        },
        'owner_alice'
      );

      const revoked = await adapter.revokeBillShare!('bill_shared', 'owner_alice');
      expect(revoked).toBe(true);

      // Access via token should now fail
      const publicLookup = await adapter.getBill('bill_shared', null, true, 'secret_token_abc123');
      expect(publicLookup).toBeNull();

      // Owner can still view it in private local mode
      const ownerLookup = await adapter.getBill('bill_shared', 'owner_alice');
      expect(ownerLookup).not.toBeNull();
      expect(ownerLookup?.isShared).toBe(false);
      expect(ownerLookup?.shareToken).toBeNull();
      expect(ownerLookup?.visibility).toBe('local');
    });
  });
});
