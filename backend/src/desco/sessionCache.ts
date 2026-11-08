import { DescoClient, DescoError } from './client';

type Cached = {
  client: DescoClient;
  password: string;
  lastLoginAt: number;
};

const cache = new Map<string, Cached>();

/** Reuse DESCO cookie session; only login when needed (avoids login rate limits). */
export async function withDescoSession<T>(
  username: string,
  password: string,
  fn: (client: DescoClient) => Promise<T>,
): Promise<T> {
  let entry = cache.get(username);
  if (!entry || entry.password !== password) {
    entry = { client: new DescoClient(), password, lastLoginAt: 0 };
    cache.set(username, entry);
  }

  const run = () => fn(entry!.client);

  try {
    // Prefer existing cookies if we already logged in this process
    if (entry.lastLoginAt === 0) {
      await entry.client.login(username, password);
      entry.lastLoginAt = Date.now();
    }
    return await run();
  } catch (err) {
    if (err instanceof DescoError && (err.status === 401 || err.status === 403)) {
      try {
        await entry.client.login(username, password);
        entry.lastLoginAt = Date.now();
        return await run();
      } catch (loginErr) {
        cache.delete(username);
        throw loginErr;
      }
    }
    throw err;
  }
}

export function clearDescoSession(username: string) {
  cache.delete(username);
}
