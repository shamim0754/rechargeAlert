import nodemailer from 'nodemailer';

let firebaseApp: import('firebase-admin').app.App | null = null;

async function getFirebase() {
  if (firebaseApp) return firebaseApp;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) return null;
  try {
    const admin = await import('firebase-admin');
    const fs = await import('fs');
    if (!fs.existsSync(path)) return null;
    const cred = JSON.parse(fs.readFileSync(path, 'utf8'));
    firebaseApp = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(cred) });
    return firebaseApp;
  } catch (err) {
    console.warn('[notify] Firebase init skipped:', err);
    return null;
  }
}

function mailer() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          // Gmail app passwords are often pasted with spaces
          pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
        }
      : undefined,
  });
}

export async function sendEmailAlert(to: string, subject: string, text: string): Promise<boolean> {
  const transport = mailer();
  if (!transport) {
    console.log(`[notify:email:dry-run] to=${to} subject=${subject} ${text}`);
    return false;
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM || 'RechargeAlert <noreply@rechargealert.local>',
    to,
    subject,
    text,
  });
  return true;
}

export async function sendPushAlert(token: string, title: string, body: string): Promise<boolean> {
  const app = await getFirebase();
  if (!app) {
    console.log(`[notify:push:dry-run] token=${token.slice(0, 12)}… title=${title} ${body}`);
    return false;
  }
  const admin = await import('firebase-admin');
  await admin.messaging(app).send({
    token,
    notification: { title, body },
    data: { type: 'low_balance' },
  });
  return true;
}
