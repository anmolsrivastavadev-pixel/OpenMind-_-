-- AI Market: schema, voting, trading and the price engine.
-- Prices move ONLY from real users' votes. Nothing here is simulated.

-- ---------------------------------------------------------------- config
create table public.market_config (
  id int primary key default 1 check (id = 1),
  tz text not null default 'America/New_York',   -- exchange clock; UI shows it in each user's local time
  open_hour int not null default 8,
  close_hour int not null default 20,
  -- live tick move:  sign(net) * min(tick_cap, tick_k * log10(1 + |net|))
  tick_k numeric not null default 0.0025,
  tick_cap numeric not null default 0.02,
  -- opening gap:     sign(net) * min(gap_cap,  gap_k  * log10(1 + |net|))
  gap_k numeric not null default 0.025,
  gap_cap numeric not null default 0.15,
  -- admin override for holidays / maintenance: 'open' | 'afterhours' | 'weekend' | null
  force_status text check (force_status in ('open', 'afterhours', 'weekend'))
);
insert into public.market_config default values;

create table public.market_state (
  id int primary key default 1 check (id = 1),
  phase text not null default 'closed' check (phase in ('open', 'closed')),
  session_date date,
  opened_at timestamptz,
  closed_at timestamptz,
  last_tick_at timestamptz
);
insert into public.market_state default values;

-- ---------------------------------------------------------------- core tables
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  cash_balance numeric(14, 2) not null default 10000 check (cash_balance >= 0),
  streak int not null default 0,
  best_streak int not null default 0,
  last_vote_date date,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.companies (
  id text primary key,
  name text not null,
  ticker text unique not null,
  color text not null default '#888888',
  sort int not null default 0
);

create table public.models (
  id text primary key,
  company_id text not null references public.companies (id),
  name text not null,
  ticker text unique not null,
  status text not null default 'active' check (status in ('active', 'delisted')),
  index_weight numeric(12, 4) not null,
  ipo_price numeric(14, 2) not null default 100,
  current_price numeric(14, 2) not null default 100,
  prev_close numeric(14, 2) not null default 100,
  last_gap numeric not null default 0,
  last_gap_votes int not null default 0,
  -- public aggregates (individual votes stay private)
  today_count int not null default 0,
  today_net numeric not null default 0,
  today_pos int not null default 0,
  today_neg int not null default 0,
  queue_count int not null default 0,
  queue_net numeric not null default 0,
  queue_pos int not null default 0,
  queue_neg int not null default 0,
  listed_at timestamptz not null default now(),
  sort int not null default 0
);

create table public.votes (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  model_id text not null references public.models (id),
  date date not null, -- exchange calendar day
  rating smallint not null check (rating between -2 and 2),
  weight numeric(4, 2) not null, -- account-age factor at vote time
  tags text[] not null default '{}',
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, model_id, date)
);
create index votes_unapplied on public.votes (model_id) where not applied;
create index votes_user_time on public.votes (user_id, created_at desc);

create table public.price_ticks (
  model_id text not null references public.models (id),
  ts timestamptz not null default now(),
  price numeric(14, 2) not null,
  primary key (model_id, ts)
);

-- 5-minute intraday candles (volume = votes)
create table public.bars (
  model_id text not null references public.models (id),
  ts timestamptz not null,
  open numeric(14, 2) not null,
  high numeric(14, 2) not null,
  low numeric(14, 2) not null,
  close numeric(14, 2) not null,
  volume int not null default 0,
  primary key (model_id, ts)
);

-- daily candles, written at the close
create table public.candles (
  model_id text not null references public.models (id),
  date date not null,
  open numeric(14, 2) not null,
  high numeric(14, 2) not null,
  low numeric(14, 2) not null,
  close numeric(14, 2) not null,
  volume int not null default 0,
  primary key (model_id, date)
);

create table public.holdings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  asset_type text not null check (asset_type in ('company', 'model')),
  asset_id text not null,
  shares int not null check (shares > 0),
  avg_buy_price numeric(14, 2) not null,
  primary key (user_id, asset_type, asset_id)
);

create table public.trades (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  asset_type text not null,
  asset_id text not null,
  side text not null check (side in ('buy', 'sell')),
  shares int not null,
  price numeric(14, 2) not null,
  time timestamptz not null default now()
);

create view public.company_quotes with (security_invoker = true) as
select c.id, c.name, c.ticker, c.color, c.sort,
  round(sum(m.index_weight * m.current_price), 2) as price,
  round(sum(m.index_weight * m.prev_close), 2) as prev_close
