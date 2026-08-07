import { useAppSettingsStore, type AppLanguage } from '@/store/useAppSettingsStore';

export const translations = {
  en: {
    // App & Nav
    appName: 'Ledger',
    appTagline: 'Privacy-First Expense Splitting',
    settings: 'App Settings',
    signOut: 'Sign Out',
    switchDevAccount: 'Switch Dev Account',
    back: 'Back',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    create: 'Create',
    close: 'Close',

    // Settings page
    settingsTitle: 'Settings & Preferences',
    settingsSubtitle: 'Configure storage defaults, appearance, language, and legal information',
    
    // Storage Mode
    storageSectionTitle: 'Default Storage & Cloud Sync',
    storageSectionDesc: 'Determine how newly created bills and groups are saved on your device',
    storageModeLocal: 'Local Only (Privacy Default)',
    storageModeLocalDesc: 'All data stays exclusively on this device. Cloud upload only occurs when explicitly sharing a bill.',
    storageModeCloud: 'Cloud Only',
    storageModeCloudDesc: 'All bills and groups automatically upload and synchronize with your cloud account in real-time.',
    storageModeHybrid: 'Both / Hybrid Sync',
    storageModeHybridDesc: 'Local-first on-device persistence for instant offline speed with automatic background cloud sync when online.',

    storageConfirmTitle: 'Change Storage Mode?',
    storageConfirmLocalWarning: 'Switching to Local Only means new bills and groups will remain strictly on this device. Cloud sharing will require explicit confirmation per bill.',
    storageConfirmCloudWarning: 'Switching to Cloud Only will automatically synchronize all your bills and groups to your cloud account. Unshared private data will be uploaded.',
    storageConfirmHybridWarning: 'Switching to Hybrid mode keeps a local copy on your device while automatically syncing updates with the cloud in the background.',
    applyChange: 'Apply Change',

    // Appearance
    appearanceTitle: 'Appearance & Theme',
    appearanceDesc: 'Select your preferred visual style',

    // Language & Currency
    languageTitle: 'Language & Localization',
    defaultCurrencyTitle: 'Default Currency for New Bills',
    defaultCurrencyDesc: 'Pre-selects this currency when creating a new bill or group',

    // App Info & Legal
    appInfoTitle: 'App Information & Legal',
    appInfoDesc: 'Store compliance documents, privacy guarantees, and open-source licenses',
    version: 'Version',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
    dataConsent: 'Privacy Consent & Permissions',
    licenses: 'Open Source Licenses',

    // Sharing
    onlyOnThisDevice: 'Local',
    sharedRestricted: 'Shared (Participants)',
    sharedPublic: 'Shared (Public Link)',
    pendingRevocation: 'Revocation Pending',
    shareBill: 'Share Bill',
    disableSharing: 'Disable Sharing',
  },
  vi: {
    // App & Nav
    appName: 'Ledger',
    appTagline: 'Chia tiền hoá đơn bảo mật & cục bộ',
    settings: 'Cài đặt ứng dụng',
    signOut: 'Đăng xuất',
    switchDevAccount: 'Đổi tài khoản Dev',
    back: 'Quay lại',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    save: 'Lưu',
    create: 'Tạo mới',
    close: 'Đóng',

    // Settings page
    settingsTitle: 'Cài đặt & Tùy chọn',
    settingsSubtitle: 'Cấu hình chế độ lưu trữ, giao diện, ngôn ngữ và thông tin pháp lý',

    // Storage Mode
    storageSectionTitle: 'Lưu trữ mặc định & Đồng bộ đám mây',
    storageSectionDesc: 'Chọn cách hoá đơn và nhóm mới được lưu trữ trên thiết bị của bạn',
    storageModeLocal: 'Chỉ lưu cục bộ (Mặc định bảo mật)',
    storageModeLocalDesc: 'Tất cả dữ liệu nằm trên thiết bị này. Chỉ tải lên đám mây khi bạn chủ động bấm chia sẻ hoá đơn.',
    storageModeCloud: 'Chỉ đám mây',
    storageModeCloudDesc: 'Tất cả hoá đơn và nhóm tự động tải lên và đồng bộ thời gian thực với tài khoản đám mây của bạn.',
    storageModeHybrid: 'Kết hợp / Cục bộ & Đám mây',
    storageModeHybridDesc: 'Lưu trên thiết bị để truy cập nhanh ngoại tuyến và tự động đồng bộ lên đám mây khi có mạng.',

    storageConfirmTitle: 'Đổi chế độ lưu trữ?',
    storageConfirmLocalWarning: 'Chuyển sang "Chỉ lưu cục bộ": các hoá đơn mới sẽ chỉ lưu trên máy này. Việc chia sẻ lên đám mây sẽ cần bạn xác nhận cho từng hoá đơn.',
    storageConfirmCloudWarning: 'Chuyển sang "Chỉ đám mây": tất cả hoá đơn và nhóm sẽ tự động được tải lên tài khoản đám mây của bạn.',
    storageConfirmHybridWarning: 'Chuyển sang "Kết hợp": dữ liệu vừa được lưu trên máy vừa tự động đồng bộ ngầm lên đám mây.',
    applyChange: 'Áp dụng thay đổi',

    // Appearance
    appearanceTitle: 'Giao diện & Chủ đề',
    appearanceDesc: 'Chọn phong cách hiển thị yêu thích của bạn',

    // Language & Currency
    languageTitle: 'Ngôn ngữ & Vùng',
    defaultCurrencyTitle: 'Tiền tệ mặc định cho hoá đơn mới',
    defaultCurrencyDesc: 'Tự động chọn loại tiền này khi tạo hoá đơn hoặc nhóm mới',

    // App Info & Legal
    appInfoTitle: 'Thông tin ứng dụng & Pháp lý',
    appInfoDesc: 'Chính sách bảo mật, điều khoản sử dụng và giấy phép mã nguồn mở',
    version: 'Phiên bản',
    privacyPolicy: 'Chính sách bảo mật',
    termsOfService: 'Điều khoản dịch vụ',
    dataConsent: 'Đồng thuận dữ liệu & Quyền riêng tư',
    licenses: 'Giấy phép mã nguồn mở',

    // Sharing
    onlyOnThisDevice: 'Cục bộ',
    sharedRestricted: 'Đã chia sẻ (Thành viên)',
    sharedPublic: 'Đã chia sẻ (Công khai)',
    pendingRevocation: 'Đang hủy chia sẻ...',
    shareBill: 'Chia sẻ hoá đơn',
    disableSharing: 'Dừng chia sẻ',
  },
} as const;

export function getTranslation(language: AppLanguage, key: string): string {
  const dict = translations[language] || translations.en;
  if ((key as any) in dict) {
    return (dict as any)[key];
  }
  const mapping: Record<string, string> = {
    'settings.title': dict.settings,
    'settings.storage.localOnly': dict.storageModeLocal,
    'settings.storage.cloudOnly': dict.storageModeCloud,
    'settings.storage.hybrid': dict.storageModeHybrid,
  };
  if (mapping[key]) {
    return mapping[key];
  }
  return key;
}

export function useTranslation() {
  const language = useAppSettingsStore((state) => state.language) || 'en';
  const t = translations[language as AppLanguage] || translations.en;
  return { t, language };
}
