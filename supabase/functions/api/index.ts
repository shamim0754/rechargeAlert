import bcrypt from 'npm:bcryptjs@2.4.3';
import { corsHeaders, json, optionsResponse } from '../_shared/cors.ts';
import { encryptSecret, decryptSecret, fingerprint } from '../_shared/crypto.ts';
import { DescoClient, DescoError } from '../_shared/desco.ts';
import { DbUser, publicUser, sb } from '../_shared/db.ts';
import { AuthUser, bearer, signToken, verifyToken } from '../_shared/jwt.ts';
import {
  clearRegisterSession,
  createRegisterSession,
  getRegisterSession,
  saveRegisterSession,
  withDescoSession,
} from '../_shared/sessions.ts';

function routePath(url: URL): string {
  const p = url.pathname;
  const markers = ['/functions/v1/api', '/api'];
  for (const m of markers) {
    const i = p.indexOf(m);
    if (i >= 0) {
      const rest = p.slice(i + m.length);
      return rest || '/';
    }
  }
  return p || '/';
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function requireAuth(req: Request): Promise<AuthUser | Response> {
  const token = bearer(req);
  if (!token) {
    return json({ error: 'AUTHENTICATION_REQUIRED', message: 'Sign in required.' }, 401);
  }
  try {
    return await verifyToken(token);
  } catch {
    return json({ error: 'AUTHENTICATION_REQUIRED', message: 'Invalid or expired token.' }, 401);
  }
}

async function syncAccounts(client: DescoClient, userId: string) {
  try {
    const accounts = await client.listAccounts();
    const primary =
      accounts.find((a) => a.linkStatus === 'ACTIVE' || a.status === 'ACTIVE') || accounts[0];
    if (primary) {
      await sb()
        .from('users')
        .update({
          desco_account_id: primary.accountId,
          desco_account_no: primary.accountNo || null,
          desco_meter_no: primary.meterNo || null,
        })
        .eq('id', userId);
    }
  } catch (err) {
    console.warn('[auth] listAccounts failed:', err);
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();

  const url = new URL(req.url);
  const path = routePath(url);
  const method = req.method.toUpperCase();

  if (method === 'GET' && path === '/health') {
    return json({ ok: true, service: 'rechargealert-supabase' });
  }

  // --- Auth / register ---
  if (method === 'POST' && path === '/auth/register/start') {
    const body = await readJson(req);
    const username = String(body.username || '');
    if (username.length < 3) return json({ error: 'VALIDATION', message: 'username required' }, 400);
    try {
      const { sessionId, client } = await createRegisterSession(username);
      const data = await client.registerStart(username, body.otpMobile ? String(body.otpMobile) : undefined);
      await saveRegisterSession(sessionId, client);
      return json({ ok: true, sessionId, data });
    } catch (err) {
      if (err instanceof DescoError) {
        return json({ error: 'DESCO', message: err.message, details: err.body }, err.status);
      }
      return json({ error: 'SERVER', message: 'Register start failed' }, 500);
    }
  }

  if (method === 'POST' && path === '/auth/register/verify') {
    const body = await readJson(req);
    const username = String(body.username || '');
    const code = String(body.code || '');
    const sessionId = String(body.sessionId || '');
    try {
      const client = await getRegisterSession(sessionId, username);
      const data = await client.registerVerify(username, code);
      await saveRegisterSession(sessionId, client);
      return json({ ok: true, sessionId, data });
    } catch (err) {
      if (err instanceof DescoError) {
        return json({ error: 'DESCO', message: err.message, details: err.body }, err.status);
      }
      return json({
        error: 'SESSION',
        message: err instanceof Error ? err.message : 'Register verify failed',
      }, 400);
    }
  }

  if (method === 'POST' && path === '/auth/register/set-password') {
    const body = await readJson(req);
    const username = String(body.username || '');
    const password = String(body.password || '');
    const sessionId = String(body.sessionId || '');
    try {
      const client = await getRegisterSession(sessionId, username);
      await client.registerSetPassword(username, password);
      await clearRegisterSession(sessionId);
      const enc = await encryptSecret(password);
      const { data: existing } = await sb().from('users').select('*').eq('username', username).maybeSingle();
      let user: DbUser;
      if (existing) {
        const { data, error } = await sb()
          .from('users')
          .update({ encrypted_password: enc })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw error;
        user = data as DbUser;
      } else {
        const { data, error } = await sb()
          .from('users')
          .insert({
            username,
            encrypted_password: enc,
            status: 'PENDING',
            monitoring_enabled: false,
          })
          .select('*')
          .single();
        if (error) throw error;
        user = data as DbUser;
      }
      return json({
        ok: true,
        message:
          'Account created on DESCO portal. Sign in after admin approval to configure alerts.',
        user: publicUser(user),
      });
    } catch (err) {
      if (err instanceof DescoError) {
        return json({ error: 'DESCO', message: err.message, details: err.body }, err.status);
      }
      console.error(err);
      return json({
        error: 'SESSION',
        message: err instanceof Error ? err.message : 'Set password failed',
      }, 400);
    }
  }

  if (method === 'POST' && path === '/auth/login') {
    const body = await readJson(req);
    const username = String(body.username || '');
    const password = String(body.password || '');
    if (username.length < 3 || !password) {
      return json({ error: 'VALIDATION', message: 'username/password required' }, 400);
    }
    try {
      const client = new DescoClient();
      await client.login(username, password);
      const enc = await encryptSecret(password);
      const { data: existing } = await sb().from('users').select('*').eq('username', username).maybeSingle();
      let user: DbUser;
      if (existing) {
        const { data, error } = await sb()
          .from('users')
          .update({ encrypted_password: enc })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw error;
        user = data as DbUser;
      } else {
        const { data, error } = await sb()
          .from('users')
          .insert({
            username,
            encrypted_password: enc,
            status: 'PENDING',
            monitoring_enabled: false,
          })
          .select('*')
          .single();
        if (error) throw error;
        user = data as DbUser;
      }
      await syncAccounts(client, user.id);
      await sb().from('desco_sessions').upsert({
        username,
        cookies_json: client.jar.toJson(),
        password_fingerprint: await fingerprint(password),
        updated_at: new Date().toISOString(),
      });
      const { data: fresh } = await sb().from('users').select('*').eq('id', user.id).single();
      const token = await signToken({
        sub: fresh!.id,
        role: 'user',
        username: fresh!.username,
      });
      return json({ token, user: publicUser(fresh as DbUser) });
    } catch (err) {
      if (err instanceof DescoError) {
        return json(
          { error: 'DESCO', message: err.message || 'Invalid DESCO credentials', details: err.body },
          err.status === 401 ? 401 : err.status,
        );
      }
      console.error(err);
      return json({ error: 'SERVER', message: 'Login failed' }, 500);
    }
  }

  if (method === 'GET' && path === '/auth/me') {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    if (auth.role !== 'user') return json({ error: 'FORBIDDEN', message: 'User token required' }, 403);
    const { data: user } = await sb().from('users').select('*').eq('id', auth.sub).maybeSingle();
    if (!user) return json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    return json({ user: publicUser(user as DbUser) });
  }

  // --- Alerts ---
  if (method === 'PUT' && path === '/alerts/settings') {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    if (auth.role !== 'user') return json({ error: 'FORBIDDEN', message: 'User token required' }, 403);
    const { data: user } = await sb().from('users').select('*').eq('id', auth.sub).maybeSingle();
    if (!user) return json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    if (user.status !== 'APPROVED') {
      return json({
        error: 'PENDING_APPROVAL',
        message: 'Admin approval required before configuring recharge alerts.',
      }, 403);
    }
    const body = await readJson(req);
    const threshold = Number(body.alertThresholdBdt);
    if (!(threshold > 0)) return json({ error: 'VALIDATION', message: 'alertThresholdBdt required' }, 400);
    const patch: Record<string, unknown> = {
      alert_threshold_bdt: threshold,
      monitoring_enabled:
        body.monitoringEnabled === undefined ? true : Boolean(body.monitoringEnabled),
    };
    if (body.alertEmail !== undefined) patch.alert_email = body.alertEmail;
    if (body.alertsPerDay !== undefined) patch.alerts_per_day = Number(body.alertsPerDay);
    if (body.fcmToken !== undefined) patch.fcm_token = body.fcmToken;
    const { data: updated, error } = await sb()
      .from('users')
      .update(patch)
      .eq('id', user.id)
      .select('*')
      .single();
    if (error) return json({ error: 'SERVER', message: error.message }, 500);
    return json({
      settings: {
        alertThresholdBdt: updated.alert_threshold_bdt,
        alertEmail: updated.alert_email,
        alertsPerDay: updated.alerts_per_day,
        monitoringEnabled: updated.monitoring_enabled,
        hasFcmToken: Boolean(updated.fcm_token),
      },
    });
  }

  if (method === 'POST' && path === '/alerts/push-token') {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    if (auth.role !== 'user') return json({ error: 'FORBIDDEN', message: 'User token required' }, 403);
    const body = await readJson(req);
    const fcmToken = String(body.fcmToken || '');
    if (fcmToken.length < 10) return json({ error: 'VALIDATION', message: 'fcmToken required' }, 400);
    await sb().from('users').update({ fcm_token: fcmToken }).eq('id', auth.sub);
    return json({ ok: true });
  }

  // --- Balance ---
  if (method === 'GET' && path === '/balance/current') {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    if (auth.role !== 'user') return json({ error: 'FORBIDDEN', message: 'User token required' }, 403);
    const { data: user } = await sb().from('users').select('*').eq('id', auth.sub).maybeSingle();
    if (!user) return json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    try {
      const password = await decryptSecret((user as DbUser).encrypted_password);
      let accountId = (user as DbUser).desco_account_id;
      const balance = await withDescoSession((user as DbUser).username, password, async (client) => {
        if (!accountId) {
          const accounts = await client.listAccounts();
          const primary = accounts[0];
          if (!primary) {
            throw Object.assign(new Error('NO_ACCOUNT'), { code: 'NO_ACCOUNT' });
          }
          accountId = primary.accountId;
          await sb()
            .from('users')
            .update({
              desco_account_id: primary.accountId,
              desco_account_no: primary.accountNo || null,
              desco_meter_no: primary.meterNo || null,
            })
            .eq('id', (user as DbUser).id);
        }
        return client.getBalance(accountId!);
      });
      const amount = typeof balance.balance === 'number' ? balance.balance : null;
      const { data: updated } = await sb()
        .from('users')
        .update({
          last_balance: amount,
          last_balance_at: new Date().toISOString(),
          balance_snapshot_at: balance.balanceSnapshotAt || null,
          desco_account_no: balance.accountNo || (user as DbUser).desco_account_no,
          desco_meter_no: balance.meterNo || (user as DbUser).desco_meter_no,
        })
        .eq('id', (user as DbUser).id)
        .select('*')
        .single();
      return json({
        balance: amount,
        currency: balance.currency || 'BDT',
        stale: Boolean(balance.stale),
        timestampAvailable: balance.timestampAvailable,
        balanceSnapshotAt: balance.balanceSnapshotAt,
        readingTime: balance.readingTime,
        accountNo: updated?.desco_account_no,
        meterNo: updated?.desco_meter_no,
        accountId,
        userStatus: updated?.status,
        canConfigureAlerts: updated?.status === 'APPROVED',
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'NO_ACCOUNT') {
        return json({
          error: 'NO_ACCOUNT',
          message: 'No linked DESCO prepaid account. Link a meter in the DESCO portal first.',
        }, 404);
      }
      if (err instanceof DescoError) {
        return json({ error: 'DESCO', message: err.message, details: err.body }, err.status);
      }
      console.error(err);
      return json({ error: 'SERVER', message: 'Failed to fetch balance' }, 500);
    }
  }

  // --- Admin ---
  if (method === 'POST' && path === '/admin/login') {
    const body = await readJson(req);
    const email = String(body.email || '');
    const password = String(body.password || '');
    const { data: admin } = await sb().from('admins').select('*').eq('email', email).maybeSingle();
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, 401);
    }
    const token = await signToken({ sub: admin.id, role: 'admin', username: admin.email });
    return json({ token, admin: { id: admin.id, email: admin.email } });
  }

  if (method === 'GET' && path === '/admin/users') {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    if (auth.role !== 'admin') return json({ error: 'FORBIDDEN', message: 'Admin only.' }, 403);
    const { data: users, error } = await sb()
      .from('users')
      .select(
        'id,username,status,monitoring_enabled,alert_threshold_bdt,alert_email,desco_account_id,desco_account_no,desco_meter_no,last_balance,last_balance_at,last_alert_at,created_at,updated_at',
      )
      .order('created_at', { ascending: false });
    if (error) return json({ error: 'SERVER', message: error.message }, 500);
    return json({
      users: (users || []).map((u) => ({
        id: u.id,
        username: u.username,
        status: u.status,
        monitoringEnabled: u.monitoring_enabled,
        alertThresholdBdt: u.alert_threshold_bdt,
        alertEmail: u.alert_email,
        descoAccountId: u.desco_account_id,
        descoAccountNo: u.desco_account_no,
        descoMeterNo: u.desco_meter_no,
        lastBalance: u.last_balance,
        lastBalanceAt: u.last_balance_at,
        lastAlertAt: u.last_alert_at,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      })),
    });
  }

  const approveMatch = path.match(/^\/admin\/users\/([^/]+)\/approve$/);
  if (method === 'POST' && approveMatch) {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    if (auth.role !== 'admin') return json({ error: 'FORBIDDEN', message: 'Admin only.' }, 403);
    const { data: user, error } = await sb()
      .from('users')
      .update({ status: 'APPROVED' })
      .eq('id', approveMatch[1])
      .select('id,username,status,monitoring_enabled')
      .single();
    if (error) return json({ error: 'SERVER', message: error.message }, 500);
    return json({
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        monitoringEnabled: user.monitoring_enabled,
      },
    });
  }

  const revokeMatch = path.match(/^\/admin\/users\/([^/]+)\/revoke$/);
  if (method === 'POST' && revokeMatch) {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    if (auth.role !== 'admin') return json({ error: 'FORBIDDEN', message: 'Admin only.' }, 403);
    const { data: user, error } = await sb()
      .from('users')
      .update({ status: 'REVOKED', monitoring_enabled: false })
      .eq('id', revokeMatch[1])
      .select('id,username,status,monitoring_enabled')
      .single();
    if (error) return json({ error: 'SERVER', message: error.message }, 500);
    return json({
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        monitoringEnabled: user.monitoring_enabled,
      },
    });
  }

  return json({ error: 'NOT_FOUND', message: `No route ${method} ${path}` }, 404);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'SERVER', message: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
