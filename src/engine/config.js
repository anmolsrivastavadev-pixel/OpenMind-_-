// Central market configuration. Every number that shapes prices lives here.

export const MARKET = {
  // Single fixed time zone shown to everyone.
  timeZone: 'America/New_York',
  tzLabel: 'ET',
  openHour: 8, // 8:00 AM
  closeHour: 20, // 8:00 PM
  barMinutes: 5, // intraday candle size
  tickMs: 2000, // price engine cadence during market hours ("every few seconds")
};

// Rating -> weight
export const RATINGS = [
  { key: 'great', label: 'Great', weight: 2 },
  { key: 'good', label: 'Good', weight: 1 },
  { key: 'okay', label: 'Okay', weight: 0 },
  { key: 'bad', label: 'Bad', weight: -1 },
  { key: 'terrible', label: 'Terrible', weight: -2 },
];
export const RATING_WEIGHT = Object.fromEntries(RATINGS.map((r) => [r.key, r.weight]));

export const TAGS = [
  'fast',
  'slow',
  'buggy',
  'great at coding',
  'creative',
  'accurate',
  'hallucinates',
  'good reasoning',
  'too verbose',
  'cheap',
];

export const PRICE = {
  // Live move per engine tick: pct = TICK_MAX * tanh(net / TICK_SCALE)
  // `net` is the account-age-weighted sum of rating weights, so it grows with
  // BOTH sentiment and volume: 10,000 votes at +0.5 move far more than 50.
  TICK_MAX: 0.012, // at most ±1.2% in one tick
  TICK_SCALE: 300,
  // Overnight / weekend gap at the next open, capped at ±15%.
  GAP_MAX: 0.15,
  GAP_SCALE: 15000,
};

// Anti-bot weighting by account age (days).
export function accountAgeFactor(ageDays) {
  if (ageDays < 1) return 0.25;
  if (ageDays < 7) return 0.5;
  if (ageDays < 30) return 0.8;
  return 1;
}

export const RATE_LIMIT = { votes: 10, windowMs: 60_000 };

export const STARTING_CASH = 10_000;
