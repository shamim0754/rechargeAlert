import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { requireAuth } from '../middleware/auth';

export const alertsRouter = Router();

alertsRouter.use(requireAuth);

alertsRouter.put('/settings', async (req, res) => {
  if (req.auth?.role !== 'user') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'User token required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth.sub } });
  if (!user) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    return;
  }
  if (user.status !== 'APPROVED') {
    res.status(403).json({
      error: 'PENDING_APPROVAL',
      message: 'Admin approval required before configuring recharge alerts.',
    });
    return;
  }

  const schema = z.object({
    alertThresholdBdt: z.number().positive(),
    alertEmail: z.string().email().optional().nullable(),
    alertsPerDay: z.number().int().min(1).max(24).optional(),
    fcmToken: z.string().optional().nullable(),
    monitoringEnabled: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', message: parsed.error.message });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      alertThresholdBdt: parsed.data.alertThresholdBdt,
      alertEmail: parsed.data.alertEmail ?? user.alertEmail,
      alertsPerDay:
        parsed.data.alertsPerDay === undefined ? user.alertsPerDay : parsed.data.alertsPerDay,
      fcmToken: parsed.data.fcmToken === undefined ? user.fcmToken : parsed.data.fcmToken,
      monitoringEnabled:
        parsed.data.monitoringEnabled === undefined
          ? true
          : parsed.data.monitoringEnabled,
    },
  });

  res.json({
    settings: {
      alertThresholdBdt: updated.alertThresholdBdt,
      alertEmail: updated.alertEmail,
      alertsPerDay: updated.alertsPerDay,
      monitoringEnabled: updated.monitoringEnabled,
      hasFcmToken: Boolean(updated.fcmToken),
    },
  });
});

alertsRouter.post('/push-token', async (req, res) => {
  if (req.auth?.role !== 'user') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'User token required' });
    return;
  }
  const schema = z.object({ fcmToken: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', message: parsed.error.message });
    return;
  }
  await prisma.user.update({
    where: { id: req.auth.sub },
    data: { fcmToken: parsed.data.fcmToken },
  });
  res.json({ ok: true });
});
