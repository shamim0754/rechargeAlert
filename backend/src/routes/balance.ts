import { Router } from 'express';
import { DescoError } from '../desco/client';
import { withDescoSession } from '../desco/sessionCache';
import { decryptSecret } from '../utils/crypto';
import { prisma } from '../utils/prisma';
import { requireAuth } from '../middleware/auth';

export const balanceRouter = Router();

balanceRouter.get('/current', requireAuth, async (req, res) => {
  if (req.auth?.role !== 'user') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'User token required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth.sub } });
  if (!user) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    return;
  }

  try {
    const password = decryptSecret(user.encryptedPassword);
    let accountId = user.descoAccountId;

    const balance = await withDescoSession(user.username, password, async (client) => {
      if (!accountId) {
        const accounts = await client.listAccounts();
        const primary = accounts[0];
        if (!primary) {
          throw Object.assign(new Error('NO_ACCOUNT'), { code: 'NO_ACCOUNT' });
        }
        accountId = primary.accountId;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            descoAccountId: primary.accountId,
            descoAccountNo: primary.accountNo || null,
            descoMeterNo: primary.meterNo || null,
          },
        });
      }
      return client.getBalance(accountId!);
    });

    const amount = typeof balance.balance === 'number' ? balance.balance : null;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastBalance: amount,
        lastBalanceAt: new Date(),
        balanceSnapshotAt: balance.balanceSnapshotAt || null,
        descoAccountNo: balance.accountNo || user.descoAccountNo,
        descoMeterNo: balance.meterNo || user.descoMeterNo,
      },
    });

    res.json({
      balance: amount,
      currency: balance.currency || 'BDT',
      stale: Boolean(balance.stale),
      timestampAvailable: balance.timestampAvailable,
      balanceSnapshotAt: balance.balanceSnapshotAt,
      readingTime: balance.readingTime,
      accountNo: updated.descoAccountNo,
      meterNo: updated.descoMeterNo,
      accountId,
      userStatus: updated.status,
      canConfigureAlerts: updated.status === 'APPROVED',
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'NO_ACCOUNT') {
      res.status(404).json({
        error: 'NO_ACCOUNT',
        message: 'No linked DESCO prepaid account. Link a meter in the DESCO portal first.',
      });
      return;
    }
    if (err instanceof DescoError) {
      res.status(err.status).json({ error: 'DESCO', message: err.message, details: err.body });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'SERVER', message: 'Failed to fetch balance' });
  }
});
