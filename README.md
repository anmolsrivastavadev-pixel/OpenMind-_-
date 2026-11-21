# AI Market

A stock-market-style app where people vote on real AI models (GPT-5.2, Claude Opus 5.5, Gemini 3 Pro, …)
and **their votes move the prices**. TradingView-style dark UI. **All money is virtual.**

Nothing is simulated: there are no bot votes and no fake price history. Every model lists at $100.00
and moves only when real signed-in users vote.

## Stack
- **Frontend**: React + Vite + Tailwind + TradingView Lightweight Charts, deployed on **Vercel**
- **Backend**: **Supabase**. Postgres holds all logic (`supabase/migrations`), Auth handles accounts,
  and Realtime pushes price changes to every browser.
- **Price engine**: `public.market_tick()`, run every 5 s by `pg_cron` inside Postgres. No server to host.

## Deploy (about 10 minutes)
1. Create a project at supabase.com.
2. Link it and push the schema and data:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push            # tables, functions, 5-second cron job
   psql "<your db connection string>" -f supabase/seed.sql   # companies + models
   ```
   (Or paste the two migration files and `seed.sql` into the Supabase SQL editor, in order.)
3. Optional bot protection: Supabase → Authentication → Attack Protection → enable CAPTCHA (Cloudflare
   Turnstile), and set `VITE_TURNSTILE_SITE_KEY`.
4. Vercel: import this repo, framework **Vite**, and set the env vars from `.env.example`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Add a rewrite of all paths to `/index.html` (already in `vercel.json`).
5. Supabase → Authentication → URL Configuration: set the Site URL to your Vercel domain.

## Local development
```bash
npm install
npx supabase start      # local Postgres/Auth/Realtime (Docker)
cp .env.example .env.local   # use the API URL + anon key printed by `supabase start`
npm run dev
npm test                # integration tests against the local Supabase
```

## How it works
| Rule | Where |
| --- | --- |
| One vote per user per model per day (exchange calendar day) | `unique(user_id, model_id, date)` + `cast_vote()` |
| Ratings Great +2 … Terrible −2, optional tags | `cast_vote()` |
| New accounts count less: 0.25× (<1 day), 0.5× (<7), 0.8× (<30), then 1× | `age_factor()` |
| Rate limit 10 votes/minute | `cast_vote()` |
| Live move per tick: `sign(net) × min(2%, 0.25% × log10(1+|net|))` | `apply_tick()` |
| Close: lock the price, write the daily candle, start the queue | `market_close()` |
| Open: queued votes are applied as one gap, `min(15%, 2.5% × log10(1+|net|))` | `market_open()` |
| Weekends: closed Sat/Sun, votes queue for Monday's gap | `market_status()` |
| Company price = Σ model price × index weight | `company_quotes` view |
| Buy/sell with $10,000 virtual cash, only while open | `place_trade()` |

`net` = Σ rating × account weight, so the move grows with both sentiment and vote volume.
All writes go through these functions; Row Level Security makes tables read-only and votes private.

### Market clock and time zones
Everyone trades on one shared exchange clock (`market_config.tz`, default `America/New_York`,
8:00 AM–8:00 PM, Mon–Fri), so everybody sees the same price at the same moment. Every
time in the UI (hours, countdowns, chart axis) is shown in the **viewer's own time zone**.
Change the exchange zone or hours with
`update market_config set tz='Asia/Kolkata', open_hour=8, close_hour=20;`.

### Admin
- Holidays/maintenance: `update market_config set force_status='afterhours';` (`null` = normal clock).
- New model release: `insert into models (id, company_id, name, ticker, index_weight) values (...)`.
  It lists at $100 and appears for everyone right away.
- Tune price sensitivity: `tick_k`, `tick_cap`, `gap_k`, `gap_cap` in `market_config`.

## Roadmap
- Phase 3: portfolio page with value chart, weekly/all-time leaderboards.
- Phase 4: model-release events, streak rewards, push "market open" notifications.
