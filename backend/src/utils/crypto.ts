import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function keyFromEnv(): Buffer {
  const raw = process.env.CREDENTIALS_KEY || '';
  const buf = Buffer.from(raw.padEnd(32, '0').slice(0, 32), 'utf8');
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyFromEnv(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted payload');
  }
  const decipher = crypto.createDecipheriv(ALGO, keyFromEnv(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
