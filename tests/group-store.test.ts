import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { useGroupStore } from '../src/store/useGroupStore';
import { setLocalDb, MemoryStorageEngine } from '../src/lib/local-db';

describe('useGroupStore - Zustand Group State Management', () => {
  beforeEach(() => {
    setLocalDb(new MemoryStorageEngine());
    // Reset store to initial state before each test
    useGroupStore.setState({
      groups: [],
      currentGroup: null,
      isLoading: false,
      error: null,
    });
  });

  it('has correct initial default state', () => {
    const state = useGroupStore.getState();
    expect(state.groups).toEqual([]);
    expect(state.currentGroup).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  describe('fetchGroups', () => {
    it('successfully fetches and stores group summaries', async () => {
      const mockGroups = [
        {
          id: 'group_1',
          name: 'Weekend Trip',
          description: 'Fun weekend',
          owner_id: 'user_1',
          is_owner: true,
          currency: 'VND',
          total_amount: 1500000,
          total_bills: 3,
          total_items: 8,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify(mockGroups), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      await useGroupStore.getState().fetchGroups();

      const state = useGroupStore.getState();
      expect(state.groups.length).toBe(1);
      expect(state.groups[0].name).toBe('Weekend Trip');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error state when network fetch fails', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('Network failure');
      }) as any;

      await useGroupStore.getState().fetchGroups();

      const state = useGroupStore.getState();
      expect(state.groups).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Network failure');
    });
  });

  describe('fetchGroup', () => {
    it('fetches single group detail and sets currentGroup', async () => {
      const mockGroupDetail = {
        id: 'group_abc',
        name: 'Team Dinner',
        description: null,
        owner_id: 'user_alice',
        owner_name: 'Alice',
        is_owner: true,
        currency: 'VND',
        total_amount: 500000,
        total_bills: 1,
        total_items: 2,
        created_at: '2026-02-01',
        updated_at: '2026-02-01',
        bills: [
          {
            id: 'b1',
            name: 'Pizza Place',
            location: 'Downtown',
            currency: 'VND',
            totalAmount: 500000,
            created_at: '2026-02-01',
            updated_at: '2026-02-01',
            items: [{ id: 'i1', name: 'Margherita', price: 250000, quantity: 2, totalPrice: 500000 }],
          },
        ],
      };

      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/groups/group_abc')) {
          return new Response(JSON.stringify(mockGroupDetail), { status: 200 });
        }
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }) as any;

      const result = await useGroupStore.getState().fetchGroup('group_abc');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('group_abc');
      expect(useGroupStore.getState().currentGroup?.name).toBe('Team Dinner');
      expect(useGroupStore.getState().isLoading).toBe(false);
    });

    it('handles 404 by clearing currentGroup and setting error', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }) as any;

      const result = await useGroupStore.getState().fetchGroup('non_existent');

      expect(result).toBeNull();
      expect(useGroupStore.getState().currentGroup).toBeNull();
      expect(useGroupStore.getState().error).toBe('Group not found');
    });
  });

  describe('createGroup', () => {
    it('creates group and refetches group list', async () => {
      const createdGroup = {
        id: 'group_new',
        name: 'Kyoto Trip',
        description: 'Autumn vacation',
        owner_id: 'user_alice',
        currency: 'VND',
        total_amount: 0,
        total_bills: 0,
        total_items: 0,
        created_at: '2026-03-01',
        updated_at: '2026-03-01',
        bills: [],
      };

      let fetchCount = 0;
      globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        fetchCount++;
        const urlStr = url.toString();
        if (urlStr === '/api/groups' && init?.method === 'POST') {
          return new Response(JSON.stringify(createdGroup), { status: 201 });
        }
        if (urlStr === '/api/groups') {
          return new Response(JSON.stringify([createdGroup]), { status: 200 });
        }
        return new Response(null, { status: 400 });
      }) as any;

      const res = await useGroupStore.getState().createGroup('Kyoto Trip', 'Autumn vacation', 'VND');

      expect(res.id).toBe('group_new');
      expect(res.name).toBe('Kyoto Trip');
      expect(useGroupStore.getState().currentGroup?.id).toBe('group_new');
      expect(useGroupStore.getState().groups.length).toBe(1);
    });

    it('throws error when server returns validation error', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ error: 'Group name is required' }), { status: 400 });
      }) as any;

      expect(
        useGroupStore.getState().createGroup('', null, 'VND')
      ).rejects.toThrow('Group name is required');
    });
  });

  describe('updateGroup', () => {
    it('updates currentGroup and group in groups array', async () => {
      useGroupStore.setState({
        groups: [
          {
            id: 'g1',
            name: 'Old Name',
            description: null,
            owner_id: 'u1',
            is_owner: true,
            currency: 'VND',
            total_amount: 100,
            total_bills: 1,
            total_items: 1,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
          },
        ],
        currentGroup: {
          id: 'g1',
          name: 'Old Name',
          description: null,
          owner_id: 'u1',
          is_owner: true,
          currency: 'VND',
          total_amount: 100,
          total_bills: 1,
          total_items: 1,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          bills: [],
        },
      });

      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            id: 'g1',
            name: 'New Name',
            description: 'Updated',
            owner_id: 'u1',
            is_owner: true,
            currency: 'VND',
            total_amount: 100,
            total_bills: 1,
            total_items: 1,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
            bills: [],
          }),
          { status: 200 }
        );
      }) as any;

      await useGroupStore.getState().updateGroup('g1', { name: 'New Name', description: 'Updated' });

      const state = useGroupStore.getState();
      expect(state.currentGroup?.name).toBe('New Name');
      expect(state.currentGroup?.description).toBe('Updated');
      expect(state.groups[0].name).toBe('New Name');
    });
  });

  describe('deleteGroup', () => {
    it('removes group from groups array and clears currentGroup if active', async () => {
      useGroupStore.setState({
        groups: [
          {
            id: 'g_to_delete',
            name: 'Delete Me',
            description: null,
            owner_id: 'u1',
            is_owner: true,
            currency: 'VND',
            total_amount: 0,
            total_bills: 0,
            total_items: 0,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
          },
        ],
        currentGroup: {
          id: 'g_to_delete',
          name: 'Delete Me',
          description: null,
          owner_id: 'u1',
          is_owner: true,
          currency: 'VND',
          total_amount: 0,
          total_bills: 0,
          total_items: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          bills: [],
        },
      });

      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as any;

      const success = await useGroupStore.getState().deleteGroup('g_to_delete');

      expect(success).toBe(true);
      const state = useGroupStore.getState();
      expect(state.groups.length).toBe(0);
      expect(state.currentGroup).toBeNull();
    });
  });

  describe('transferOwnership and clearCurrentGroup', () => {
    it('transfers ownership and updates is_owner to false', async () => {
      useGroupStore.setState({
        currentGroup: {
          id: 'g_transfer',
          name: 'Project Alpha',
          description: null,
          owner_id: 'user_alice',
          is_owner: true,
          currency: 'VND',
          total_amount: 0,
          total_bills: 0,
          total_items: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          bills: [],
        },
      });

      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes('/transfer')) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        // Refetch group
        return new Response(
          JSON.stringify({
            id: 'g_transfer',
            name: 'Project Alpha',
            description: null,
            owner_id: 'user_bob',
            is_owner: false,
            currency: 'VND',
            total_amount: 0,
            total_bills: 0,
            total_items: 0,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
            bills: [],
          }),
          { status: 200 }
        );
      }) as any;

      const res = await useGroupStore.getState().transferOwnership('g_transfer', 'user_bob');

      expect(res).toBe(true);
      expect(useGroupStore.getState().currentGroup?.is_owner).toBe(false);
      expect(useGroupStore.getState().currentGroup?.owner_id).toBe('user_bob');
    });

    it('clearCurrentGroup resets currentGroup to null', () => {
      useGroupStore.setState({
        currentGroup: {
          id: 'g_temp',
          name: 'Temp',
          description: null,
          owner_id: 'u1',
          is_owner: true,
          currency: 'VND',
          total_amount: 0,
          total_bills: 0,
          total_items: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          bills: [],
        },
      });

      useGroupStore.getState().clearCurrentGroup();
      expect(useGroupStore.getState().currentGroup).toBeNull();
    });
  });
});
