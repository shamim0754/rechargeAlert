import { DescoError } from '../desco/client';
import { withDescoSession } from '../desco/sessionCache';
import { decryptSecret } from '../utils/crypto';
import { prisma } from '../utils/prisma';
import { sendEmailAlert, sendPushAlert } from '../services/notify';

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Calendar day in Asia/Dhaka for daily alert limits. */
function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function checkUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'APPROVED' || !user.monitoringEnabled) return;
  if (user.alertThresholdBdt == null) return;

  const day = todayKey();
  let alertCountToday = user.alertCountToday;
  if (user.alertCountDate !== day) {
    alertCountToday = 0;
  }
  const maxPerDay = Math.max(1, user.alertsPerDay || 1);
  if (alertCountToday >= maxPerDay) {
    console.log(`[poller] daily alert limit reached for ${user.username} (${maxPerDay}/day)`);
    return;
  }

  const password = decryptSecret(user.encryptedPassword);

  let accountId = user.descoAccountId;
  let snapshot;

  try {
    snapshot = await withDescoSession(user.username, password, async (client) => {
      if (!accountId) {
        const accounts = await client.listAccounts();
        if (!accounts[0]) {
          throw new Error('No linked DESCO account');
        }
        accountId = accounts[0].accountId;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            descoAccountId: accounts[0].accountId,
            descoAccountNo: accounts[0].accountNo || null,
            descoMeterNo: accounts[0].meterNo || null,
          },
        });
      }
      return client.getBalance(accountId!);
    });
  } catch (err) {
    if (err instanceof DescoError && err.status === 429) {
      console.warn(
        `[poller] DESCO rate-limited for ${user.username} — will retry next interval (browser can still work with existing session)`,
      );
      return;
    }
    throw err;
  }

  if (snapshot.balance == null || snapshot.timestampAvailable === false) {
    console.warn(`[poller] skipping ${user.username}: balance unavailable`);
    return;
  }

  const balance = snapshot.balance;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastBalance: balance,
      lastBalanceAt: new Date(),
      balanceSnapshotAt: snapshot.balanceSnapshotAt || null,
      descoAccountNo: snapshot.accountNo || user.descoAccountNo,
      descoMeterNo: snapshot.meterNo || user.descoMeterNo,
      alertCountToday,
      alertCountDate: day,
    },
  });

  if (balance >= user.alertThresholdBdt) {
    return;
  }

  const title = 'RechargeAlert';
  const body = `Your recharge below ${user.alertThresholdBdt}. Balance ${balance.toFixed(2)} BDT. Please recharge.`;

  if (user.alertEmail) {
    await sendEmailAlert(user.alertEmail, title, body);
  }
  if (user.fcmToken) {
    await sendPushAlert(user.fcmToken, title, body);
  } else {
    console.warn(`[poller] no FCM token for ${user.username} — push skipped`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastAlertAt: new Date(),
      alertCountToday: alertCountToday + 1,
      alertCountDate: day,
    },
  });
  console.log(
    `[poller] alerted ${user.username} balance=${balance} (${alertCountToday + 1}/${maxPerDay} today)`,
  );
}

export async function runBalancePollOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const users = await prisma.user.findMany({
      where: {
        status: 'APPROVED',
        monitoringEnabled: true,
        alertThresholdBdt: { not: null },
      },
      select: { id: true, username: true },
    });
    console.log(`[poller] checking ${users.length} user(s)`);
    for (const u of users) {
      try {
        await checkUser(u.id);
      } catch (err) {
        console.error(`[poller] failed for ${u.username}:`, err);
      }
    }
  } finally {
    running = false;
  }
}

export function startBalancePoller(): void {
  const ms = Number(process.env.POLL_INTERVAL_MS || 900000);
  console.log(`[poller] starting interval ${ms}ms`);
  // Delay first poll so we don't hit DESCO login rate limit right after app logins
  setTimeout(() => {
    void runBalancePollOnce();
  }, 60_000);
  timer = setInterval(() => {
    void runBalancePollOnce();
  }, ms);
}

export function stopBalancePoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
