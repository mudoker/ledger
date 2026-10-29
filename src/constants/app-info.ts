export const APP_METADATA = {
  name: 'Ledger',
  version: '1.0.0',
  build: '100',
  packageId: 'com.mudoker.ledger',
  releaseDate: '2026-10-28',
  developer: 'Mudoker Studio',
  contactEmail: 'privacy@ledger.mudoker.com',
  website: 'https://ledger.mudoker.com',
};

export const PRIVACY_POLICY = `
# Privacy Policy for Ledger
**Last updated: October 28, 2026**

Ledger ("we", "our", or "the app") is committed to protecting your privacy. This Privacy Policy describes how we collect, use, and protect your information across our local-first bill splitting application and related services.

---

### 1. Fundamental Principle: Local-First by Default
Ledger is architected with a **privacy-by-default, local-first data model**:
- All bills, participant names, line items, allocations, split calculations, settlements, and groups you create are stored **locally on your device** by default.
- We do **not** automatically upload your personal or financial calculation data to our backend servers unless you explicitly elect to share a bill.
- You can create, edit, calculate, and organize expenses completely offline without disclosing any data to our cloud.

---

### 2. Information We Collect When You Use Cloud Services
When you opt-in to cloud features (such as signing in or sharing a bill):
- **Authentication Data:** If you sign in via Google OAuth, we receive your basic profile information (name, email address, avatar URL, and Google user ID). This is used solely to identify your account and verify access permissions for restricted shared bills.
- **Shared Bill Content:** When you explicitly enable cloud sharing for a bill, only the data required to operate that specific shared bill is transmitted to our secure cloud database (e.g., bill name, participant names/emails, line items, and split amounts).
- **Unguessable Share Tokens:** For public link sharing, we generate cryptographically secure, random tokens to grant authorized read-only access.
- **Device & Connection Metadata:** Basic diagnostic information (IP address, timestamps) generated in standard web server access logs. We never log bill details or financial amounts in server logs.

---

### 3. Sharing Modes & Access Controls
You retain 100% control over how your bills are shared:
- **Local Only:** Data stays exclusively on your hardware. Zero network transmission.
- **Restricted Sharing:** Accessible only by participants whose emails or user IDs you explicitly whitelist.
- **Public Link Sharing:** Accessible read-only by anyone possessing the specific cryptographic link. Public sharing requires explicit confirmation and is never the default.

---

### 4. Immediate Access Revocation & Cloud Data Deletion
- You may disable cloud sharing for any bill at any time.
- Disabling sharing **immediately revokes access** for all other users, invalidates all distributed share links, and initiates permanent deletion of the cloud copy from our active database.
- Disabling sharing **never deletes your local records**—your original data remains safe and sound on your device.
- Subsequent visits to revoked share links return a generic **404 Not Found** response, ensuring the prior existence or privacy of your bill is never disclosed.

---

### 5. Device Permissions & Hardware Usage
- **Camera Access (Optional):** Used strictly on-device to capture paper receipts for optical character recognition (OCR) or scan payment QR codes. Receipt images are processed locally in your browser memory and are not uploaded to our servers.
- **Storage / IndexedDB:** Used to store your offline bills, preferences, and local cache durable on your device.
- **Network Access:** Used only when signing in, syncing shared bills, or fetching exchange rates.

---

### 6. Children's Privacy (COPPA Compliance)
Ledger is not directed to individuals under the age of 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal data, please contact us at ${APP_METADATA.contactEmail}.

---

### 7. Regulatory Compliance (GDPR, CCPA, and PDPD)
Under European GDPR, California CCPA, and Vietnamese Personal Data Protection Decree (PDPD):
- You have the right to access, rectify, download, or delete your personal data.
- Because data is stored locally first, you can purge your local database at any time by clearing your browser/app storage.
- Cloud records can be purged on demand by disabling sharing or deleting the cloud bill.
- We do not sell your personal data or share it with third-party advertisers.

---

### 8. Contact & Data Controller
If you have questions about this Privacy Policy or your data rights:
- **Email:** ${APP_METADATA.contactEmail}
- **Website:** ${APP_METADATA.website}
`;

export const TERMS_OF_SERVICE = `
# Terms of Service
**Effective Date: October 28, 2026**

### 1. Acceptance of Terms
By downloading, installing, or using Ledger, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the application.

### 2. Description of Service
Ledger is a local-first utility designed to assist groups and individuals in calculating fair allocations, meal splits, sponsorships, and settlements. 

### 3. Mathematical & Financial Disclaimer
- Ledger is a **calculation and bookkeeping utility**, not a bank, licensed money transmitter, or payment processor.
- Ledger does **not** process actual bank transfers, debit cards, or financial transactions. All settlement instructions and payment confirmations are purely records managed between participants.
- Users are solely responsible for verifying the accuracy of split calculations and allocations before settling personal debts.

### 4. User Conduct & Sharing
- You agree not to use Ledger to distribute unlawful, harmful, or harassing content.
- When sharing a bill publicly or with participants, you are solely responsible for ensuring that you have permission from all listed individuals to share their names or expense allocations.

### 5. Termination & Data Deletion
You may cease using Ledger at any time. You can delete local data directly from your device and revoke shared cloud bills using the in-app "Disable Sharing" feature.

### 6. Limitation of Liability
To the maximum extent permitted by applicable law, Ledger and its developers shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use the service.
`;

export const PRIVACY_CONSENT_DISCLOSURE = `
### Privacy & Consent Summary
Before using cloud synchronization or sharing features in Ledger:

1. **Local-First Default:** All bills remain on this device unless you choose to share them.
2. **Explicit Consent:** Toggling a bill to "Shared" requires your explicit approval before data leaves your device.
3. **Revocation Rights:** Disabling sharing removes the cloud copy and revokes all share links immediately.
4. **No Third-Party Tracking:** We do not embed ad trackers or sell data to brokers.
`;

export const OPEN_SOURCE_LICENSES = [
  { name: 'React', license: 'MIT', url: 'https://react.dev' },
  { name: 'Next.js', license: 'MIT', url: 'https://nextjs.org' },
  { name: 'Zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://tailwindcss.com' },
  { name: 'Radix UI', license: 'MIT', url: 'https://www.radix-ui.com' },
  { name: 'Lucide Icons', license: 'ISC', url: 'https://lucide.dev' },
  { name: 'Framer Motion', license: 'MIT', url: 'https://www.framer.com/motion' },
  { name: 'TanStack Query', license: 'MIT', url: 'https://tanstack.com/query' },
];
