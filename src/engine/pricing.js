// Pure price math, shared by the live tick, the open gap and the tests.
import { PRICE } from './config.js';

/** Live tick: pct change from a weighted net sentiment. */
export function tickPct(net) {
  return PRICE.TICK_MAX * Math.tanh(net / PRICE.TICK_SCALE);
}

/** Opening gap from the overnight/weekend queue, capped at ±GAP_MAX. */
export function gapPct(net) {
  const raw = PRICE.GAP_MAX * Math.tanh(net / PRICE.GAP_SCALE);
  return Math.max(-PRICE.GAP_MAX, Math.min(PRICE.GAP_MAX, raw));
}

export const round2 = (x) => Math.round(x * 100) / 100;

/** Company price = weighted index of its models' prices. */
export function companyIndex(models) {
  return round2(models.reduce((s, m) => s + m.indexWeight * m.price, 0));
}

/** Empty sentiment bucket. */
export const emptyBucket = () => ({ net: 0, count: 0, pos: 0, neg: 0, neutral: 0 });

export function addToBucket(b, weight, factor) {
  b.net += weight * factor;
  b.count += 1;
  if (weight > 0) b.pos += 1;
  else if (weight < 0) b.neg += 1;
  else b.neutral += 1;
  return b;
}

/** % of non-neutral votes leaning positive. */
export function positiveShare(b) {
  const directional = b.pos + b.neg;
  return directional ? b.pos / directional : 0.5;
}