from public.companies c
join public.models m on m.company_id = c.id and m.status = 'active'
group by c.id;

-- ---------------------------------------------------------------- helpers
create function public.exchange_date(at timestamptz default now()) returns date
language sql stable as $$
  select (at at time zone (select tz from public.market_config where id = 1))::date
$$;

create function public.market_status(at timestamptz default now()) returns text
language sql stable as $$
  with c as (select * from public.market_config where id = 1),
  l as (select (at at time zone c.tz) as t, c.open_hour, c.close_hour, c.force_status from c)
  select coalesce(force_status, case
    when extract(isodow from t) between 1 and 5
      and extract(hour from t) >= open_hour and extract(hour from t) < close_hour then 'open'
    when extract(isodow from t) in (6, 7) then 'weekend'
    when extract(isodow from t) = 5 and extract(hour from t) >= close_hour then 'weekend'
    when extract(isodow from t) = 1 and extract(hour from t) < open_hour then 'weekend'
    else 'afterhours' end)
  from l
$$;

-- Diminishing returns, but more votes always move the price more.
create function public.move_pct(net numeric, k numeric, cap numeric) returns numeric
language sql immutable as $$
  select sign(net) * least(cap, k * log(1 + abs(net)))
$$;

-- New accounts count less (anti-bot).
create function public.age_factor(age interval) returns numeric
language sql immutable as $$
  select case
    when age < interval '1 day' then 0.25
    when age < interval '7 days' then 0.5
    when age < interval '30 days' then 0.8
    else 1 end
$$;

-- ---------------------------------------------------------------- auth hook
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, created_at)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
          coalesce(new.created_at, now()));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- voting
create function public.cast_vote(p_model text, p_rating int, p_tags text[] default '{}')
returns public.votes
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  d date := public.exchange_date(now());
  w numeric;
  v public.votes;
  recent int;
  is_open boolean;
begin
  if uid is null then raise exception 'Log in to vote'; end if;
  if p_rating is null or p_rating not between -2 and 2 then raise exception 'Invalid rating'; end if;
  select * into prof from public.profiles where id = uid for update;
  if not found then raise exception 'Profile not found'; end if;
  if not exists (select 1 from public.models where id = p_model and status = 'active') then
    raise exception 'Unknown model';
  end if;
  select count(*) into recent from public.votes where user_id = uid and created_at > now() - interval '1 minute';
  if recent >= 10 then raise exception 'Slow down: too many votes in the last minute'; end if;

  w := public.age_factor(now() - prof.created_at);
  begin
    insert into public.votes (user_id, model_id, date, rating, weight, tags)
    values (uid, p_model, d, p_rating, w,
            coalesce((select array_agg(left(t, 30)) from unnest(p_tags[1:5]) t), '{}'))
    returning * into v;
  exception when unique_violation then
    raise exception 'You already voted on this model today';
  end;

  -- while closed, show the vote in the public after-hours / weekend queue at once
  select phase = 'open' into is_open from public.market_state where id = 1;
  if not is_open then
    update public.models set
      queue_count = queue_count + 1,
      queue_net = queue_net + p_rating * w,
      queue_pos = queue_pos + (p_rating > 0)::int,
      queue_neg = queue_neg + (p_rating < 0)::int
    where id = p_model;
  end if;

  update public.profiles set
    streak = case when last_vote_date = d then streak when last_vote_date = d - 1 then streak + 1 else 1 end,
    best_streak = greatest(best_streak,
      case when last_vote_date = d then streak when last_vote_date = d - 1 then streak + 1 else 1 end),
    last_vote_date = d
  where id = uid;
  return v;
end $$;

-- ---------------------------------------------------------------- price engine
-- Apply every unapplied vote to the live price (market open only).
create function public.apply_tick() returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg public.market_config;
  agg jsonb;
  r jsonb;
  oldp numeric;
  newp numeric;
  bucket timestamptz := date_bin('5 minutes', now(), timestamptz '2000-01-01');
  n int := 0;
