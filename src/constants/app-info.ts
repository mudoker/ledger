export const APP_METADATA = {
  name: 'Ledger',
  version: '1.0.25',
  build: '125',
  packageId: 'com.mudoker.ledger',
  releaseDate: '2026-11-04',
  developer: 'Mudoker Studio',
  contactEmail: 'privacy@ledger.mudoker.com',
  legalEmail: 'legal@ledger.mudoker.com',
  website: 'https://ledger.mudoker.com',
  jurisdiction: 'Vietnam / Global Operations',
};

export const PRIVACY_POLICY = `
# Privacy Policy for Ledger
**Last updated: November 04, 2026**

> [!NOTE]
> Ledger ("Company", "we", "our", or "the app") provides a high-integrity, local-first bill splitting and peer expense reconciliation platform. We prioritize zero-knowledge local execution and give you total sovereignty over your sensitive financial bookkeeping records.

---

### 1. Fundamental Principle: Local-First by Default
Ledger is architected with a **privacy-by-default, local-first data model**:
- **On-Device Storage:** All bills, line items, participant names, expense attributions, sponsorship allocations, and debt minimization graphs are stored **locally on your device** in browser IndexedDB storage by default.
- **Offline Calculation Engine:** The settlement algorithm, currency conversion, and receipt allocations operate entirely client-side using JavaScript in your browser without contacting external servers.
- **No Automatic Uploads:** Creating or editing expenses offline never discloses, uploads, or mirrors any data to our cloud servers without your explicit, affirmative action.

---

### 2. Sensitive Financial Data Classification & Handling
Because expense splitting touches sensitive personal and financial matters, we adhere to strict data classification standards:

| Data Category | Data Elements Processed | Storage & Encryption Standard |
| :--- | :--- | :--- |
| **Bookkeeping Records** | Bill names, line items, expense amounts, attendee rosters, debt settlement flows | Encrypted locally (IndexedDB) or TLS 1.3 in transit to cloud |
| **Payment Attribution** | Who paid an invoice, who owes whom, co-payer shares, group totals | Processed client-side; synced only upon user request |
| **Cardholder Data (PCI)** | Credit/debit card numbers, CVV/CVC, expiration dates, PINs | **STRICTLY NEVER COLLECTED, STORED, OR PROCESSED** |
| **Banking Credentials** | Online banking usernames, passwords, OTPs, biometric security keys | **STRICTLY NEVER REQUESTED OR ACCESSIBLE BY APP** |
| **Receipt Images (OCR)** | Paper receipt photos, itemized receipt camera captures | **Client-side only memory; zero cloud upload** |

> [!WARNING]
> Ledger is a **record-keeping and expense allocation utility**, not a bank or payment processor. We do not process monetary wire transfers, hold deposit balances, or connect to banking APIs to move actual money.

---

### 3. Client-Side Receipt Scanning & Optical Character Recognition (OCR)
- **Local Memory Processing:** When you capture a receipt image using your device camera or file picker, Optical Character Recognition (OCR) is performed entirely in temporary browser memory using WebAssembly / local optical engines.
- **Zero Image Retention:** Raw photo buffers and camera feeds are discarded immediately after text extraction and are **never** uploaded, stored, or processed on our backend servers.
- **Privacy Protections:** The app does not access your photo gallery or camera except when explicitly prompted by you for receipt scanning.

---

### 4. Cloud Synchronization & Access Hierarchy
When you explicitly choose to authenticate or share a group or bill, data handling operates under the following transparent rules:

- **Authentication Data:** When logging in via Google OAuth, we receive only standard public profile identifiers (name, verified email address, avatar image URL, and unique Google subject ID). This information is utilized exclusively to assert user identity and authorize access to restricted resources.
- **Shared Bill & Group Payloads:** Only the specific group or bill you choose to synchronize is transmitted to our secure cloud database (PostgreSQL on Neon Cloud, encrypted via AES-256 at rest and TLS 1.3 in transit).
- **Cryptographic Share Tokens:** For public link sharing, we generate cryptographically unguessable, 128-bit random tokens. Unauthorized individuals cannot guess or crawl shared bills.
- **Restricted Access Whitelists:** For restricted shared groups, only authenticated participants whose email addresses or user accounts have been explicitly granted membership can view expense records.
- **Zero Cross-Group Leakage:** Private or unshared local bills remain strictly isolated on your device and are never visible or accessible to other group participants.

---

### 5. Immediate Access Revocation & Cloud Data Deletion
You retain unilateral and immediate control over the lifecycle of your data:
- **Instant Revocation:** Toggling a bill or group to "Local Only" or clicking "Disable Sharing" **immediately revokes access** for all external users, invalidates all distributed share links, and initiates permanent deletion of the cloud record from our production database.
- **404 Masking:** Revoked or deleted share links return a generic **404 Not Found** response, preventing third parties from inferring whether a bill ever existed.
- **Local Wipe:** You can permanently erase all local bills, participant caches, and app configurations at any time by selecting "Clear All Local Data" in Settings or resetting browser site storage.

---

### 6. Third-Party Infrastructure & Strict Non-Sale Policy
- **No Data Brokers or Advertisers:** We **never** sell, rent, monetize, or trade your personal names, expense history, or financial records to third-party advertisers, data aggregators, or commercial marketing firms.
- **No Third-Party Ad Trackers:** Ledger contains zero tracking pixels, third-party advertising SDKs, or behavioral surveillance trackers.
- **Sub-processors:** We partner only with reputable, enterprise-grade cloud infrastructure providers:
  - **Neon Inc.:** Serverless PostgreSQL database hosting with AES-256 encryption at rest and SOC 2 Type II compliance.
  - **Google LLC:** Google Identity Services for optional OAuth authentication.
  - **Vercel Inc. / Cloudflare:** Edge content delivery and application hosting.

---

### 7. Global Legal & Regulatory Compliance
We design our privacy architecture to comply with major international and regional privacy laws:
- **European General Data Protection Regulation (GDPR):** You have the right to access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), and data portability (Art. 20). Because data is local-first, you maintain direct custody of your information.
- **California Consumer Privacy Act (CCPA / CPRA):** We do not "sell" or "share" personal information as defined by California law. California consumers may exercise their rights by contacting our privacy office.
- **Vietnam Personal Data Protection Decree (Decree 13/2023/ND-CP):** We process personal data solely with your affirmative consent, for clear and lawful purposes, and implement technical measures to safeguard personal data against unauthorized disclosure or loss.

---

### 8. Contact & Data Controller Information
If you have questions, regulatory requests, or concerns regarding your privacy rights, please contact our Data Controller:
- **Data Protection Officer:** Mudoker Studio Legal & Privacy Office
- **Direct Privacy Email:** ${APP_METADATA.contactEmail}
- **Website:** ${APP_METADATA.website}
`;

