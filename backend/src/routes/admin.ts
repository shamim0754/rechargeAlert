import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { requireAdmin, signToken } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.post('/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', message: parsed.error.message });
    return;
  }

  const admin = await prisma.admin.findUnique({ where: { email: parsed.data.email } });
  if (!admin || !(await bcrypt.compare(parsed.data.password, admin.passwordHash))) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    return;
  }

  const token = signToken({ sub: admin.id, role: 'admin', username: admin.email });
  res.json({ token, admin: { id: admin.id, email: admin.email } });
});

adminRouter.get('/users', requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      status: true,
      monitoringEnabled: true,
      alertThresholdBdt: true,
      alertEmail: true,
      descoAccountId: true,
      descoAccountNo: true,
      descoMeterNo: true,
      lastBalance: true,
      lastBalanceAt: true,
      lastAlertAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ users });
});

adminRouter.post('/users/:id/approve', requireAdmin, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status: 'APPROVED' },
  });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      status: user.status,
      monitoringEnabled: user.monitoringEnabled,
    },
  });
});

adminRouter.post('/users/:id/revoke', requireAdmin, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status: 'REVOKED', monitoringEnabled: false },
  });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      status: user.status,
      monitoringEnabled: user.monitoringEnabled,
    },
  });
});
