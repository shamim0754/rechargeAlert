import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export type DbUser = {
  id: string;
  username: string;
  encrypted_password: string;
  status: string;
  monitoring_enabled: boolean;
  alert_threshold_bdt: number | null;
  alert_email: string | null;
  alerts_per_day: number;
  alert_count_today: number;
  alert_count_date: string | null;
  fcm_token: string | null;
  desco_account_id: number | null;
  desco_account_no: string | null;
  desco_meter_no: string | null;
  last_balance: number | null;
  last_balance_at: string | null;
  last_alert_at: string | null;
  balance_snapshot_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DbAdmin = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
};

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (client) return client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function publicUser(user: DbUser) {
  return {
    id: user.id,
    username: user.username,
    status: user.status,
    monitoringEnabled: user.monitoring_enabled,
    alertThresholdBdt: user.alert_threshold_bdt,
    alertEmail: user.alert_email,
    alertsPerDay: user.alerts_per_day,
    descoAccountId: user.desco_account_id,
    descoAccountNo: user.desco_account_no,
    descoMeterNo: user.desco_meter_no,
    lastBalance: user.last_balance,
    lastBalanceAt: user.last_balance_at,
    balanceSnapshotAt: user.balance_snapshot_at,
    canConfigureAlerts: user.status === 'APPROVED',
  };
}
