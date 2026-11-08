import { create, getNumericDate, verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

export type AuthUser = { sub: string; role: 'user' | 'admin'; username?: string };

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('JWT_SECRET') || 'dev-secret';
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signToken(payload: AuthUser): Promise<string> {
  const key = await hmacKey();
  return create({ alg: 'HS256', typ: 'JWT' }, { ...payload, exp: getNumericDate(60 * 60 * 24 * 30) }, key);
}

export async function verifyToken(token: string): Promise<AuthUser> {
  const key = await hmacKey();
  const payload = await verify(token, key);
  return payload as unknown as AuthUser;
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7);
}
