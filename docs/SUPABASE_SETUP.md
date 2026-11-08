# Supabase backend (free plan)

RechargeAlert API runs as **Supabase Edge Functions** with **Postgres** on the free Spark plan. No Docker/VPS required for the API.

## What maps where

| Old Express | Supabase |
|-------------|----------|
| SQLite + Prisma | Postgres tables (`users`, `admins`, …) |
| `/auth`, `/alerts`, `/balance`, `/admin` | Edge Function `api` |
| Balance poller interval | Edge Function `poll-balances` + cron (every 15m) |
| Gmail SMTP | [Resend](https://resend.com) free HTTP API (Edge has no reliable SMTP sockets) |
| FCM Admin SDK | FCM HTTP v1 via `FIREBASE_SERVICE_ACCOUNT_JSON` |

## 1. Create project

1. https://supabase.com/dashboard → **New project**
2. Note **Project URL** and **service_role** key (Settings → API)
3. Install CLI: `npm i -g supabase` (or `npx supabase`)

## 2. Link & migrate

```bash
cd /path/to/desco
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

## 3. Secrets (Edge Functions)

```bash
npx supabase secrets set \
  JWT_SECRET="long-random-string" \
  CREDENTIALS_KEY="32-char-secret-key-here!!!!!" \
  DESCO_BASE_URL="https://prepaid.desco.org.bd/api" \
  CRON_SECRET="another-long-random" \
  RESEND_API_KEY="re_..." \
  SMTP_FROM="RechargeAlert <you@yourdomain.com>" \
  FIREBASE_SERVICE_ACCOUNT_JSON="$(cat backend/secrets/firebase-service-account.json)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the platform.

## 4. Deploy functions

```bash
npx supabase functions deploy api --no-verify-jwt
npx supabase functions deploy poll-balances --no-verify-jwt
```

API base URL:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/api
```

## 5. Schedule poller (every 15 minutes)

Dashboard → **Edge Functions** → `poll-balances` → **Schedules**, or enable `pg_cron` + `pg_net` and run the SQL in `supabase/migrations/20260308121000_cron.sql` (uncomment and fill `PROJECT_REF` / `CRON_SECRET`).

Manual test:

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/poll-balances" \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

## 6. Point apps

`mobile/.env` and `admin/.env`:

```env
VITE_API_BASE=https://YOUR_PROJECT_REF.supabase.co/functions/v1/api
```

Restart Quasar. Vite proxies are unused when `VITE_API_BASE` is set.

Default admin (change after first login):

- Email: `admin@rechargealert.local`
- Password: `admin123`

## Local Express backend

The `backend/` Node server remains for local debugging if needed. Production path is Supabase.
