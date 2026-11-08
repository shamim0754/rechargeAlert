# Push notifications (FCM) — free Spark plan

FCM does **not** require a paid Firebase plan for basic push.

## A. Firebase project (you sign in with Google)

1. Open https://console.firebase.google.com/ and sign in
2. **Add project** → name e.g. `rechargealert`
3. Skip Analytics if you want

### Backend service account
1. ⚙️ Project settings → **Service accounts**
2. **Generate new private key** → download JSON
3. Save as `backend/secrets/firebase-service-account.json`

### Android app
1. Project overview → **Add app** → Android
2. Android package name: `bd.rechargealert.app`
3. App nickname: `RechargeAlert`
4. Download `google-services.json`
5. Save as:

```text
mobile/src-capacitor/android/app/google-services.json
```

### iOS app (optional)
1. Add iOS app with your bundle id (same as Capacitor app id if configured)
2. Download `GoogleService-Info.plist` → place under iOS App folder
3. Apple Developer account required for APNs (Apple fee, not Firebase)

## B. Env

`backend/.env`:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
```

Docker:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/app/secrets/firebase-service-account.json
```

## C. Verify

1. Restart backend / `docker compose up -d`
2. Install Android build on a device/emulator **with Google Play**
3. Login → app registers FCM token → `POST /alerts/push-token`
4. When balance &lt; threshold, backend sends push via Admin SDK
