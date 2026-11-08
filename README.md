# RechargeAlert

Unofficial DESCO prepaid low-balance / recharge alert app.

- **Mobile:** Quasar + Capacitor (Android & iOS) — `mobile/`
- **Admin:** Quasar web SPA — `admin/`
- **Backend:** Supabase (Postgres + Edge Functions, free plan) — `supabase/`

This project proxies DESCO prepaid portal APIs from the backend (avoids browser CORS). It is **not affiliated with DESCO**. Use only accounts you own. Portal APIs can change without notice.

## Requirements

- Node.js **22.12+** (Quasar / `@quasar/app-vite` requirement)
- A free [Supabase](https://supabase.com) project
- For native builds: Android Studio and/or Xcode

## Quick start

### 1. Supabase backend

Follow **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** to:

1. Create a Supabase project
2. `npx supabase db push`
3. Set Edge Function secrets
4. Deploy `api` and `poll-balances`
5. Schedule the poller every 15 minutes

API base:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/api
```

Default admin (change after first login):

- Email: `admin@rechargealert.local`
- Password: `admin123`

### 2. Admin panel

```bash
cd admin
cp .env.example .env   # set VITE_API_BASE to your Supabase api URL
npm install
nvm use 22
npm run dev
```

Opens on `http://localhost:9001`

### 3. Mobile (web / Capacitor)

```bash
cd mobile
cp .env.example .env   # set VITE_API_BASE to your Supabase api URL
npm install
nvm use 22
npm run dev                 # SPA on http://localhost:9000
npm run dev:android         # Capacitor + Android Studio
```

## App flow

1. User **registers / logs in** via DESCO portal APIs (proxied by Edge Function `api`).
2. Backend stores the user as **`PENDING`**.
3. Admin **approves** the user in the admin panel.
4. User configures **recharge alert** (threshold, email, push).
5. Cron invokes `poll-balances`, which calls DESCO `GET /accounts/{id}/balance` and sends email/push when below threshold.

## Secrets (Supabase Edge)

| Secret | Purpose |
|--------|---------|
| `JWT_SECRET` | App JWT signing |
| `CREDENTIALS_KEY` | AES key for stored DESCO passwords (32 chars) |
| `DESCO_BASE_URL` | Default `https://prepaid.desco.org.bd/api` |
| `CRON_SECRET` | Protects `poll-balances` |
| `RESEND_API_KEY` | Email alerts (free Resend plan) |
| `SMTP_FROM` | From address for Resend |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service-account JSON for FCM |

## Optional: local Express backend

`backend/` (Express + Prisma + SQLite) still works for offline debugging. Prefer Supabase for deployment so you stay on the free tier without a VPS.

```bash
cd backend && npm install && npm run db:setup && npm run dev
```

## Push (FCM)

See [docs/PUSH_FCM_SETUP.md](docs/PUSH_FCM_SETUP.md). Native Android needs `google-services.json`.