begin
  select * into cfg from public.market_config where id = 1;
  with a as (
    update public.votes set applied = true where not applied
    returning model_id, rating, weight
  )
  select jsonb_agg(x) into agg from (
    select model_id, sum(rating * weight) as net, count(*) as cnt,
           count(*) filter (where rating > 0) as pos, count(*) filter (where rating < 0) as neg
    from a group by model_id
  ) x;

  for r in select * from jsonb_array_elements(coalesce(agg, '[]'))
  loop
    select current_price into oldp from public.models where id = r ->> 'model_id' for update;
    newp := greatest(0.01, round(oldp * (1 + public.move_pct((r ->> 'net')::numeric, cfg.tick_k, cfg.tick_cap)), 2));
    update public.models set
      current_price = newp,
      today_count = today_count + (r ->> 'cnt')::int,
      today_net = today_net + (r ->> 'net')::numeric,
      today_pos = today_pos + (r ->> 'pos')::int,
      today_neg = today_neg + (r ->> 'neg')::int
    where id = r ->> 'model_id';
    insert into public.bars as b (model_id, ts, open, high, low, close, volume)
    values (r ->> 'model_id', bucket, oldp, greatest(oldp, newp), least(oldp, newp), newp, (r ->> 'cnt')::int)
    on conflict (model_id, ts) do update set
      high = greatest(b.high, excluded.close),
      low = least(b.low, excluded.close),
      close = excluded.close,
      volume = b.volume + excluded.volume;
    insert into public.price_ticks (model_id, ts, price) values (r ->> 'model_id', now(), newp)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 8 PM: lock the close, write the daily candle; votes start queueing.
create function public.market_close() returns void
language plpgsql security definer set search_path = public as $$
declare
  st public.market_state;
  tz text := (select tz from public.market_config where id = 1);
begin
  select * into st from public.market_state where id = 1;
  insert into public.candles as c (model_id, date, open, high, low, close, volume)
  select m.id, st.session_date,
    coalesce((select b.open from public.bars b where b.model_id = m.id and (b.ts at time zone tz)::date = st.session_date order by b.ts limit 1), m.prev_close),
    greatest(m.current_price, coalesce((select max(b.high) from public.bars b where b.model_id = m.id and (b.ts at time zone tz)::date = st.session_date), m.current_price)),
    least(m.current_price, coalesce((select min(b.low) from public.bars b where b.model_id = m.id and (b.ts at time zone tz)::date = st.session_date), m.current_price)),
    m.current_price,
    coalesce((select sum(b.volume) from public.bars b where b.model_id = m.id and (b.ts at time zone tz)::date = st.session_date), 0)
  from public.models m
  where m.status = 'active' and st.session_date is not null
  on conflict (model_id, date) do update set
    high = excluded.high, low = excluded.low, close = excluded.close, volume = excluded.volume;

  update public.models set queue_count = 0, queue_net = 0, queue_pos = 0, queue_neg = 0;
  update public.market_state set phase = 'closed', closed_at = now() where id = 1;
end $$;

-- 8 AM: apply the overnight/weekend queue as one capped gap, open a new candle.
create function public.market_open() returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg public.market_config;
  agg jsonb;
  m public.models;
  q jsonb;
  g numeric;
  newp numeric;
  v_cnt int;
  today date := public.exchange_date(now());
  bucket timestamptz := date_bin('5 minutes', now(), timestamptz '2000-01-01');
begin
  select * into cfg from public.market_config where id = 1;
  delete from public.candles where date = today; -- re-opening the same day resumes it

  with a as (
    update public.votes set applied = true where not applied
    returning model_id, rating, weight
  )
  select coalesce(jsonb_object_agg(model_id, jsonb_build_object('net', net, 'cnt', cnt)), '{}') into agg
  from (select model_id, sum(rating * weight) as net, count(*) as cnt from a group by model_id) x;

  for m in select * from public.models where status = 'active' for update
  loop
    q := agg -> m.id;
    v_cnt := coalesce((q ->> 'cnt')::int, 0);
    g := public.move_pct(coalesce((q ->> 'net')::numeric, 0), cfg.gap_k, cfg.gap_cap);
    newp := greatest(0.01, round(m.current_price * (1 + g), 2));
    update public.models set
      prev_close = m.current_price,
      current_price = newp,
      last_gap = g,
      last_gap_votes = v_cnt,
      today_count = 0, today_net = 0, today_pos = 0, today_neg = 0,
      queue_count = 0, queue_net = 0, queue_pos = 0, queue_neg = 0
    where id = m.id;
    insert into public.bars as b (model_id, ts, open, high, low, close, volume)
    values (m.id, bucket, newp, newp, newp, newp, v_cnt)
    on conflict (model_id, ts) do update set open = excluded.open, close = excluded.close,
      high = greatest(b.high, excluded.close), low = least(b.low, excluded.close);
  end loop;

  update public.market_state set phase = 'open', session_date = today, opened_at = now() where id = 1;
