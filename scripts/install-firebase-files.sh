#!/usr/bin/env bash
# Copy downloaded Firebase files into the project after you download them.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DL="${HOME}/Downloads"

GS=$(ls -t "$DL"/google-services.json "$DL"/google-services*.json 2>/dev/null | head -1 || true)
SA=$(ls -t "$DL"/*firebase*adminsdk*.json "$DL"/rechargealert*.json 2>/dev/null | head -1 || true)

if [[ -n "${GS:-}" ]]; then
  mkdir -p "$ROOT/mobile/src-capacitor/android/app"
  cp "$GS" "$ROOT/mobile/src-capacitor/android/app/google-services.json"
  echo "OK: google-services.json → mobile/src-capacitor/android/app/"
else
  echo "MISSING: google-services.json in ~/Downloads"
fi

if [[ -n "${SA:-}" ]]; then
  mkdir -p "$ROOT/backend/secrets"
  cp "$SA" "$ROOT/backend/secrets/firebase-service-account.json"
  echo "OK: service account → backend/secrets/firebase-service-account.json"
else
  echo "MISSING: Firebase Admin SDK JSON in ~/Downloads"
  echo "  (Firebase → Project settings → Service accounts → Generate new private key)"
fi
