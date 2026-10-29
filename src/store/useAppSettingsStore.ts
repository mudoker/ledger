import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type StorageMode = 'local' | 'cloud' | 'hybrid';
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

      setStorageMode: (mode) => set({ storageMode: mode }),
      setLanguage: (lang) => set({ language: lang }),
      setDefaultCurrency: (currency) => set({ defaultCurrency: currency }),
    }),
    {
      name: 'ledger-app-settings',
    }
  )
);
