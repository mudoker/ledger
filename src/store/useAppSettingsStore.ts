import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type StorageMode = 'local' | 'hybrid' | 'cloud';
export type AppLanguage = 'en' | 'vi';

interface AppSettingsState {
  storageMode: StorageMode;
  language: AppLanguage;
  defaultCurrency: string;

  setStorageMode: (mode: StorageMode) => void;
  setLanguage: (lang: AppLanguage) => void;
  setDefaultCurrency: (currency: string) => void;
}

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      storageMode: 'local',
      language: 'en',
      defaultCurrency: 'VND',

      setStorageMode: (mode) => {
        set({ storageMode: mode });
        if (mode === 'hybrid' || mode === 'cloud') {
          try {
            const { useGroupStore } = require('@/store/useGroupStore');
            const groupState = useGroupStore.getState();
            if (groupState.currentGroup?.bills?.some((b: any) => b.isLocal)) {
              useGroupStore.setState({
                currentGroup: {
                  ...groupState.currentGroup,
                  bills: groupState.currentGroup.bills.map((b: any) => ({ ...b, isLocal: false })),
                },
              });
            }
          } catch {}

          import('@/lib/local-db/sync-manager')
            .then(({ syncManager }) => syncManager.syncAllLocalDataToCloud())
            .catch(() => {});
        }
      },
      setLanguage: (lang) => set({ language: lang }),
      setDefaultCurrency: (currency) => set({ defaultCurrency: currency }),
    }),
    {
      name: 'ledger-app-settings',
      onRehydrateStorage: () => (state) => {
        if (state && (state.storageMode as string) === 'cloud') {
          state.storageMode = 'hybrid';
        }
      },
    }
  )
);
