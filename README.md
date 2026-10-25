# Ledger

Smart group expense ledger with multi-currency exchange rates, Google OAuth authentication, role-based bill access, and peer-to-peer settlement optimization.

🔗 **GitHub Repository**: [https://github.com/mudoker/ledger](https://github.com/mudoker/ledger)

---

## Features

- **Multi-Currency & Live Rates**: Seamless currency switching powered by the [Frankfurter API v2](https://api.frankfurter.dev/v2) with country flag badges and intelligent fallback mechanisms.
- **Smart Splitting**: Split items by exact consumption, proportional shares, or custom quantities.
- **Sponsorship & Late Arrivals**: Automatic credit subsidies and surplus handling.
- **P2P Settlement Optimization**: Computes minimum cash transfer flows between members.
- **Google OAuth 2.0 & RBAC**: Private bill storage with member-only viewing and owner privileges.
- **Public Read-Only Sharing**: Shareable links for guests without mandatory login.
- **Offline & PWA Ready**: Installable Progressive Web App with auto-updating service worker cache.
- **OCR Receipt Scanning**: Scan receipt totals directly into your bill.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI Components**: Tailwind CSS, Radix UI, Lucide Icons, Country Flag Icons
- **State Management**: Zustand (persisted)
- **Database**: Dual Neon PostgreSQL / Local SQLite fallback
- **Auth**: Google OAuth 2.0 / JWT session cookies

---

## Getting Started

1. Install dependencies:
   ```bash
   bun install # or npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Documentation

- [Multi-Payer Architecture Specification](docs/MULTIPLE_PAYERS_PLAN.md)
- [Sponsor & Multi-Sponsor Mechanism](docs/SPONSOR_MECHANISM.md)

