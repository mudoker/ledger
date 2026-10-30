import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  authError: string | null;

  fetchUser: () => Promise<AuthUser | null>;
  signInWithGoogle: () => void;
  signOut: () => Promise<void>;
  devLogin: (email: string, name?: string) => Promise<boolean>;
  offlineLogin: (email: string, name?: string) => Promise<boolean>;
  setAuthError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isInitialized: false,
      authError: null,

      fetchUser: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/auth/me');
          if (res.ok) {
            const data = await res.json();
            set({ user: data.user || null, isLoading: false, isInitialized: true });
            return data.user || null;
          }
          if (res.status === 401) {
            // Explicitly unauthorized by server
            set({ user: null, isLoading: false, isInitialized: true });
            return null;
          }
          // Server error or other status: keep cached user if present
          set({ isLoading: false, isInitialized: true });
          return get().user;
        } catch {
          // Network failure / offline: preserve cached user so offline sessions stay active
          set({ isLoading: false, isInitialized: true });
          return get().user;
        }
      },

      signInWithGoogle: () => {
        if (typeof window !== 'undefined') {
          window.location.href = '/api/auth/google';
        }
      },

      signOut: async () => {
        set({ isLoading: true });
        try {
          await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
        } finally {
          set({ user: null, isLoading: false });
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }
      },

      devLogin: async (email: string, name?: string) => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/auth/dev-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name }),
          });
          if (res.ok) {
            const data = await res.json();
            set({ user: data.user, isLoading: false });
            return true;
          }
        } catch {
          // If server call fails, fallback to offlineLogin
          return get().offlineLogin(email, name);
        }
        set({ isLoading: false });
        return false;
      },

      offlineLogin: async (email: string, name?: string) => {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) return false;
        const cleanName = name?.trim() || cleanEmail.split('@')[0];
        const localUser: AuthUser = {
          id: `local_user_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
          email: cleanEmail,
          name: cleanName,
          avatar_url: null,
        };
        set({ user: localUser, isLoading: false, isInitialized: true });
        return true;
      },

      setAuthError: (error) => set({ authError: error }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
