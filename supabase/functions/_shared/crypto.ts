function keyBytes(): Uint8Array {
  const raw = Deno.env.get('CREDENTIALS_KEY') || '';
  const padded = (raw + '0'.repeat(32)).slice(0, 32);
  return new TextEncoder().encode(padded);
}

function toHex(buf: Uint8Array): string {
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes(), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey();
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  );
  // WebCrypto appends 16-byte auth tag at the end
  const tag = cipher.slice(cipher.length - 16);
  const data = cipher.slice(0, cipher.length - 16);
  return `${toHex(iv)}:${toHex(tag)}:${toHex(data)}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted payload');
  const iv = fromHex(ivHex);
  const tag = fromHex(tagHex);
  const data = fromHex(dataHex);
  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data);
  combined.set(tag, data.length);
  const key = await importKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
  return new TextDecoder().decode(plain);
}

export async function fingerprint(password: string): Promise<string> {
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return toHex(new Uint8Array(dig));
}
