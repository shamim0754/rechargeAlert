import { DescoError } from './desco.ts';
import { decryptSecret } from './crypto.ts';
import { DbUser, sb } from './db.ts';
import { withDescoSession } from './sessions.ts';
import { sendEmailAlert, sendPushAlert } from './notify.ts';

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function checkUser(user: DbUser): Promise<void> {
  if (user.status !== 'APPROVED' || !user.monitoring_enabled) return;
  if (user.alert_threshold_bdt == null) return;

  const day = todayKey();
  let alertCountToday = user.alert_count_today;
  if (user.alert_count_date !== day) alertCountToday = 0;
  const maxPerDay = Math.max(1, user.alerts_per_day || 1);
  if (alertCountToday >= maxPerDay) {
    console.log(`[poller] daily alert limit reached for ${user.username} (${maxPerDay}/day)`);
    return;
  }

  const password = await decryptSecret(user.encrypted_password);
  let accountId = user.desco_account_id;

  let snapshot;
  try {
    snapshot = await withDescoSession(user.username, password, async (client) => {
      if (!accountId) {
        const accounts = await client.listAccounts();
        if (!accounts[0]) throw new Error('No linked DESCO account');
        accountId = accounts[0].accountId;
        await sb()
          .from('users')
          .update({
            desco_account_id: accounts[0].accountId,
            desco_account_no: accounts[0].accountNo || null,
            desco_meter_no: accounts[0].meterNo || null,
          })
          .eq('id', user.id);
      }
      return client.getBalance(accountId!);
    });
  } catch (err) {
    if (err instanceof DescoError && err.status === 429) {
      console.warn(`[poller] DESCO rate-limited for ${user.username}`);
      return;
    }
    throw err;
  }

  if (snapshot.balance == null || snapshot.timestampAvailable === false) {
    console.warn(`[poller] skipping ${user.username}: balance unavailable`);
    return;
  }

  const balance = snapshot.balance;
  await sb()
    .from('users')
    .update({
      last_balance: balance,
      last_balance_at: new Date().toISOString(),
      balance_snapshot_at: snapshot.balanceSnapshotAt || null,
      desco_account_no: snapshot.accountNo || user.desco_account_no,
      desco_meter_no: snapshot.meterNo || user.desco_meter_no,
      alert_count_today: alertCountToday,
      alert_count_date: day,
    })
    .eq('id', user.id);

  if (balance >= user.alert_threshold_bdt) return;

  const title = 'RechargeAlert';
  const body =
    `Your recharge below ${user.alert_threshold_bdt}. Balance ${balance.toFixed(2)} BDT. Please recharge.`;

  if (user.alert_email) await sendEmailAlert(user.alert_email, title, body);
  if (user.fcm_token) await sendPushAlert(user.fcm_token, title, body);
  else console.warn(`[poller] no FCM token for ${user.username} — push skipped`);

  await sb()
    .from('users')
    .update({
      last_alert_at: new Date().toISOString(),
      alert_count_today: alertCountToday + 1,
      alert_count_date: day,
    })
    .eq('id', user.id);

  console.log(
    `[poller] alerted ${user.username} balance=${balance} (${alertCountToday + 1}/${maxPerDay} today)`,
  );
}

export async function runBalancePollOnce(): Promise<{ checked: number }> {
  const { data: users, error } = await sb()
    .from('users')
    .select('*')
    .eq('status', 'APPROVED')
    .eq('monitoring_enabled', true)
    .not('alert_threshold_bdt', 'is', null);

  if (error) throw error;
  const list = (users || []) as DbUser[];
  console.log(`[poller] checking ${list.length} user(s)`);
  for (const u of list) {
    try {
      await checkUser(u);
    } catch (err) {
      console.error(`[poller] failed for ${u.username}:`, err);
    }
  }
  return { checked: list.length };
}
