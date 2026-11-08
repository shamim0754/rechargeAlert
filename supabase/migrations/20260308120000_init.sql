-- RechargeAlert schema on Supabase (Postgres)

create extension if not exists "pgcrypto";

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  encrypted_password text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REVOKED')),
  monitoring_enabled boolean not null default false,
  alert_threshold_bdt double precision,
  alert_email text,
  alerts_per_day integer not null default 1,
  alert_count_today integer not null default 0,
  alert_count_date text,
  fcm_token text,
  desco_account_id integer,
  desco_account_no text,
  desco_meter_no text,
  last_balance double precision,
  last_balance_at timestamptz,
  last_alert_at timestamptz,
  balance_snapshot_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_status_monitoring_idx
  on public.users (status, monitoring_enabled);

-- Persist DESCO cookie jars across Edge Function cold starts
create table if not exists public.desco_sessions (
  username text primary key,
  cookies_json text not null default '[]',
  password_fingerprint text,
  updated_at timestamptz not null default now()
);

create table if not exists public.register_sessions (
  id text primary key,
  username text not null,
  cookies_json text not null default '[]',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Service role only (Edge Functions). Lock down direct client access.
alter table public.admins enable row level security;
alter table public.users enable row level security;
alter table public.desco_sessions enable row level security;
alter table public.register_sessions enable row level security;

-- Seed default admin (password: admin123) — change after first login
insert into public.admins (email, password_hash)
values (
  'admin@rechargealert.local',
  '$2b$10$t3MlyO9.2dhTRbUxpzXraejk724CBn4r5AvYUQj.iI5lsRBnZ7dzm'
)
on conflict (email) do nothing;
