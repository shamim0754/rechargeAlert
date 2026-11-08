# Firebase secrets (do not commit real JSON)

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Create / select project **rechargealert** (or any name)
3. Project settings → **Service accounts** → **Generate new private key**
4. Save the file here as:

```text
backend/secrets/firebase-service-account.json
```

5. Set in `backend/.env`:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/app/secrets/firebase-service-account.json
```

For local (non-Docker) Node:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
```

Docker Compose already mounts this folder at `/app/secrets`.
