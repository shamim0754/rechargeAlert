import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { alertsRouter } from './routes/alerts';
import { balanceRouter } from './routes/balance';
import { startBalancePoller } from './worker/balancePoller';

const app = express();
const port = Number(process.env.PORT || 3000);

const origins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'rechargealert-backend' });
});

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/alerts', alertsRouter);
app.use('/balance', balanceRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'SERVER', message: 'Unexpected error' });
});

app.listen(port, () => {
  console.log(`RechargeAlert API on http://localhost:${port}`);
  startBalancePoller();
});
