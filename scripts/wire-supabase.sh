#!/usr/bin/env bash
# Wire RechargeAlert to an existing Supabase project.
# Requires: SUPABASE_ACCESS_TOKEN and PROJECT_REF
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens)}"
: "${PROJECT_REF:?Set PROJECT_REF (Project Settings → General → Reference ID)}"

export SUPABASE_ACCESS_TOKEN

BACKEND_ENV="$ROOT/backend/.env"
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source <(grep -E '^(JWT_SECRET|CREDENTIALS_KEY|DESCO_BASE_URL|SMTP_FROM)=' "$BACKEND_ENV")
set +a

CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 24)}"
FIREBASE_JSON="$ROOT/backend/secrets/firebase-service-account.json"
test -f "$FIREBASE_JSON"

echo "==> Link project $PROJECT_REF"
npx supabase link --project-ref "$PROJECT_REF" --yes

echo "==> Push DB migrations"
npx supabase db push --yes

echo "==> Set Edge secrets"
SECRET_ARGS=(
  "JWT_SECRET=${JWT_SECRET}"
  "CREDENTIALS_KEY=${CREDENTIALS_KEY}"
  "DESCO_BASE_URL=${DESCO_BASE_URL:-https://prepaid.desco.org.bd/api}"
  "CRON_SECRET=${CRON_SECRET}"
  "SMTP_FROM=${SMTP_FROM:-RechargeAlert <onboarding@resend.dev>}"
  "FIREBASE_SERVICE_ACCOUNT_JSON=$(cat "$FIREBASE_JSON")"
)
if [[ -n "${RESEND_API_KEY:-}" ]]; then
  SECRET_ARGS+=("RESEND_API_KEY=${RESEND_API_KEY}")
fi
npx supabase secrets set "${SECRET_ARGS[@]}"

echo "==> Deploy functions"
npx supabase functions deploy api --no-verify-jwt
npx supabase functions deploy poll-balances --no-verify-jwt

API_BASE="https://${PROJECT_REF}.supabase.co/functions/v1/api"
echo "VITE_API_BASE=${API_BASE}" > "$ROOT/mobile/.env"
echo "VITE_API_BASE=${API_BASE}" > "$ROOT/admin/.env"

mkdir -p "$ROOT/backend/secrets"
echo "$CRON_SECRET" > "$ROOT/backend/secrets/cron-secret.txt"

echo ""
echo "OK — API: ${API_BASE}"
echo "CRON_SECRET saved to backend/secrets/cron-secret.txt"
echo "Schedule poll-balances every 15m with header x-cron-secret: $(cat "$ROOT/backend/secrets/cron-secret.txt")"
echo "Health check:"
curl -sS "${API_BASE}/health" || true
echo
