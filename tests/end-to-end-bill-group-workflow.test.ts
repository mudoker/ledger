import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { setDbInstance, resetDbInstance } from '../db';
import { setTestSessionUser } from '../src/lib/auth';
import { POST as groupsPost } from '../src/app/api/groups/route';
import { GET as groupIdGet, PUT as groupIdPut, DELETE as groupIdDelete } from '../src/app/api/groups/[id]/route';
import { POST as groupTransferPost } from '../src/app/api/groups/[id]/transfer/route';
import { POST as billsPost } from '../src/app/api/bills/route';
import { GET as billIdGet, DELETE as billIdDelete } from '../src/app/api/bills/[id]/route';
import { POST as billTransferPost } from '../src/app/api/bills/[id]/transfer/route';
import { calculateGroupSettlement } from '../src/lib/group-settlement';
import type { User } from '../db/types';

describe('End-to-End Bill & Group Multi-User Workflow Integration Suite', () => {
  let adapter: SqliteAdapter;

  const userAlice: User = {
    id: 'user_alice',
    email: 'alice@adventure.com',
    name: 'Alice Explorer',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const userBob: User = {
    id: 'user_bob',
    email: 'bob@adventure.com',
    name: 'Bob Builder',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const userCharlie: User = {
    id: 'user_charlie',
    email: 'charlie@adventure.com',
    name: 'Charlie Chef',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const userDavid: User = {
    id: 'user_david',
    email: 'david@adventure.com',
    name: 'David Driver',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();
    setDbInstance(adapter);

    await adapter.upsertUser(userAlice);
    await adapter.upsertUser(userBob);
    await adapter.upsertUser(userCharlie);
    await adapter.upsertUser(userDavid);

    setTestSessionUser(null);
  });

  afterEach(async () => {
    setTestSessionUser(null);
    if (adapter.close) {
      await adapter.close();
    }
    resetDbInstance();
  });

  it('executes a complete multi-bill trip lifecycle: group creation, bills linking, settlement calculation, ownership transfer, and safe deletion', async () => {
    // -------------------------------------------------------------
    // STEP 1: Alice creates a group "Da Nang Vacation 2026"
    // -------------------------------------------------------------
    setTestSessionUser(userAlice);

    const createGroupReq = new Request('http://localhost/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Da Nang Vacation 2026',
        description: 'Summer beach trip with friends',
        currency: 'USD',
      }),
    });

    const createGroupRes = await groupsPost(createGroupReq);
    expect(createGroupRes.status).toBe(201);
    const createdGroup = await createGroupRes.json();
    const groupId = createdGroup.id;
    expect(groupId).toBeDefined();
    expect(createdGroup.owner_id).toBe('user_alice');

    // -------------------------------------------------------------
    // STEP 2: Alice adds Bob, Charlie, David as group participants
    // -------------------------------------------------------------
    const updateGroupReq = new Request(`http://localhost/api/groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants: [
          { name: 'Alice Explorer', email: 'alice@adventure.com' },
          { name: 'Bob Builder', email: 'bob@adventure.com' },
          { name: 'Charlie Chef', email: 'charlie@adventure.com' },
          { name: 'David Driver', email: 'david@adventure.com' },
        ],
      }),
    });

    const updateGroupRes = await groupIdPut(updateGroupReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(updateGroupRes.status).toBe(200);

    // -------------------------------------------------------------
    // STEP 3: Alice creates Bill 1 (Hotel, $400 USD paid by Alice, split by all 4)
    // -------------------------------------------------------------
    const bill1Id = 'bill_hotel_400';
    const createBill1Req = new Request('http://localhost/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bill1Id,
        isShared: true,
        visibility: 'restricted',
        data: {
          name: 'Beachfront Villa',
          currency: 'USD',
          groupId: groupId,
          hostId: 'p1_alice',
          people: [
            { id: 'p1_alice', name: 'Alice', userId: 'user_alice', paidAmount: 400, sponsorAmount: 0 },
            { id: 'p1_bob', name: 'Bob', userId: 'user_bob', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p1_charlie', name: 'Charlie', userId: 'user_charlie', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p1_david', name: 'David', userId: 'user_david', paidAmount: 0, sponsorAmount: 0 },
          ],
          items: [
            {
              id: 'item_villa_stay',
              name: 'Villa 2 Nights',
              price: 400,
              quantity: 1,
              assignments: { p1_alice: 1, p1_bob: 1, p1_charlie: 1, p1_david: 1 },
            },
          ],
          globalCharges: [],
        },
      }),
    });

    const bill1Res = await billsPost(createBill1Req);
    expect(bill1Res.status).toBe(200);

    // -------------------------------------------------------------
    // STEP 4: Bob creates Bill 2 (Seafood Dinner, $240 paid by Bob, Charlie sponsors $80)
    // -------------------------------------------------------------
    setTestSessionUser(userBob);

    const bill2Id = 'bill_seafood_240';
    const createBill2Req = new Request('http://localhost/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bill2Id,
        isShared: true,
        visibility: 'restricted',
        data: {
          name: 'Seafood BBQ Dinner',
          currency: 'USD',
          groupId: groupId,
          hostId: 'p2_bob',
          people: [
            { id: 'p2_alice', name: 'Alice', userId: 'user_alice', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p2_bob', name: 'Bob', userId: 'user_bob', paidAmount: 240, sponsorAmount: 0 },
            { id: 'p2_charlie', name: 'Charlie', userId: 'user_charlie', paidAmount: 0, sponsorAmount: 80 },
            { id: 'p2_david', name: 'David', userId: 'user_david', paidAmount: 0, sponsorAmount: 0 },
          ],
          items: [
            {
              id: 'item_lobster',
              name: 'Lobster & Crab Platter',
              price: 240,
              quantity: 1,
              assignments: { p2_alice: 1, p2_bob: 1, p2_charlie: 1, p2_david: 1 },
            },
          ],
          globalCharges: [],
        },
      }),
    });

    const bill2Res = await billsPost(createBill2Req);
    expect(bill2Res.status).toBe(200);

    // -------------------------------------------------------------
    // STEP 5: Charlie creates Bill 3 (Rental Car, $120 paid by Charlie; Alice, Bob, Charlie split)
    // -------------------------------------------------------------
    setTestSessionUser(userCharlie);

    const bill3Id = 'bill_rental_120';
    const createBill3Req = new Request('http://localhost/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bill3Id,
        isShared: true,
        visibility: 'restricted',
        data: {
          name: 'SUV Car Rental',
          currency: 'USD',
          groupId: groupId,
          hostId: 'p3_charlie',
          people: [
            { id: 'p3_alice', name: 'Alice', userId: 'user_alice', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p3_bob', name: 'Bob', userId: 'user_bob', paidAmount: 0, sponsorAmount: 0 },
            { id: 'p3_charlie', name: 'Charlie', userId: 'user_charlie', paidAmount: 120, sponsorAmount: 0 },
          ],
          items: [
            {
              id: 'item_suv',
              name: 'SUV 3 Days',
              price: 120,
              quantity: 1,
              assignments: { p3_alice: 1, p3_bob: 1, p3_charlie: 1 },
            },
          ],
          globalCharges: [],
        },
      }),
    });

    const bill3Res = await billsPost(createBill3Req);
    expect(bill3Res.status).toBe(200);

    // -------------------------------------------------------------
    // STEP 6: Fetch Group Details and verify all 3 nested bills
    // -------------------------------------------------------------
    const getGroupReq = new Request(`http://localhost/api/groups/${groupId}`);
    const getGroupRes = await groupIdGet(getGroupReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(getGroupRes.status).toBe(200);
    const groupDetail = await getGroupRes.json();

    expect(groupDetail.bills.length).toBe(3);
    const totalAmount = groupDetail.bills.reduce((s: number, b: any) => s + b.totalAmount, 0);
    expect(totalAmount).toBe(400 + 240 + 120); // 760

    // -------------------------------------------------------------
    // STEP 7: Run Group Settlement Aggregation & Invariant Checks
    // -------------------------------------------------------------
    const settlement = calculateGroupSettlement(groupDetail);

    expect(settlement.totalBills).toBe(3);
    expect(settlement.totalExpenses).toBe(760);
    expect(settlement.uniqueParticipantsCount).toBe(4);

    // Conservation of money: Sum of net balances across all participants must equal zero within integer rounding (<= 1)
    const sumNetBalances = settlement.participants.reduce((sum, p) => sum + p.netBalance, 0);
    expect(Math.abs(sumNetBalances)).toBeLessThanOrEqual(1);
    expect(settlement.isBalanced).toBe(true);

    // Verify transfers settle group debt
    expect(settlement.transfers.length).toBeGreaterThan(0);
    expect(settlement.transfers.length).toBeLessThanOrEqual(6); // At most N*(N-1)/2 pairwise transfers

    // Check that executing transfers perfectly balances everyone's net balance
    const simulatedBalances: Record<string, number> = {};
    settlement.participants.forEach(p => {
      simulatedBalances[p.key] = p.netBalance;
    });

    for (const t of settlement.transfers) {
      simulatedBalances[t.fromKey] += t.amount;
      simulatedBalances[t.toKey] -= t.amount;
    }

    for (const bal of Object.values(simulatedBalances)) {
      expect(Math.abs(bal)).toBeLessThanOrEqual(1.0); // Within integer rounding precision (<= 1)
    }

    // -------------------------------------------------------------
    // STEP 8: Transfer Bill 1 ownership from Alice to Bob & Verify RBAC
    // -------------------------------------------------------------
    setTestSessionUser(userAlice);

    const billTransferReq = new Request(`http://localhost/api/bills/${bill1Id}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_owner_id: 'user_bob' }),
    });

    const billTransferRes = await billTransferPost(billTransferReq, {
      params: Promise.resolve({ id: bill1Id }),
    });
    expect(billTransferRes.status).toBe(200);

    // Alice tries to transfer Bill 1 again -> Should be 403 Forbidden because Alice is no longer the owner!
    const unauthorizedTransferReq = new Request(`http://localhost/api/bills/${bill1Id}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_owner_id: 'user_charlie' }),
    });

    const unauthorizedTransferRes = await billTransferPost(unauthorizedTransferReq, {
      params: Promise.resolve({ id: bill1Id }),
    });
    expect(unauthorizedTransferRes.status).toBe(403);

    // Alice tries to edit Bill 1 -> Should be 403 Forbidden!
    const aliceEditReq = new Request('http://localhost/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bill1Id,
        data: { name: 'Attempted Hijack Name' },
      }),
    });
    const aliceEditRes = await billsPost(aliceEditReq);
    expect(aliceEditRes.status).toBe(403);

    // Bob edits Bill 1 -> Succeeds!
    setTestSessionUser(userBob);
    const bobEditReq = new Request('http://localhost/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bill1Id,
        data: { name: 'Luxury Beachfront Villa' },
      }),
    });
    const bobEditRes = await billsPost(bobEditReq);
    expect(bobEditRes.status).toBe(200);

    // -------------------------------------------------------------
    // STEP 9: Transfer Group ownership from Alice to Charlie & Verify RBAC
    // -------------------------------------------------------------
    setTestSessionUser(userAlice);

    const groupTransferReq = new Request(`http://localhost/api/groups/${groupId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_owner_id: 'user_charlie' }),
    });

    const groupTransferRes = await groupTransferPost(groupTransferReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(groupTransferRes.status).toBe(200);

    // Alice tries to delete the group -> 403 Forbidden!
    const aliceDeleteGroupReq = new Request(`http://localhost/api/groups/${groupId}`, {
      method: 'DELETE',
    });
    const aliceDeleteGroupRes = await groupIdDelete(aliceDeleteGroupReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(aliceDeleteGroupRes.status).toBe(403);

    // -------------------------------------------------------------
    // STEP 10: Delete Bill 2 and verify group dynamically reflects 2 bills
    // -------------------------------------------------------------
    setTestSessionUser(userBob);
    const deleteBill2Req = new Request(`http://localhost/api/bills/${bill2Id}`, {
      method: 'DELETE',
    });
    const deleteBill2Res = await billIdDelete(deleteBill2Req, {
      params: Promise.resolve({ id: bill2Id }),
    });
    expect(deleteBill2Res.status).toBe(200);

    // Group should now have 2 bills
    const refreshedGroupRes = await groupIdGet(getGroupReq, {
      params: Promise.resolve({ id: groupId }),
    });
    const refreshedGroup = await refreshedGroupRes.json();
    expect(refreshedGroup.bills.length).toBe(2);
    expect(refreshedGroup.bills.find((b: any) => b.id === bill2Id)).toBeUndefined();

    // -------------------------------------------------------------
    // STEP 11: Charlie deletes the group. Verify group is removed but bills survive!
    // -------------------------------------------------------------
    setTestSessionUser(userCharlie);
    const charlieDeleteGroupReq = new Request(`http://localhost/api/groups/${groupId}`, {
      method: 'DELETE',
    });
    const charlieDeleteGroupRes = await groupIdDelete(charlieDeleteGroupReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(charlieDeleteGroupRes.status).toBe(200);

    // Group retrieval now returns 404
    const postDeleteGroupRes = await groupIdGet(getGroupReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(postDeleteGroupRes.status).toBe(404);

    // Bill 1 (owned by Bob) and Bill 3 (owned by Charlie) still exist with group_id = null!
    setTestSessionUser(userBob);
    const getBill1Req = new Request(`http://localhost/api/bills/${bill1Id}`);
    const getBill1Res = await billIdGet(getBill1Req, {
      params: Promise.resolve({ id: bill1Id }),
    });
    expect(getBill1Res.status).toBe(200);
    const bill1Data = await getBill1Res.json();
    expect(bill1Data.group_id).toBeNull();
    expect(bill1Data.data.name).toBe('Luxury Beachfront Villa');
  });
});
