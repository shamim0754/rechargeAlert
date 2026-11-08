import { Router } from 'express';
import { z } from 'zod';
import { DescoClient, DescoError } from '../desco/client';
import {
  clearRegisterSession,
  createRegisterSession,
  getRegisterSession,
} from '../desco/sessions';
import { encryptSecret } from '../utils/crypto';
import { prisma } from '../utils/prisma';
import { requireAuth, signToken } from '../middleware/auth';

export const authRouter = Router();

function publicUser(user: {
  id: string;
  username: string;
  status: string;
  monitoringEnabled: boolean;
  alertThresholdBdt: number | null;
  alertEmail: string | null;
  alertsPerDay: number;
  descoAccountId: number | null;
  descoAccountNo: string | null;
  descoMeterNo: string | null;
  lastBalance: number | null;
  lastBalanceAt: Date | null;
  balanceSnapshotAt: string | null;
}) {
  return {
    id: user.id,
    username: user.username,
    status: user.status,
    monitoringEnabled: user.monitoringEnabled,
    alertThresholdBdt: user.alertThresholdBdt,
    alertEmail: user.alertEmail,
    alertsPerDay: user.alertsPerDay,
    descoAccountId: user.descoAccountId,
    descoAccountNo: user.descoAccountNo,
    descoMeterNo: user.descoMeterNo,
    lastBalance: user.lastBalance,
    lastBalanceAt: user.lastBalanceAt,
    balanceSnapshotAt: user.balanceSnapshotAt,
    canConfigureAlerts: user.status === 'APPROVED',
  };
}

async function syncAccounts(client: DescoClient, userId: string) {
  try {
    const accounts = await client.listAccounts();
    const primary =
      accounts.find((a) => a.linkStatus === 'ACTIVE' || a.status === 'ACTIVE') || accounts[0];
    if (primary) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          descoAccountId: primary.accountId,
          descoAccountNo: primary.accountNo || null,
          descoMeterNo: primary.meterNo || null,
        },
      });
    }
  } catch (err) {
    console.warn('[auth] listAccounts failed:', err);
  }
}

authRouter.post('/register/start', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    otpMobile: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', message: parsed.error.message });
    return;
  }
  try {
    const { sessionId, client } = createRegisterSession(parsed.data.username);
    const data = await client.registerStart(parsed.data.username, parsed.data.otpMobile);
    res.json({ ok: true, sessionId, data });
  } catch (err) {
    if (err instanceof DescoError) {
      res.status(err.status).json({ error: 'DESCO', message: err.message, details: err.body });
      return;
    }
    res.status(500).json({ error: 'SERVER', message: 'Register start failed' });
  }
});

authRouter.post('/register/verify', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    code: z.string().min(4),
    sessionId: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', message: parsed.error.message });
    return;
  }
  try {
    const client = getRegisterSession(parsed.data.sessionId, parsed.data.username);
    const data = await client.registerVerify(parsed.data.username, parsed.data.code);
    res.json({ ok: true, sessionId: parsed.data.sessionId, data });
  } catch (err) {
    if (err instanceof DescoError) {
      res.status(err.status).json({ error: 'DESCO', message: err.message, details: err.body });
      return;
    }
    res.status(400).json({
      error: 'SESSION',
      message: err instanceof Error ? err.message : 'Register verify failed',
    });
  }
});

authRouter.post('/register/set-password', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
    sessionId: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', message: parsed.error.message });
    return;
  }
  try {
    const client = getRegisterSession(parsed.data.sessionId, parsed.data.username);
    await client.registerSetPassword(parsed.data.username, parsed.data.password);
    clearRegisterSession(parsed.data.sessionId);

    const user = await prisma.user.upsert({
      where: { username: parsed.data.username },
      create: {
        username: parsed.data.username,
        encryptedPassword: encryptSecret(parsed.data.password),
        status: 'PENDING',
        monitoringEnabled: false,
      },
      update: {
        encryptedPassword: encryptSecret(parsed.data.password),
      },
    });

    res.json({
      ok: true,
      message:
        'Account created on DESCO portal. Sign in after admin approval to configure alerts.',
      user: publicUser(user),
    });
  } catch (err) {
    if (err instanceof DescoError) {
      res.status(err.status).json({ error: 'DESCO', message: err.message, details: err.body });
      return;
    }
    console.error(err);
    res.status(400).json({
      error: 'SESSION',
      message: err instanceof Error ? err.message : 'Set password failed',
    });
  }
});

authRouter.post('/login', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', message: parsed.error.message });
    return;
  }

  try {
    const client = new DescoClient();
    await client.login(parsed.data.username, parsed.data.password);

    const user = await prisma.user.upsert({
      where: { username: parsed.data.username },
      create: {
        username: parsed.data.username,
        encryptedPassword: encryptSecret(parsed.data.password),
        status: 'PENDING',
        monitoringEnabled: false,
      },
      update: {
        encryptedPassword: encryptSecret(parsed.data.password),
      },
    });

    await syncAccounts(client, user.id);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const token = signToken({ sub: fresh.id, role: 'user', username: fresh.username });
    res.json({ token, user: publicUser(fresh) });
  } catch (err) {
    if (err instanceof DescoError) {
      res.status(err.status === 401 ? 401 : err.status).json({
        error: 'DESCO',
        message: err.message || 'Invalid DESCO credentials',
        details: err.body,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'SERVER', message: 'Login failed' });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  if (req.auth?.role !== 'user') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'User token required' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.auth.sub } });
  if (!user) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    return;
  }
  res.json({ user: publicUser(user) });
});
