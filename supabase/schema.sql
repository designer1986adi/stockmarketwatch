-- Run this once in Supabase: SQL Editor > New query > paste > Run

create table if not exists stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,          -- Yahoo symbol, e.g. RELIANCE.NS
  name text,
  exchange text,                        -- NSE or BSE
  last_price numeric,
  low_3m numeric,                       -- lowest low of the previous ~3 months (excluding today)
  low_3m_date date,
  high_3m numeric,
  low_52w numeric,                      -- lowest low of the last 52 weeks
  avg_52w numeric,                      -- average daily close over the last 52 weeks
  status text,                          -- at_low | near_low | ok | error
  distance_pct numeric,                 -- % above the 3-month low
  last_checked_at timestamptz,
  last_error text,
  last_alert_date date,                 -- IST date of the last alert, to avoid repeats
  last_alert_status text,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id bigint generated always as identity primary key,
  stock_id uuid references stocks(id) on delete cascade,
  symbol text not null,
  kind text not null,                   -- at_low | near_low
  price numeric not null,
  low_3m numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists alerts_created_at_idx on alerts (created_at desc);

-- Lock tables down: no public access. The app uses the service role key on the server.
alter table stocks enable row level security;
alter table alerts enable row level security;

-- Upgrading an existing database? Run these two lines once:
alter table stocks add column if not exists low_52w numeric;
alter table stocks add column if not exists avg_52w numeric;