export const TERMS_OF_SERVICE = `
# Terms of Service
**Effective Date: November 04, 2026**

> [!IMPORTANT]
> These Terms of Service constitute a legally binding agreement between you ("User", "you") and Mudoker Studio ("Company", "Ledger", "we", "us"). By accessing, installing, or using Ledger, you agree to these Terms in full. If you do not agree, do not use the application.

---

### 1. Description of Service & Core Scope
Ledger is a local-first software utility designed to assist individuals and groups in recording shared expenses, allocating meal and trip bills, calculating sponsorships, and computing debt-minimization settlement directions.

---

### 2. Mathematical & Financial Disclaimer (Non-Banking Declaration)

> [!WARNING]
> **PLEASE READ THIS SECTION CAREFULLY. IT CONTAINS CRITICAL LEGAL LIMITATIONS REGARDING FINANCIAL AND REGULATORY MATTERS.**

- **NOT A LICENSED FINANCIAL INSTITUTION:** Ledger is an administrative calculation, bookkeeping, and record-keeping software tool. Ledger is **NOT a bank, credit union, depository institution, payment services provider (PSP), money services business (MSB), or licensed money transmitter** under the laws of Vietnam, the United States, or any other jurisdiction.
- **NO CUSTODY OR ESCROW OF FUNDS:** Ledger **never holds, receives, handles, transmits, or escrows actual money, currency, or financial assets**. Ledger does not execute wire transfers, automated clearing house (ACH) transactions, or credit card debits.
- **PEER-TO-PEER SETTLEMENT RESPONSIBILITY:** All actual payments and reimbursements (such as cash exchanges, direct bank wire transfers, VietQR transfers, ZaloPay, Venmo, PayPal, or Wise payments) occur entirely off-platform, independently between participants. Ledger bears zero liability for unpaid debts, peer repayment disputes, or unauthorized banking transactions.
- **MATHEMATICAL & ROUNDING ESTIMATIONS:** Expense allocations, fractional division, currency conversions, and rounding algorithms (e.g. integer rounding in VND or 2-decimal rounding in foreign currencies) are automated mathematical conveniences. **Users are solely responsible for verifying final figures before exchanging real money.**
- **NO TAX, LEGAL, OR ACCOUNTING ADVICE:** Ledger does not provide certified accounting, tax auditing, or legal advice. Users are responsible for complying with personal tax requirements and business expense reporting laws in their respective jurisdictions.

---

### 3. User Conduct & Sharing Warranties
By using Ledger, you represent and warrant that:
- **Authority Regarding Participants:** When you enter the name, email address, or expense details of any other individual into a bill or group, you have obtained proper consent and authority from that individual to record and share their information.
- **Lawful Purpose:** You will not use Ledger for money laundering, terrorism financing, fraudulent billing schemes, illegal gambling accounting, commercial extortion, or tax evasion.
- **Prohibited Conduct:** You agree not to attempt to reverse engineer, probe vulnerabilities, circumvent sharing access controls, spam public share links, or deploy automated bots against Ledger servers.

---

### 4. Intellectual Property & User Content License
- **User Ownership:** You retain full, exclusive ownership and title to all financial notes, participant lists, expense names, and custom data entered into Ledger.
- **Limited Operational License:** You grant Ledger a non-exclusive, worldwide, royalty-free, revocable license strictly to store, process, display, and synchronize your data as necessary to operate the application in accordance with your chosen settings (Local, Hybrid, or Cloud).
- **Proprietary Software Rights:** All software code, user interface designs, mathematical algorithms, icons, branding, and documentation of Ledger are the exclusive intellectual property of Mudoker Studio and are protected by international copyright and intellectual property laws.

---

### 5. Disclaimer of Warranties
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LEDGER IS PROVIDED STRICTLY ON AN **"AS IS", "WITH ALL FAULTS", AND "AS AVAILABLE"** BASIS. MUDOKER STUDIO AND ITS AFFILIATES EXPRESSLY DISCLAIM ALL WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, ACCURACY, ERROR-FREE OPERATION, AND NON-INFRINGEMENT.

---

### 6. Limitation of Liability
TO THE FULLEST EXTENT PERMITTED BY LAW:
- **NO CONSEQUENTIAL OR PUNITIVE DAMAGES:** IN NO EVENT SHALL MUDOKER STUDIO, ITS DIRECTORS, EMPLOYEES, OR INFRASTRUCTURE PARTNERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES—INCLUDING LOSS OF PROFITS, DATA CORRUPTION, DISPUTED REIMBURSEMENTS, OR PEER FINANCIAL LOSSES—ARISING FROM OR RELATED TO YOUR USE OF THE APPLICATION.
- **LIABILITY AGGREGATE CAP:** THE TOTAL AGGREGATE LIABILITY OF MUDOKER STUDIO FOR ANY AND ALL CLAIMS ARISING UNDER OR RELATED TO THESE TERMS SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL AMOUNT ACTUALLY PAID BY YOU TO LEDGER FOR THE USE OF THE SERVICE DURING THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) FIFTY UNITED STATES DOLLARS ($50.00 USD).

---

### 7. Indemnification
You agree to indemnify, defend, and hold harmless Mudoker Studio and its developers from and against any third-party claims, liabilities, damages, losses, or legal expenses (including reasonable attorney fees) arising from: (a) your breach of these Terms, (b) any dispute between you and another bill participant, or (c) your violation of applicable laws or third-party privacy rights.

---

### 8. Termination & Revocation
- You may terminate your relationship with Ledger at any time by ceasing use and purging your local data.
- We reserve the right to suspend or revoke cloud sharing access or terminate accounts that violate these Terms or engage in abusive, fraudulent, or unlawful conduct.

---

### 9. Governing Law & Dispute Resolution
These Terms shall be governed by and construed in accordance with the laws of Vietnam, without regard to conflict of law principles. Any legal dispute or controversy arising out of these Terms shall first be submitted to good-faith informal consultation. If unresolved within thirty (30) days, the dispute shall be resolved through competent courts in Ho Chi Minh City, Vietnam.

---

### 10. Contact Information
For formal legal notices, inquiries, or enterprise licensing:
- **Legal Department:** Mudoker Studio Legal Office
- **Email:** ${APP_METADATA.legalEmail}
- **Website:** ${APP_METADATA.website}
`;

