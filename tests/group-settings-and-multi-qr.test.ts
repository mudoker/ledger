import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { useGroupStore } from '../src/store/useGroupStore';
import type { GroupPaymentQr } from '../db/types';

describe('Group Settings and Multi-Payer QR Payment Mechanism', () => {
  let db: SqliteAdapter;

  beforeEach(async () => {
    // In-memory or isolated SQLite for unit testing
    db = new SqliteAdapter(':memory:');
    await db.init();
    useGroupStore.setState({ groups: [], currentGroup: null, isLoading: false, error: null });
  });

  afterEach(async () => {
    await db.close();
  });

  it('1. Correctly creates and persists group settings in SQLite database', async () => {
    const owner = await db.upsertUser({ email: 'owner@example.com', name: 'Alice Owner' });
    const group = await db.createGroup('Trip to Da Nang', owner.id, 'Summer vacation 2026', 'VND', 'public');

    expect(group).toBeDefined();
    expect(group.name).toBe('Trip to Da Nang');
    expect(group.description).toBe('Summer vacation 2026');
    expect(group.currency).toBe('VND');
    expect(group.visibility).toBe('public');
    expect(group.payment_qrs).toEqual([]);

    // Owner updates group settings
    await db.updateGroup(group.id, {
      name: 'Trip to Da Nang & Hoi An',
      description: 'Extended vacation notes',
      currency: 'USD',
      visibility: 'restricted',
    }, owner.id);

    const updated = await db.getGroup(group.id, owner.id);
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Trip to Da Nang & Hoi An');
    expect(updated?.description).toBe('Extended vacation notes');
    expect(updated?.currency).toBe('USD');
    expect(updated?.visibility).toBe('restricted');
  });

  it('2. Prevents non-owner from updating core group settings but allows owner', async () => {
    const owner = await db.upsertUser({ email: 'owner@test.com', name: 'Owner' });
    const stranger = await db.upsertUser({ email: 'stranger@test.com', name: 'Stranger' });
    const group = await db.createGroup('Dinner Club', owner.id);

    // Stranger attempting to update core settings throws forbidden
    await expect(
      db.updateGroup(group.id, { name: 'Hacked Dinner Club' }, stranger.id)
    ).rejects.toThrow(/Forbidden/i);

    // Group name remains intact
    const afterAttempt = await db.getGroup(group.id, owner.id);
    expect(afterAttempt?.name).toBe('Dinner Club');
  });

  it('3. Supports multiple payment QR code uploads for different payers and persists across queries', async () => {
    const owner = await db.upsertUser({ email: 'owner@test.com', name: 'Owner' });
    const group = await db.createGroup('Team Offsite', owner.id);

    const qr1: GroupPaymentQr = {
      id: 'qr-1',
      payerName: 'Sarah',
      payerId: 'p-1',
      qrUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      note: 'Vietcombank: 1018273645',
      createdAt: new Date().toISOString(),
    };

    const qr2: GroupPaymentQr = {
      id: 'qr-2',
      payerName: 'David',
      payerId: 'p-2',
      qrUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      note: 'Momo: 0901234567',
      createdAt: new Date().toISOString(),
    };

    // Save multiple QR codes
    await db.updateGroup(group.id, {
      payment_qrs: [qr1, qr2],
    }, owner.id);

    // Fetch as another user or viewer (visible for others as well, not only local!)
    const viewer = await db.upsertUser({ email: 'viewer@test.com', name: 'Viewer' });
    const fetched = await db.getGroup(group.id, viewer.id);

    expect(fetched).not.toBeNull();
    expect(fetched?.payment_qrs).toHaveLength(2);
    expect(fetched?.payment_qrs?.[0].payerName).toBe('Sarah');
    expect(fetched?.payment_qrs?.[0].note).toBe('Vietcombank: 1018273645');
    expect(fetched?.payment_qrs?.[0].qrUrl).toContain('data:image/png;base64');
    expect(fetched?.payment_qrs?.[1].payerName).toBe('David');
    expect(fetched?.payment_qrs?.[1].note).toBe('Momo: 0901234567');

    // List groups also includes payment_qrs
    const summaries = await db.listGroups(owner.id);
    const summary = summaries.find(s => s.id === group.id);
    expect(summary).toBeDefined();
    expect(summary?.payment_qrs).toHaveLength(2);
  });

  it('4. Allows removing a payment QR code while preserving other payers QRs', async () => {
    const owner = await db.upsertUser({ email: 'owner@test.com', name: 'Owner' });
    const group = await db.createGroup('Family Gathering', owner.id);

    const qr1: GroupPaymentQr = {
      id: 'qr-alice',
      payerName: 'Alice',
      qrUrl: 'data:image/png;base64,sample1',
      note: 'Bank A',
    };
    const qr2: GroupPaymentQr = {
      id: 'qr-bob',
      payerName: 'Bob',
      qrUrl: 'data:image/png;base64,sample2',
      note: 'Bank B',
    };

    await db.updateGroup(group.id, { payment_qrs: [qr1, qr2] }, owner.id);
    let current = await db.getGroup(group.id, owner.id);
    expect(current?.payment_qrs).toHaveLength(2);

    // Remove Alice's QR code, keep Bob's QR
    await db.updateGroup(group.id, { payment_qrs: [qr2] }, owner.id);
    current = await db.getGroup(group.id, owner.id);
    expect(current?.payment_qrs).toHaveLength(1);
    expect(current?.payment_qrs?.[0].id).toBe('qr-bob');
    expect(current?.payment_qrs?.[0].payerName).toBe('Bob');
  });

  it('5. Allows non-owner participants or viewers to add their payment QR when group is accessible', async () => {
    const owner = await db.upsertUser({ email: 'owner@test.com', name: 'Owner' });
    const member = await db.upsertUser({ email: 'member@test.com', name: 'Member' });
    const group = await db.createGroup('Roommates', owner.id, null, 'VND', 'public');

    const memberQr: GroupPaymentQr = {
      id: 'qr-member',
      payerName: 'Member Payer',
      qrUrl: 'data:image/png;base64,memberdata',
      note: 'Revolut tag',
    };

    // Member updates payment_qrs without changing core settings
    await db.updateGroup(group.id, { payment_qrs: [memberQr] }, member.id);

    const refreshed = await db.getGroup(group.id, owner.id);
    expect(refreshed?.payment_qrs).toHaveLength(1);
    expect(refreshed?.payment_qrs?.[0].payerName).toBe('Member Payer');
  });

  it('6. In local storage mode, QR code updates and group settings strictly stay local without cloud sync', async () => {
    const { useAppSettingsStore } = await import('../src/store/useAppSettingsStore');
    const { useGroupStore } = await import('../src/store/useGroupStore');
    const { getLocalDb } = await import('../src/lib/local-db');

    useAppSettingsStore.setState({ storageMode: 'local' });
    const localDb = getLocalDb();

    let networkCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      networkCallCount++;
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    try {
      const localGroupId = 'local_group_privacy_test';
      await localDb.saveGroup({
        id: localGroupId,
        name: 'Local Private Group',
        description: 'Local trip',
        currency: 'VND',
        visibility: 'restricted',
        ownerId: 'local',
        participants: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      useGroupStore.setState({
        currentGroup: {
          id: localGroupId,
          name: 'Local Private Group',
          description: 'Local trip',
          owner_id: 'local',
          is_owner: true,
          currency: 'VND',
          visibility: 'restricted',
          total_amount: 0,
          total_bills: 0,
          total_items: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          bills: [],
          participants: [],
          payment_qrs: [],
        },
        groups: [],
      });

      // Add a QR code in local mode
      await useGroupStore.getState().addPaymentQr(localGroupId, {
        payerName: 'Private Payer',
        qrUrl: 'data:image/png;base64,privatelocalqr',
        note: 'Local note',
      });

      // Ensure 0 network requests occurred
      expect(networkCallCount).toBe(0);

      // Verify the QR was stored in localDb
      const savedLocal = await localDb.getGroup(localGroupId);
      expect(savedLocal?.payment_qrs).toHaveLength(1);
      expect(savedLocal?.payment_qrs?.[0].payerName).toBe('Private Payer');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
