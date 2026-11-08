import { CookieJar, DescoClient, DescoError } from './desco.ts';
import { fingerprint } from './crypto.ts';
import { sb } from './db.ts';

export async function createRegisterSession(username: string): Promise<{ sessionId: string; client: DescoClient }> {
  const sessionId = `reg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const client = new DescoClient();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await sb().from('register_sessions').insert({
    id: sessionId,
    username,
    cookies_json: client.jar.toJson(),
    expires_at: expires,
  });
  if (error) throw error;
  return { sessionId, client };
}

export async function getRegisterSession(sessionId: string, username: string): Promise<DescoClient> {
  const { data, error } = await sb()
    .from('register_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.username !== username || new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error('Registration session expired. Start again.');
  }
  return new DescoClient(CookieJar.fromJson(data.cookies_json));
}

export async function saveRegisterSession(sessionId: string, client: DescoClient): Promise<void> {
  await sb()
    .from('register_sessions')
    .update({
      cookies_json: client.jar.toJson(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .eq('id', sessionId);
}

export async function clearRegisterSession(sessionId: string): Promise<void> {
  await sb().from('register_sessions').delete().eq('id', sessionId);
}

export async function withDescoSession<T>(
  username: string,
  password: string,
  fn: (client: DescoClient) => Promise<T>,
): Promise<T> {
  const fp = await fingerprint(password);
  const { data: row } = await sb().from('desco_sessions').select('*').eq('username', username).maybeSingle();

  let client: DescoClient;
  let needLogin = true;
  if (row && row.password_fingerprint === fp) {
    client = new DescoClient(CookieJar.fromJson(row.cookies_json));
    needLogin = client.jar.cookies.length === 0;
  } else {
    client = new DescoClient();
  }

  const persist = async () => {
    await sb().from('desco_sessions').upsert({
      username,
      cookies_json: client.jar.toJson(),
      password_fingerprint: fp,
      updated_at: new Date().toISOString(),
    });
  };

  const run = () => fn(client);

  try {
    if (needLogin) {
      await client.login(username, password);
      await persist();
    }
    const result = await run();
    await persist();
    return result;
  } catch (err) {
    if (err instanceof DescoError && (err.status === 401 || err.status === 403)) {
      try {
        await client.login(username, password);
        await persist();
        const result = await run();
        await persist();
        return result;
      } catch (loginErr) {
        await sb().from('desco_sessions').delete().eq('username', username);
        throw loginErr;
      }
    }
    throw err;
  }
}
