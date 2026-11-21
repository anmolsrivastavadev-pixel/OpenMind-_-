// Mirrors public.move_pct in the database, used for the "projected gap" meter.
export function movePct(net, k, cap) {
  return Math.sign(net) * Math.min(cap, k * Math.log10(1 + Math.abs(net)));
}
export const gapPct = (net, cfg) => movePct(net, Number(cfg.gap_k), Number(cfg.gap_cap));

export const round2 = (x) => Math.round(x * 100) / 100;

/** % of directional votes leaning positive. */
export function positiveShare(pos, neg) {
  return pos + neg ? pos / (pos + neg) : 0.5;
}

export const RATINGS = [
  { value: 2, key: 'great', label: 'Great' },
  { value: 1, key: 'good', label: 'Good' },
  { value: 0, key: 'okay', label: 'Okay' },
  { value: -1, key: 'bad', label: 'Bad' },
  { value: -2, key: 'terrible', label: 'Terrible' },
];
export const ratingOf = (v) => RATINGS.find((r) => r.value === v);

export const TAGS = ['fast', 'slow', 'buggy', 'great at coding', 'creative', 'accurate', 'hallucinates', 'good reasoning', 'too verbose', 'cheap'];

export function accountAgeFactor(ageDays) {
  if (ageDays < 1) return 0.25;
  if (ageDays < 7) return 0.5;
  if (ageDays < 30) return 0.8;
  return 1;
}