end $$;

-- Scheduled every few seconds by pg_cron.
create function public.market_tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  st public.market_state;
  s text := public.market_status(now());
begin
  select * into st from public.market_state where id = 1 for update skip locked;
  if not found then return 'busy'; end if;

  if st.phase = 'open' then
    perform public.apply_tick();
    if s <> 'open' or st.session_date <> public.exchange_date(now()) then
      perform public.market_close();
      st.phase := 'closed';
    end if;
  end if;
  if st.phase = 'closed' and s = 'open' then
    perform public.market_open();
  end if;
  update public.market_state set last_tick_at = now() where id = 1;
  return s;
end $$;

-- ---------------------------------------------------------------- trading (virtual)
create function public.asset_price(p_type text, p_id text) returns numeric
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'model' then (select current_price from public.models where id = p_id and status = 'active')
    when 'company' then (select price from public.company_quotes where id = p_id)
  end
$$;

create function public.place_trade(p_type text, p_asset text, p_side text, p_shares int)
returns public.trades
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  price numeric;
  cost numeric;
  h public.holdings;
  t public.trades;
begin
  if uid is null then raise exception 'Log in to trade'; end if;
  if (select phase from public.market_state where id = 1) <> 'open' then
    raise exception 'Market is closed. Trading reopens at the open.';
  end if;
  if p_shares is null or p_shares <= 0 then raise exception 'Enter a whole number of shares'; end if;
  if p_side not in ('buy', 'sell') then raise exception 'Invalid side'; end if;
  price := public.asset_price(p_type, p_asset);
  if price is null then raise exception 'Unknown asset'; end if;
  cost := round(price * p_shares, 2);

  perform 1 from public.profiles where id = uid for update;
  select * into h from public.holdings where user_id = uid and asset_type = p_type and asset_id = p_asset for update;

  if p_side = 'buy' then
    if (select cash_balance from public.profiles where id = uid) < cost then
      raise exception 'Not enough virtual cash';
    end if;
    update public.profiles set cash_balance = cash_balance - cost where id = uid;
    insert into public.holdings as x (user_id, asset_type, asset_id, shares, avg_buy_price)
    values (uid, p_type, p_asset, p_shares, price)
    on conflict (user_id, asset_type, asset_id) do update set
      avg_buy_price = round((x.avg_buy_price * x.shares + cost) / (x.shares + p_shares), 2),
      shares = x.shares + p_shares;
  else
    if h.shares is null or h.shares < p_shares then raise exception 'You do not own that many shares'; end if;
    update public.profiles set cash_balance = cash_balance + cost where id = uid;
    if h.shares = p_shares then
      delete from public.holdings where user_id = uid and asset_type = p_type and asset_id = p_asset;
    else
      update public.holdings set shares = shares - p_shares
      where user_id = uid and asset_type = p_type and asset_id = p_asset;
    end if;
  end if;

  insert into public.trades (user_id, asset_type, asset_id, side, shares, price)
  values (uid, p_type, p_asset, p_side, p_shares, price) returning * into t;
  return t;
end $$;

-- ---------------------------------------------------------------- security
alter table public.market_config enable row level security;
alter table public.market_state enable row level security;
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.models enable row level security;
alter table public.votes enable row level security;
alter table public.price_ticks enable row level security;
alter table public.bars enable row level security;
alter table public.candles enable row level security;
alter table public.holdings enable row level security;
alter table public.trades enable row level security;

create policy "public read" on public.market_config for select using (true);
create policy "public read" on public.market_state for select using (true);
create policy "public read" on public.companies for select using (true);
create policy "public read" on public.models for select using (true);
create policy "public read" on public.price_ticks for select using (true);
create policy "public read" on public.bars for select using (true);
create policy "public read" on public.candles for select using (true);
create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own votes" on public.votes for select using (auth.uid() = user_id);
create policy "own holdings" on public.holdings for select using (auth.uid() = user_id);
create policy "own trades" on public.trades for select using (auth.uid() = user_id);
-- No insert/update policies: all writes go through the functions above.

revoke execute on function public.apply_tick(), public.market_open(), public.market_close(), public.market_tick()
  from public, anon, authenticated;

-- live updates to the browser
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.models, public.bars, public.market_state;
  end if;
end $$;
