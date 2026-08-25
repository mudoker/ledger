import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { useGroupStore } from '../src/store/useGroupStore';
import { useBillStore } from '../src/store/useBillStore';
import { getLocalDb } from '../src/lib/local-db';
import type { LocalBillRecord } from '../src/lib/local-db/types';

function mockLocalBill(overrides: Partial<LocalBillRecord> & { id: string }): LocalBillRecord {
  return {
    id: overrides.id,
    name: overrides.name || 'Test Bill',
    location: overrides.location ?? null,
    currency: overrides.currency || 'VND',
    hostId: overrides.hostId ?? null,
    qrCode: overrides.qrCode ?? null,
    groupId: overrides.groupId ?? null,
    groupName: overrides.groupName ?? null,
    ownerId: overrides.ownerId ?? null,
    people: overrides.people || [],
    items: overrides.items || [],
    globalCharges: overrides.globalCharges || [],
    sharingStatus: overrides.sharingStatus || 'local',
    visibility: overrides.visibility || 'local',
    shareToken: overrides.shareToken ?? null,
    lastSyncedAt: overrides.lastSyncedAt ?? null,
    syncError: overrides.syncError ?? null,
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  };
}

describe('Group Participants, Inheritance & Deletion Suite', () => {
  beforeEach(() => {
    useGroupStore.setState({
      groups: [],
      currentGroup: null,
      isLoading: false,
      error: null,
    });
    useBillStore.setState({
      people: [{ id: 'p1', name: 'Alice', paidAmount: 0, sponsorAmount: 0 }],
      items: [],
      globalCharges: [],
      groupId: null,
      currentBillId: 'bill_test_1',
      billHistory: [],
    });
  });

  describe('Group Participants Management', () => {
    it('adds a new participant to the current group and dispatches update', async () => {
      let updatePayload: any = null;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          updatePayload = JSON.parse(init.body as string);
          return new Response(JSON.stringify({
            id: 'grp_1',
            name: 'Trip Group',
            participants: updatePayload.participants,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      useGroupStore.setState({
        currentGroup: {
          id: 'grp_1',
          name: 'Trip Group',
          description: null,
          owner_id: 'user_1',
          is_owner: true,
          currency: 'VND',
          total_amount: 0,
          total_bills: 0,
          total_items: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          bills: [],
          participants: [{ id: 'gp_1', name: 'Alice' }],
        },
      });

      await useGroupStore.getState().addGroupParticipant('grp_1', 'Bob', 'bob@example.com');

      const current = useGroupStore.getState().currentGroup;
      expect(current?.participants?.length).toBe(2);
      expect(current?.participants?.[1]?.name).toBe('Bob');
      expect(current?.participants?.[1]?.email).toBe('bob@example.com');
      expect(updatePayload).not.toBeNull();
      expect(updatePayload.participants.length).toBe(2);
    });

    it('removes a participant from the current group', async () => {
      let updatePayload: any = null;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          updatePayload = JSON.parse(init.body as string);
          return new Response(JSON.stringify({
            id: 'grp_1',
            name: 'Trip Group',
            participants: updatePayload.participants,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      useGroupStore.setState({
        currentGroup: {
          id: 'grp_1',
          name: 'Trip Group',
          description: null,
          owner_id: 'user_1',
          is_owner: true,
          currency: 'VND',
          total_amount: 0,
          total_bills: 0,
          total_items: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          bills: [],
          participants: [
            { id: 'gp_1', name: 'Alice' },
            { id: 'gp_2', name: 'Bob' },
          ],
        },
      });

      await useGroupStore.getState().removeGroupParticipant('grp_1', 'gp_2');

      const current = useGroupStore.getState().currentGroup;
      expect(current?.participants?.length).toBe(1);
      expect(current?.participants?.[0]?.name).toBe('Alice');
      expect(updatePayload.participants.length).toBe(1);
    });
  });

  describe('Participant Inheritance on Bill Group Linkage', () => {
    it('inherits group participants into bill people when linked to a group', async () => {
      const mockVacationGroup = {
        id: 'grp_vacation',
        name: 'Beach Vacation',
        description: null,
        owner_id: 'user_1',
        is_owner: true,
        currency: 'VND',
        total_amount: 0,
        total_bills: 0,
        total_items: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        bills: [],
        participants: [
          { id: 'p_charlie', name: 'Charlie', email: 'charlie@test.com' },
          { id: 'p_dana', name: 'Dana' },
        ],
      };

      useGroupStore.setState({
        groups: [{
          ...mockVacationGroup,
          participants: [
            { id: 'p_charlie', name: 'Charlie', email: 'charlie@test.com' },
            { id: 'p_dana', name: 'Dana' },
          ],
        }],
        currentGroup: mockVacationGroup,
      });

      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/api/groups/grp_vacation')) {
          return new Response(JSON.stringify(mockVacationGroup), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      useBillStore.setState({
        people: [{ id: 'p_alice', name: 'Alice', paidAmount: 0, sponsorAmount: 0 }],
        groupId: null,
      });

      await useBillStore.getState().setGroupId('grp_vacation');

      const updatedPeople = useBillStore.getState().people;
      expect(useBillStore.getState().groupId).toBe('grp_vacation');
      expect(updatedPeople.length).toBe(3);
      expect(updatedPeople.some(p => p.name === 'Alice')).toBe(true);
      expect(updatedPeople.some(p => p.name === 'Charlie')).toBe(true);
      expect(updatedPeople.some(p => p.name === 'Dana')).toBe(true);
    });

    it('unlinking bill from group sets groupId to null without throwing', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as any;

      useBillStore.setState({
        groupId: 'grp_vacation',
        people: [{ id: 'p_alice', name: 'Alice', paidAmount: 0, sponsorAmount: 0 }],
      });

      await useBillStore.getState().setGroupId(null);

      expect(useBillStore.getState().groupId).toBeNull();
    });
  });

  describe('Local Bill Group Merging', () => {
    it('merges local IndexedDB bills into server group bills so local bills remain visible', async () => {
      const serverGroup = {
        id: 'grp_hybrid',
        name: 'Hybrid Group',
        description: null,
        owner_id: 'user_1',
        is_owner: true,
        currency: 'VND',
        total_amount: 100000,
        total_bills: 1,
        total_items: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        bills: [
          {
            id: 'server_bill_1',
            name: 'Cloud Dinner',
            location: 'Downtown',
            currency: 'VND',
            totalAmount: 100000,
            host_id: null,
            host_name: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: [],
            people: [],
            globalCharges: [],
          },
        ],
        participants: [],
      };

      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/api/groups/grp_hybrid')) {
          return new Response(JSON.stringify(serverGroup), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      // Seed local DB with a local bill assigned to this group
      await getLocalDb().saveBill(mockLocalBill({
        id: 'local_bill_grp_1',
        name: 'Offline Coffee',
        groupId: 'grp_hybrid',
        visibility: 'local',
        currency: 'VND',
        people: [{ id: 'p_local', name: 'Me', paidAmount: 25000, sponsorAmount: 0 }],
        items: [{ id: 'i1', name: 'Latte', price: 25000, quantity: 1, assignments: {} }],
      }));

      await useGroupStore.getState().fetchGroup('grp_hybrid');

      const group = useGroupStore.getState().currentGroup;
      expect(group).not.toBeNull();
      expect(group?.bills.length).toBe(2);
      expect(group?.bills.some(b => b.id === 'server_bill_1')).toBe(true);
      expect(group?.bills.some(b => b.id === 'local_bill_grp_1')).toBe(true);
      expect(group?.total_bills).toBe(2);

      // Clean up local DB
      await getLocalDb().deleteBill('local_bill_grp_1');
    });
  });

  describe('Bill Deletion from Store and Local DB', () => {
    it('deletes bill from local DB, history, and calls server endpoint', async () => {
      let deletedEndpoint = '';
      globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          deletedEndpoint = url;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      await getLocalDb().saveBill(mockLocalBill({
        id: 'bill_to_delete',
        name: 'Obsolete Bill',
        currency: 'VND',
      }));

      useBillStore.setState({
        currentBillId: 'bill_to_delete',
        billHistory: [
          { id: 'bill_to_delete', name: 'Obsolete Bill', totalAmount: 50000, created_at: '', updated_at: '' },
          { id: 'bill_keep', name: 'Active Bill', totalAmount: 70000, created_at: '', updated_at: '' },
        ],
      });

      await useBillStore.getState().deleteBill('bill_to_delete');

      const remainingHistory = useBillStore.getState().billHistory;
      expect(remainingHistory.some(b => b.id === 'bill_to_delete')).toBe(false);
      expect(deletedEndpoint).toContain('/api/bills/bill_to_delete');

      const inDb = await getLocalDb().getBill('bill_to_delete');
      expect(inDb).toBeNull();
    });
  });
});
