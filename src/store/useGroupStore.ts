import { create } from 'zustand';
import type { BillGroupSummary, BillGroupDetail } from '@/../db/types';

interface GroupState {
  groups: BillGroupSummary[];
  currentGroup: BillGroupDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchGroups: () => Promise<void>;
  fetchGroup: (id: string) => Promise<BillGroupDetail | null>;
  createGroup: (name: string, description?: string | null, currency?: string) => Promise<BillGroupDetail>;
  updateGroup: (id: string, data: { name?: string; description?: string | null; currency?: string }) => Promise<void>;
  deleteGroup: (id: string) => Promise<boolean>;
  transferOwnership: (id: string, newOwnerId: string) => Promise<boolean>;
  clearCurrentGroup: () => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroup: null,
  isLoading: false,
  error: null,

  fetchGroups: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const groups = await res.json();
        set({ groups, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch groups';
      set({ error: msg, isLoading: false });
    }
  },

  fetchGroup: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/groups/${id}`);
      if (!res.ok) {
        throw new Error('Group not found');
      }
      const data = await res.json();
      set({ currentGroup: data, isLoading: false });
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch group';
      set({ error: msg, isLoading: false, currentGroup: null });
      return null;
    }
  },

  createGroup: async (name: string, description: string | null = null, currency: string = 'VND') => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, currency }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create group');
      }
      const newGroup = await res.json();
      await get().fetchGroups();
      set({ currentGroup: newGroup, isLoading: false });
      return newGroup;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create group';
      set({ error: msg, isLoading: false });
      throw e;
    }
  },

  updateGroup: async (id: string, data) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update group');
      }
      const updated = await res.json();
      set((state) => ({
        currentGroup: state.currentGroup?.id === id ? { ...state.currentGroup, ...updated } : state.currentGroup,
        groups: state.groups.map((g) => (g.id === id ? { ...g, ...updated } : g)),
        isLoading: false,
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update group';
      set({ error: msg, isLoading: false });
      throw e;
    }
  },

  deleteGroup: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete group');
      }
      set((state) => ({
        groups: state.groups.filter((g) => g.id !== id),
        currentGroup: state.currentGroup?.id === id ? null : state.currentGroup,
        isLoading: false,
      }));
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete group';
      set({ error: msg, isLoading: false });
      throw e;
    }
  },

  transferOwnership: async (id: string, newOwnerId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/groups/${id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_owner_id: newOwnerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to transfer ownership');
      }
      // Refresh current group
      await get().fetchGroup(id);
      await get().fetchGroups();
      set({ isLoading: false });
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to transfer ownership';
      set({ error: msg, isLoading: false });
      throw e;
    }
  },

  clearCurrentGroup: () => set({ currentGroup: null }),
}));
