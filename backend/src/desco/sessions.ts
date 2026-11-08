import { DescoClient } from './client';

type RegSession = {
  client: DescoClient;
  username: string;
  expiresAt: number;
};

const sessions = new Map<string, RegSession>();
const TTL_MS = 30 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(id);
  }
}

export function createRegisterSession(username: string): { sessionId: string; client: DescoClient } {
  prune();
  const sessionId = `reg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const client = new DescoClient();
  sessions.set(sessionId, {
    client,
    username,
    expiresAt: Date.now() + TTL_MS,
  });
  return { sessionId, client };
}

export function getRegisterSession(sessionId: string, username: string): DescoClient {
  prune();
  const s = sessions.get(sessionId);
  if (!s || s.username !== username) {
    throw new Error('Registration session expired. Start again.');
  }
  s.expiresAt = Date.now() + TTL_MS;
  return s.client;
}

export function clearRegisterSession(sessionId: string) {
  sessions.delete(sessionId);
}
