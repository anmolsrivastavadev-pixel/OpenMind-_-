// Fake seed data: fictional models under AI-lab companies, plus ~3 months of
// simulated price history so charts have something to show on first load.
import { MARKET } from './config.js';
import {
  marketDate,
  realStatus,
  tradingDaysBack,
  wallAt,
  wallSeconds,
  addDays,
  isTradingDay,
} from './clock.js';
import { round2, emptyBucket, addToBucket } from './pricing.js';

export const COMPANIES = [
  {
    id: 'openai', name: 'OpenAI', ticker: 'OAI', color: '#10a37f', targetIndex: 14000,
    models: [
      { id: 'astra', name: '6.2 Astra', ticker: 'ASTRA', price: 420, share: 0.45, pop: 6 },
      { id: 'sol', name: '6.2 Sol', ticker: 'SOL', price: 380, share: 0.38, pop: 5 },
      { id: 'nova', name: '6.2 Nova Mini', ticker: 'NOVA', price: 160, share: 0.17, pop: 4 },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', ticker: 'ANTH', color: '#d97757', targetIndex: 12500,
    models: [
      { id: 'lyra', name: 'Lyra 5', ticker: 'LYRA', price: 455, share: 0.6, pop: 6 },
      { id: 'swift', name: 'Lyra 5 Swift', ticker: 'SWFT', price: 210, share: 0.4, pop: 4 },
    ],
  },
  {
    id: 'google', name: 'Google DeepMind', ticker: 'GDM', color: '#4285f4', targetIndex: 13200,
    models: [
      { id: 'orion-ultra', name: 'Orion Ultra', ticker: 'ORUL', price: 510, share: 0.5, pop: 5 },
      { id: 'orion-flash', name: 'Orion Flash', ticker: 'ORFL', price: 190, share: 0.3, pop: 5 },
      { id: 'orion-nano', name: 'Orion Nano', ticker: 'ORNA', price: 75, share: 0.2, pop: 3 },
    ],
  },
  {
    id: 'meta', name: 'Meta AI', ticker: 'MAI', color: '#0866ff', targetIndex: 6800,
    models: [
      { id: 'atlas', name: 'Atlas 4', ticker: 'ATLS', price: 260, share: 0.6, pop: 4 },
      { id: 'atlas-lite', name: 'Atlas 4 Lite', ticker: 'ATLT', price: 95, share: 0.4, pop: 3 },
    ],
  },
  {
    id: 'xai', name: 'xAI', ticker: 'XAI', color: '#a1a1aa', targetIndex: 7400,
    models: [{ id: 'vega', name: 'Vega 3', ticker: 'VEGA', price: 330, share: 1, pop: 4 }],
  },
  {
    id: 'mistral', name: 'Mistral', ticker: 'MSTL', color: '#fa520f', targetIndex: 3900,
    models: [
      { id: 'sirocco', name: 'Sirocco Large', ticker: 'SRCO', price: 145, share: 0.7, pop: 3 },
      { id: 'sirocco-s', name: 'Sirocco Small', ticker: 'SRCS', price: 48, share: 0.3, pop: 2 },
    ],
  },
  {
    id: 'deepseek', name: 'DeepSeek', ticker: 'DSK', color: '#4d6bfe', targetIndex: 4600,
    models: [{ id: 'abyss', name: 'Abyss R3', ticker: 'ABYS', price: 172, share: 1, pop: 4 }],
  },
];

// ---------- randomness ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(rand) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function poisson(rand, lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

const BARS_PER_DAY = ((MARKET.closeHour - MARKET.openHour) * 60) / MARKET.barMinutes;
const HISTORY_DAYS = 66; // ~3 months of sessions
const INTRADAY_DAYS = 5; // last week has 5-minute bars

/** Build a complete initial engine state. */
export function buildSeedState(now = new Date(), seed = 42) {
  const rand = mulberry32(seed);
  const status = realStatus(now);
  const today = marketDate(now);
  const openToday = status === 'open';

  // Most recent session that has at least started.
  let lastSession = today;
  if (!openToday) {
    // after close today counts; before open (or weekend) use previous trading day
    const nowWall = wallSeconds(now);
    const closedToday = isTradingDay(today) && nowWall >= wallAt(today, MARKET.closeHour);
    if (!closedToday) {
      lastSession = addDays(today, -1);
      while (!isTradingDay(lastSession)) lastSession = addDays(lastSession, -1);
    }
  }
  const days = tradingDaysBack(lastSession, HISTORY_DAYS);
  const intradayDays = new Set(days.slice(-INTRADAY_DAYS));
  const nowWall = wallSeconds(now);

  const companies = {};
  const models = {};
  const daily = {};
  const intraday = {};
  const queue = {};
  const today_ = {};

  for (const c of COMPANIES) {
    companies[c.id] = { id: c.id, name: c.name, ticker: c.ticker, color: c.color, modelIds: c.models.map((m) => m.id) };
    for (const m of c.models) {
      // indexWeight chosen so the company index lands near its target.
      const indexWeight = round2((c.targetIndex * m.share) / m.price);

      // 1) Daily closes as a random walk, rescaled to end at the seed price.
      const vol = 0.012 + rand() * 0.012;
      const drift = (rand() - 0.45) * 0.004;
      const raw = [1];
      for (let i = 1; i < days.length; i++) raw.push(raw[i - 1] * (1 + drift + gauss(rand) * vol));
      const k = m.price / raw[raw.length - 1];
      const closes = raw.map((x) => x * k);

      const dBars = [];
      const iBars = [];
      let prevClose = closes[0] * (1 - drift);
      for (let i = 0; i < days.length; i++) {
        const date = days[i];
        const close = closes[i];
        const open = prevClose * (1 + gauss(rand) * vol * 0.35); // overnight gap
        const dayVotes = Math.round(m.pop * 9000 * (0.6 + rand() * 0.9));

        if (intradayDays.has(date)) {
          const isLive = openToday && date === today;
          const startT = wallAt(date, MARKET.openHour);
          const nBars = isLive
            ? Math.max(1, Math.floor((nowWall - startT) / (MARKET.barMinutes * 60)) + 1)
            : BARS_PER_DAY;
          // walk then bridge so the session ends exactly at `close`
          const steps = [open];
          const sv = vol / Math.sqrt(BARS_PER_DAY);
          for (let b = 1; b <= nBars; b++) steps.push(steps[b - 1] * (1 + gauss(rand) * sv));
          const target = isLive ? steps[nBars] : close;
          const fix = target - steps[nBars];
          for (let b = 0; b <= nBars; b++) steps[b] += (fix * b) / nBars;
          const bars = [];
          for (let b = 0; b < nBars; b++) {
            const o = steps[b];
            const c2 = steps[b + 1];
            const wig = Math.abs(gauss(rand)) * sv * 0.6;
            bars.push({
              time: startT + b * MARKET.barMinutes * 60,
              open: round2(o),
              high: round2(Math.max(o, c2) * (1 + wig)),
              low: round2(Math.min(o, c2) * (1 - wig)),
              close: round2(c2),
              volume: Math.round((dayVotes / BARS_PER_DAY) * (0.4 + rand() * 1.2)),
            });
          }
          iBars.push(...bars);
          if (!isLive) dBars.push(aggregate(date, bars));
          prevClose = isLive ? prevClose : bars[bars.length - 1].close;
          if (isLive) closes[i] = bars[bars.length - 1].close;
        } else {
          const wig = Math.abs(gauss(rand)) * vol * 0.7;
          dBars.push({
            time: date,
            open: round2(open),
            high: round2(Math.max(open, close) * (1 + wig)),
            low: round2(Math.min(open, close) * (1 - wig)),
            close: round2(close),
            volume: dayVotes,
          });
          prevClose = close;
        }
      }

      const lastBar = iBars[iBars.length - 1];
      const price = lastBar.close;
      const prevSessionClose = openToday ? dBars[dBars.length - 1].close : dBars[dBars.length - 2].close;

      models[m.id] = {
        id: m.id,
        companyId: c.id,
        name: m.name,
        ticker: m.ticker,
        status: 'active',
        indexWeight,
        pop: m.pop,
        price,
        prevClose: prevSessionClose,
        lastGap: 0,
        bias: gauss(rand) * 0.05,
        // after-hours mood can differ from the daytime mood
        nightBias: gauss(rand) * 0.08,
      };
      daily[m.id] = dBars;
      intraday[m.id] = iBars;
      today_[m.id] = emptyBucket();
      queue[m.id] = emptyBucket();

      // 2) If we start while closed, pretend the crowd has been voting since close.
      if (!openToday) {
        const closedSince = wallAt(lastSession, MARKET.closeHour);
        const hours = Math.max(0, (nowWall - closedSince) / 3600);
        const n = Math.round(hours * 1800 * m.pop * 0.15);
        fillBucketApprox(queue[m.id], n, models[m.id].nightBias, rand);
      }
    }
  }

  return {
    version: 1,
    seededAt: now.getTime(),
    phase: openToday ? 'open' : 'closed',
    sessionDate: openToday ? today : lastSession,
    companies,
    models,
    daily,
    intraday,
    todayVotes: today_,
    queue,
    users: {},
    sessionUserId: null,
    votes: [],
    holdings: [],
    trades: [],
    clockMode: 'live',
  };
}

export function aggregate(date, bars) {
  return {
    time: date,
    open: bars[0].open,
    high: Math.max(...bars.map((b) => b.high)),
    low: Math.min(...bars.map((b) => b.low)),
    close: bars[bars.length - 1].close,
    volume: bars.reduce((s, b) => s + b.volume, 0),
  };
}

/** Sample a single crowd rating weight in [-2, 2] for a mood `bias`. */
export function sampleRating(rand, bias) {
  return Math.max(-2, Math.min(2, Math.round(bias * 2 + gauss(rand) * 1.1)));
}

/** Fill a bucket with `n` crowd votes without sampling each one. */
export function fillBucketApprox(bucket, n, bias, rand) {
  if (n <= 0) return bucket;
  if (n < 200) {
    for (let i = 0; i < n; i++) addToBucket(bucket, sampleRating(rand, bias), 1);
    return bucket;
  }
  // estimate the rating distribution from a sample, then scale up
  const S = 400;
  const tmp = emptyBucket();
  for (let i = 0; i < S; i++) addToBucket(tmp, sampleRating(rand, bias), 1);
  const f = n / S;
  bucket.net += tmp.net * f;
  bucket.count += n;
  bucket.pos += Math.round(tmp.pos * f);
  bucket.neg += Math.round(tmp.neg * f);
  bucket.neutral += Math.round(tmp.neutral * f);
  return bucket;
}
