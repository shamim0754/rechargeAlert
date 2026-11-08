# RechargeAlert

Unofficial DESCO prepaid low-balance / recharge alert app.

- **Mobile:** Quasar + Capacitor (Android & iOS) — `mobile/`
- **Admin:** Quasar web SPA — `admin/`
- **Backend:** Node.js + Express + Prisma + SQLite — `backend/`

This project proxies DESCO prepaid portal APIs from a backend (avoids browser CORS). It is **not affiliated with DESCO**. Use only accounts you own. Portal APIs can change without notice.

## Requirements

- Node.js **22.12+** (Quasar / `@quasar/app-vite` requirement)
- For native builds: Android Studio and/or Xcode

## Quick start

### 1. Backend

**Local (Node):**

```bash
cd backend
cp .env.example .env   # already present as .env for local dev
npm install
npm run db:setup
npm run dev
```

**Docker Compose:**

```bash
# ensure backend/.env exists with secrets (SMTP, JWT, etc.)
docker compose up -d --build
docker compose logs -f api
```

API: `http://localhost:3000`  
SQLite data is stored in Docker volume `rechargealert_data`.

```bash
docker compose down          # stop
docker compose down -v       # stop + wipe DB volume
```

Default admin:

- Email: `admin@rechargealert.local`
- Password: `admin123`

### 2. Admin panel

```bash
cd admin
npm install
npm run dev
```

Opens on `http://localhost:9001`

### 3. Mobile (web / Capacitor)

```bash
cd mobile
npm install
npm run dev                 # SPA on http://localhost:9000
# Native:
# quasar dev -m capacitor -T android
# quasar dev -m capacitor -T ios
```

## App flow

1. User **registers / logs in** via DESCO portal APIs (proxied by backend).
2. Backend stores the user as **`PENDING`**.
3. Admin **approves** the user in the admin panel.
4. User configures **recharge alert** (threshold, email, push).
5. Backend poller calls `GET /api/accounts/{accountId}/balance` (not realtime-balance) and sends email/push when below threshold.

## Environment variables (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Prisma SQLite URL |
| `JWT_SECRET` | JWT signing secret |
| `CREDENTIALS_KEY` | AES key material for DESCO password encryption |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeded admin |
| `POLL_INTERVAL_MS` | Balance poll interval (default 15 min) |
| `SMTP_*` | Nodemailer SMTP for email alerts |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Optional path to Firebase service account JSON for FCM |
| `CORS_ORIGIN` | Allowed front-end origins |
| `DESCO_BASE_URL` | Default `https://prepaid.desco.org.bd/api` |

Without SMTP / Firebase configured, alerts are logged as dry-run on the server console.

## Push notifications (FCM)

1. Create a Firebase project and download a service account JSON.
2. Set `FIREBASE_SERVICE_ACCOUNT_PATH` on the backend.
3. Configure Capacitor Push Notifications / FCM for Android & iOS native projects (see Capacitor docs).
4. On device login, the app registers and uploads the FCM token to `POST /alerts/push-token`.

## API sketch

- `POST /auth/register/start|verify|set-password`
- `POST /auth/login`, `GET /auth/me`
- `GET /balance/current`
- `PUT /alerts/settings`, `POST /alerts/push-token`
- `POST /admin/login`, `GET /admin/users`
- `POST /admin/users/:id/approve|revoke`
# rechargeAlert
