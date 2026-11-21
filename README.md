# AI Market

A stock-market-style app where people vote on AI models and the votes move the prices.
TradingView-style dark UI. **All money is virtual.** Model names are fictional.

## Phase 1 prototype (this branch)

Runs entirely in the browser with simulated data so the UI can be reviewed with no backend.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # price engine / market clock tests
```

What works:
- **Market home**: watchlist (companies + models, live price and % change), company index strip,
  top gainers/losers, market status badge with countdown, after-hours/weekend sentiment table.
- **Model page** (TradingView layout): watchlist | candlestick + volume chart (1D/1W/1M/3M,
  crosshair, OHLC legend) | vote panel, sentiment meter, buy/sell box.
- **Company page**: weighted index chart, model table, aggregated sentiment.
- **Voting**: Great +2 … Terrible −2, optional tags, one vote per model per day,
  account-age weighting (0.25× under 1 day → 1× after 30 days), 10 votes/min rate limit.
- **Market hours** 8:00 AM–8:00 PM ET, Mon–Fri. Closed: price locked, votes queue, and the
  next open applies them as one gap capped at ±15%. Weekend votes all go into Monday's gap.
- **Accounts** (local only): signup with honeypot + arithmetic bot check, login, profile with streak.
- Simulated crowd votes run every 2 s so prices move on their own.
- Buy/sell with $10,000 virtual cash is already wired as a preview (Phase 3 adds portfolio and leaderboard pages).

**Demo clock** (top bar, or Profile on mobile): force *open*, *after-hours* or *weekend* to see each
state without waiting. Switching from closed to open runs the real opening-gap logic.
Profile also has "Age account" buttons to check vote weighting.

## Code map

| Path | What |
| --- | --- |
| `src/engine/config.js` | Market hours, time zone, rating weights, price/gap constants |
| `src/engine/clock.js` | Market-time-zone calendar, status, countdown |
| `src/engine/pricing.js` | Tick move `1.2% × tanh(net/300)`, gap `15% × tanh(net/15000)` |
| `src/engine/engine.js` | Tick job, 8 PM close, 8 AM open/gap, votes, trades, candles |
| `src/engine/seed.js` | Companies, fictional models, ~3 months of generated history |
| `supabase/schema.sql` | Postgres schema for the real backend |

`net` is the account-age-weighted sum of rating weights, so the move grows with both sentiment
and vote volume, with diminishing returns.

## Next phases
2. Move the engine to a Node service + Supabase (schema above), scheduled open/close jobs,
   WebSocket price feed (`engine.subscribe` is the client contract).
3. Portfolio page with value chart, weekly/all-time leaderboards.
4. Model-release events, more streak rewards, polish.
