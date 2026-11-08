type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const unsigned = `${enc(header)}.${enc(claim)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const jwt =
    `${unsigned}.` +
    btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const tokenRes = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Google token error: ${JSON.stringify(tokenJson)}`);
  return tokenJson.access_token as string;
}

function loadServiceAccount(): ServiceAccount | null {
  const inline = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (inline) {
    try {
      return JSON.parse(inline) as ServiceAccount;
    } catch {
      console.warn('[notify] invalid FIREBASE_SERVICE_ACCOUNT_JSON');
    }
  }
  return null;
}

export async function sendPushAlert(token: string, title: string, body: string): Promise<boolean> {
  const sa = loadServiceAccount();
  if (!sa) {
    console.log(`[notify:push:dry-run] token=${token.slice(0, 12)}… title=${title} ${body}`);
    return false;
  }
  const access = await getAccessToken(sa);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { type: 'low_balance' },
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    console.warn('[notify] FCM failed:', err);
    return false;
  }
  return true;
}

/** Email via Resend HTTP API (SMTP sockets are unreliable on Edge). */
export async function sendEmailAlert(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('SMTP_FROM') || 'RechargeAlert <onboarding@resend.dev>';
  if (!apiKey) {
    console.log(`[notify:email:dry-run] to=${to} subject=${subject} ${text}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    console.warn('[notify] Resend failed:', await res.text());
    return false;
  }
  return true;
}
