import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { useAppSettingsStore } from '../src/store/useAppSettingsStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { useBillStore } from '../src/store/useBillStore';
import { getTranslation, translations } from '../src/lib/i18n';
import { setLocalDb, MemoryStorageEngine } from '../src/lib/local-db';
import {
    APP_METADATA,
    PRIVACY_POLICY,
    TERMS_OF_SERVICE,
    PRIVACY_CONSENT_DISCLOSURE,
    OPEN_SOURCE_LICENSES,
} from '../src/constants/app-info';

describe('App Settings & Offline Authentication Suite', () => {
    let localEngine: MemoryStorageEngine;

    beforeEach(async () => {
        (globalThis as any).window = {
            location: { href: 'http://localhost/' },
            history: { replaceState: () => {} },
        };
        localEngine = new MemoryStorageEngine();
        await localEngine.init();
        setLocalDb(localEngine);

        useAppSettingsStore.setState({
            storageMode: 'local',
            language: 'en',
            defaultCurrency: 'VND',
        });
        useAuthStore.setState({
            user: null,
            isLoading: false,
        });
    });

    describe('Storage Mode Settings & Behavioral Impact', () => {
        it('defaults to local storage mode as mandated by BRD BR-01', () => {
            const state = useAppSettingsStore.getState();
            expect(state.storageMode).toBe('local');
        });

        it('allows toggling between local, cloud, and hybrid modes', () => {
            const setStorageMode = useAppSettingsStore.getState().setStorageMode;

            setStorageMode('cloud');
            expect(useAppSettingsStore.getState().storageMode).toBe('cloud');

            setStorageMode('hybrid');
            expect(useAppSettingsStore.getState().storageMode).toBe('hybrid');

            setStorageMode('local');
            expect(useAppSettingsStore.getState().storageMode).toBe('local');
        });

        it('persists default currency selection', () => {
            const setDefaultCurrency = useAppSettingsStore.getState().setDefaultCurrency;

            setDefaultCurrency('USD');
            expect(useAppSettingsStore.getState().defaultCurrency).toBe('USD');

            setDefaultCurrency('EUR');
            expect(useAppSettingsStore.getState().defaultCurrency).toBe('EUR');
        });

        it('saveToDb in local mode only writes to localDb and does not dispatch network requests for private bills', async () => {
            useAppSettingsStore.setState({ storageMode: 'local' });
            useBillStore.setState({
                currentBillId: 'bill_local_test_1',
                sharingStatus: 'local',
                visibility: 'local',
                billName: 'Private Coffee',
                people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 0 }],
                items: [],
                globalCharges: [],
            });

            let fetchCalls = 0;
            globalThis.fetch = mock(async () => {
                fetchCalls++;
                return { ok: true, json: async () => ({}) };
            }) as any;

            await useBillStore.getState().saveToDb();

            // Zero network calls in local-only mode
            expect(fetchCalls).toBe(0);

            // Stored in local database
            const stored = await localEngine.getBill('bill_local_test_1');
            expect(stored).not.toBeNull();
            expect(stored?.name).toBe('Private Coffee');
        });

        it('saveToDb in cloud mode triggers cloud upload even for unshared bills', async () => {
            useAppSettingsStore.setState({ storageMode: 'cloud' });
            useBillStore.setState({
                currentBillId: 'bill_cloud_test_1',
                sharingStatus: 'local',
                visibility: 'local',
                billName: 'Cloud Sync Bill',
                people: [{ id: 'p1', name: 'Alice', sponsorAmount: 0, paidAmount: 0 }],
                items: [],
                globalCharges: [],
            });

            let postBillCalls = 0;
            globalThis.fetch = mock(async (url: any, init?: any) => {
                if (init?.method === 'POST') postBillCalls++;
                return { ok: true, json: async () => ({ id: 'bill_cloud_test_1', bills: [] }) };
            }) as any;

            await useBillStore.getState().saveToDb();
            expect(postBillCalls).toBe(1);
        });
    });

    describe('Localization, Translations, and Dictionary Integrity', () => {
        it('supports English and Vietnamese localized dictionaries', () => {
            const enTitle = getTranslation('en', 'settings.title');
            const viTitle = getTranslation('vi', 'settings.title');

            expect(enTitle).toBe('App Settings');
            expect(viTitle).toBe('Cài đặt ứng dụng');

            const enLocalMode = getTranslation('en', 'settings.storage.localOnly');
            const viLocalMode = getTranslation('vi', 'settings.storage.localOnly');

            expect(enLocalMode).toContain('Local Only');
            expect(viLocalMode).toContain('Chỉ lưu cục bộ');
        });

        it('falls back to key if translation key does not exist', () => {
            const missingKey = getTranslation('en', 'nonexistent.key.xyz');
            expect(missingKey).toBe('nonexistent.key.xyz');
        });

        it('ensures 100% dictionary key parity between English and Vietnamese', () => {
            const enKeys = Object.keys(translations.en) as Array<keyof typeof translations.en>;
            const viKeys = Object.keys(translations.vi);

            for (const key of enKeys) {
                expect(viKeys).toContain(key);
                const enVal = translations.en[key];
                const viVal = (translations.vi as any)[key];

                expect(typeof enVal).toBe('string');
                expect(typeof viVal).toBe('string');
                expect(enVal.trim().length).toBeGreaterThan(0);
                expect(viVal.trim().length).toBeGreaterThan(0);
            }
        });
    });

    describe('Offline Authentication & Mandatory Login Gate', () => {
        it('allows logging in offline with a local profile', async () => {
            const offlineLogin = useAuthStore.getState().offlineLogin;

            await offlineLogin('offline@ledger.local', 'Offline Explorer');

            const user = useAuthStore.getState().user;
            expect(user).not.toBeNull();
            expect(user?.name).toBe('Offline Explorer');
            expect(user?.email).toBe('offline@ledger.local');
            expect(user?.id.startsWith('local_user_')).toBe(true);
        });

        it('sanitizes input and derives name from email when name is omitted', async () => {
            const offlineLogin = useAuthStore.getState().offlineLogin;

            await offlineLogin('   ALICE.WONDER@EXAMPLE.COM   ');

            const user = useAuthStore.getState().user;
            expect(user).not.toBeNull();
            expect(user?.email).toBe('alice.wonder@example.com');
            expect(user?.name).toBe('alice.wonder');
            expect(user?.id).toBe('local_user_alice_wonder_example_com');
        });

        it('rejects invalid or empty emails in offline login', async () => {
            const offlineLogin = useAuthStore.getState().offlineLogin;

            const res1 = await offlineLogin('');
            expect(res1).toBe(false);
            expect(useAuthStore.getState().user).toBeNull();

            const res2 = await offlineLogin('   ');
            expect(res2).toBe(false);
            expect(useAuthStore.getState().user).toBeNull();
        });

        it('falls back to offlineLogin when devLogin server request fails', async () => {
            const devLogin = useAuthStore.getState().devLogin;

            // Mock server failure
            globalThis.fetch = mock(async () => {
                throw new Error('Server unreachable');
            }) as any;

            const success = await devLogin('dev@example.com', 'Dev Tester');
            expect(success).toBe(true);

            const user = useAuthStore.getState().user;
            expect(user).not.toBeNull();
            expect(user?.email).toBe('dev@example.com');
            expect(user?.name).toBe('Dev Tester');
        });

        it('clears session on logout', async () => {
            const offlineLogin = useAuthStore.getState().offlineLogin;
            const signOut = useAuthStore.getState().signOut;

            await offlineLogin('temp@ledger.local', 'Temporary User');
            expect(useAuthStore.getState().user).not.toBeNull();

            if (typeof window === 'undefined') {
                (globalThis as any).window = { location: { href: '' } };
            }

            await signOut();
            expect(useAuthStore.getState().user).toBeNull();
        });
    });

    describe('Google Play & App Store Compliance Documents', () => {
        it('contains complete application metadata', () => {
            expect(APP_METADATA.name).toBe('Ledger');
            expect(APP_METADATA.version).toBeDefined();
            expect(APP_METADATA.contactEmail).toContain('@');
            expect(APP_METADATA.website).toBeDefined();
        });

        it('contains compliant Privacy Policy explaining local-first storage and opt-in sharing', () => {
            expect(PRIVACY_POLICY).toContain('Privacy Policy');
            expect(PRIVACY_POLICY).toContain('Local-First by Default');
            expect(PRIVACY_POLICY).toContain('Immediate Access Revocation');
            expect(PRIVACY_POLICY).toContain('Contact & Data Controller');
        });

        it('contains Terms of Service with user responsibilities and license terms', () => {
            expect(TERMS_OF_SERVICE).toContain('Terms of Service');
            expect(TERMS_OF_SERVICE).toContain('Mathematical & Financial Disclaimer');
            expect(TERMS_OF_SERVICE).toContain('User Conduct & Sharing');
        });

        it('contains Privacy Consent and Disclosure statement', () => {
            expect(PRIVACY_CONSENT_DISCLOSURE).toContain('Privacy & Consent Summary');
            expect(PRIVACY_CONSENT_DISCLOSURE).toContain('Local-First Default');
            expect(PRIVACY_CONSENT_DISCLOSURE).toContain('Revocation Rights');
        });

        it('contains Open Source Licenses attribution', () => {
            expect(OPEN_SOURCE_LICENSES.length).toBeGreaterThan(5);
            const reactPkg = OPEN_SOURCE_LICENSES.find((p) => p.name === 'React');
            expect(reactPkg).toBeDefined();
            expect(reactPkg?.license).toBe('MIT');
        });
    });
});