export const PRIVACY_CONSENT_DISCLOSURE = `
# Privacy & Consent Summary
**Data Processing Consent & Disclosure Framework (GDPR Art. 7 & Vietnam Decree 13/2023/ND-CP)**

> [!NOTE]
> Ledger is committed to transparent, principled data processing. Please review this summary of how your personal and expense information is collected, processed, and safeguarded.

---

### 1. Scope of Data Processed
By choosing to enable cloud features, sign in, or share bills in Ledger, you explicitly consent to the processing of:
- **Profile Identification:** Your authenticated name, email address, and avatar image (via Google OAuth) to verify group membership.
- **Expense Records:** Invoice descriptions, itemized receipt breakdown, monetary amounts, and currency denominations.
- **Participant Associations:** Names or aliases assigned to expense line items, attendee status, and co-payer contributions.
- **Settlement Direction Records:** Debt minimization vectors calculated to guide peer reimbursements.

---

### 2. Location & Processing Architecture
- **Local-First Default:** Unshared bills remain 100% on your local device hardware inside browser IndexedDB.
- **Secure Cloud Transmission:** When sharing is enabled, data is transferred via encrypted TLS 1.3 to our dedicated Neon PostgreSQL database (AES-256 encrypted at rest).
- **Client-Side Camera OCR:** Camera and receipt scanning occurs strictly within volatile client-side browser memory. Receipt photos are not stored or uploaded to cloud storage.

---

### 3. Absolute Safeguards & Non-Negotiables
1. **ZERO Cardholder Data:** We never collect, transmit, or store credit card numbers, CVVs, or debit PINs.
2. **ZERO Banking Access:** We never ask for or connect to your bank passwords or financial account credentials.
3. **ZERO Third-Party Ad Selling:** Your financial records are strictly private and never sold to brokers or advertising networks.

---

### 4. Revocation Rights & Data Erasure
- **Unilateral Revocation:** You retain full **Revocation Rights** and may revoke cloud sharing at any time. Clicking "Disable Sharing" immediately deletes the cloud replica and terminates all external access links.
- **Local Erasure:** You can wipe your entire local dataset at any time via in-app Settings.
- **Withdrawal of Consent:** Withdrawing consent does not affect the lawfulness of processing carried out prior to withdrawal.

---

### 5. Affirmation & Acceptance
By checking the acknowledgment box or proceeding with cloud synchronization, you affirm that:
- You have read, understood, and agreed to the **Privacy Policy** and **Terms of Service**.
- You possess the necessary consent from all individuals you include in shared group expenses.
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
  { name: 'Recharts', license: 'MIT', url: 'https://recharts.org' },
  { name: 'Tesseract.js', license: 'Apache-2.0', url: 'https://github.com/naptha/tesseract.js' },
  { name: 'date-fns', license: 'MIT', url: 'https://date-fns.org' },
  { name: 'Fuse.js', license: 'Apache-2.0', url: 'https://fusejs.io' },
];
