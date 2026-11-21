-- AI Market: Postgres (Supabase) schema. Target for Phase 2+ backend.
-- The Phase-1 prototype runs the same logic in the browser (src/engine).

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  cash_balance numeric(14,2) not null default 10000,
  streak int not null default 0,
  best_streak int not null default 0,
  last_vote_date date,
  created_at timestamptz not null default now()
);

create table companies (
  id text primary key,
  name text not null,
  ticker text unique not null
);

create table models (
  id text primary key,
  company_id text not null references companies(id),
  name text not null,
  ticker text unique not null,
  index_weight numeric(10,4) not null,
  current_price numeric(14,2) not null,
  prev_close numeric(14,2) not null,
  status text not null default 'active'
);

create table votes (
  id bigserial primary key,
  user_id uuid not null references users(id),
  model_id text not null references models(id),
  date date not null,              -- market-local (America/New_York) calendar day
  rating smallint not null check (rating between -2 and 2),
  weight numeric(4,2) not null,    -- account-age factor at vote time
  tags text[] not null default '{}',
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, model_id, date)
);
create index votes_unapplied on votes (model_id) where not applied;

create table price_ticks (
  model_id text not null references models(id),
  ts timestamptz not null,
  price numeric(14,2) not null,
  primary key (model_id, ts)
);

create table candles (
  model_id text not null references models(id),
  date date not null,
  open numeric(14,2) not null,
  high numeric(14,2) not null,
  low numeric(14,2) not null,
  close numeric(14,2) not null,
  volume bigint not null,
  primary key (model_id, date)
);

create table holdings (
  user_id uuid not null references users(id),
  asset_type text not null check (asset_type in ('company','model')),
  asset_id text not null,
  shares numeric(14,4) not null,
  avg_buy_price numeric(14,2) not null,
  primary key (user_id, asset_type, asset_id)
);

create table trades (
  id bigserial primary key,
  user_id uuid not null references users(id),
  asset_type text not null,
  asset_id text not null,
  side text not null check (side in ('buy','sell')),
  shares numeric(14,4) not null,
  price numeric(14,2) not null,
  time timestamptz not null default now()
);
